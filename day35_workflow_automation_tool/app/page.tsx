'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/lib/store';
import Modal from '@/components/modal';
import WorkflowForm from '@/components/workflow-form';

// APIレスポンスの型 (GET /api/workflows)
interface WorkflowWithStats {
  id: number;
  name: string;
  description: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  creator_name: string | null;
  total_tasks: number;
  completed_tasks: number;
}

// 日時フォーマット関数
function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('ja-JP', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    return 'Invalid Date';
  }
}

// 進捗バーコンポーネント
function ProgressBar({ value, max }: { value: number; max: number }) {
    const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
            <div
                className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${percentage}%` }}
            ></div>
        </div>
    );
}

// ワークフローカードコンポーネント
function WorkflowCard({ workflow }: { workflow: WorkflowWithStats }) {
    const progressValue = workflow.total_tasks > 0 ? workflow.completed_tasks / workflow.total_tasks : 0;
    const truncatedDescription = workflow.description
        ? workflow.description.length > 80
            ? `${workflow.description.substring(0, 80)}...`
            : workflow.description
        : 'No description';

    return (
        <Link
            href={`/workflows/${workflow.id}`}
            className="block p-6 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl shadow-lg border border-white/30 dark:border-gray-700/30 hover:shadow-xl transition-shadow duration-300 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600"
        >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 truncate">{workflow.name}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 h-10 overflow-hidden">{truncatedDescription}</p>
            <div className="mb-4">
                <ProgressBar value={workflow.completed_tasks} max={workflow.total_tasks} />
                <p className="text-xs text-right text-gray-500 dark:text-gray-400 mt-1">
                    {workflow.completed_tasks} / {workflow.total_tasks} tasks completed
                </p>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                <span>Created by: {workflow.creator_name ?? 'Unknown'}</span>
                <span>{formatDateTime(workflow.created_at)}</span>
            </div>
        </Link>
    );
}

// ワークフロー一覧ページ本体
export default function HomePage() {
  const [workflows, setWorkflows] = useState<WorkflowWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedUserId = useUserStore((state) => state.selectedUserId);

  // State for modal and form
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Memoized fetch function
  const fetchWorkflows = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('[Page] Fetching workflows...');
      const response = await fetch('/api/workflows');
      if (!response.ok) {
        throw new Error(`Failed to fetch workflows: ${response.statusText}`);
      }
      const data = await response.json() as WorkflowWithStats[];
      console.log('[Page] Workflows fetched successfully:', data);
      setWorkflows(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error fetching workflows';
      console.error('[Page] Error fetching workflows:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array, fetch once on mount

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]); // Use memoized function

  // Modal control functions
  const openModal = () => {
      if (!selectedUserId) {
          alert('Please select a user first to create a workflow.'); // Simple alert for now
          return;
      }
      setSubmitError(null); // Clear previous errors
      setIsModalOpen(true);
  }
  const closeModal = () => setIsModalOpen(false);

  // Form submission handler
  const handleCreateWorkflow = async (formData: { name: string; description: string }) => {
      if (!selectedUserId) {
          setSubmitError('Cannot create workflow without a selected user.');
          return;
      }
      setIsSubmitting(true);
      setSubmitError(null);
      try {
          console.log('[Page] Creating workflow:', formData);
          const response = await fetch('/api/workflows', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...formData, created_by_user_id: selectedUserId }),
          });

          if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || `Failed to create workflow: ${response.statusText}`);
          }

          console.log('[Page] Workflow created successfully.');
          closeModal();
          await fetchWorkflows(); // Re-fetch the list

      } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error creating workflow';
          console.error('[Page] Error creating workflow:', errorMessage);
          setSubmitError(errorMessage);
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Workflows</h1>
        <button
            onClick={openModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedUserId || isLoading}
        >
          Create New Workflow
        </button>
      </div>

      {isLoading && <p className="text-center text-gray-500 dark:text-gray-400">Loading workflows...</p>}
      {error && !isLoading && workflows.length === 0 && <p className="text-center text-red-500">Error fetching workflows: {error}</p>}

      {!isLoading && workflows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map((workflow) => (
              <WorkflowCard key={workflow.id} workflow={workflow} />
            ))}
        </div>
      )}

      {!isLoading && workflows.length === 0 && !error && (
           <p className="text-center text-gray-500 dark:text-gray-400 col-span-full pt-10">No workflows found. Click 'Create New Workflow' to get started.</p>
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} title="Create New Workflow">
          <WorkflowForm
              onSubmit={handleCreateWorkflow}
              onCancel={closeModal}
              isSubmitting={isSubmitting}
              submitError={submitError}
          />
      </Modal>
    </div>
  );
}
