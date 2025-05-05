'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation'; // Use hook for client components
import Link from 'next/link';
import KanbanBoard from '@/components/kanban-board'; // Import the KanbanBoard component
import { useUserStore } from '@/lib/store'; // Import user store if needed for actions

// --- Types (align with API response) ---
interface Task {
    id: number;
    workflow_id: number;
    name: string;
    description: string | null;
    assigned_user_id: number | null;
    assigned_user_name: string | null;
    due_date: string | null;
    status: 'pending' | 'in_progress' | 'completed' | 'on_hold';
    order_index: number;
    created_at: string;
    updated_at: string;
}

interface TaskDependency {
    task_id: number;
    depends_on_task_id: number;
}

interface WorkflowDetail {
    id: number;
    name: string;
    description: string | null;
    created_by_user_id: number | null;
    created_at: string;
    updated_at: string;
    creator_name: string | null;
    total_tasks: number;
    completed_tasks: number;
    tasks: Task[];
    dependencies: TaskDependency[];
}

// --- Helper Functions ---
function formatDateTime(isoString: string | null): string {
    if (!isoString) return 'N/A';
    try {
        return new Date(isoString).toLocaleString('ja-JP', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return 'Invalid Date';
    }
}

// --- Main Component ---
export default function WorkflowDetailPage() {
    const params = useParams();
    const workflowId = params?.workflowId as string | undefined;
    const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [optimisticTasks, setOptimisticTasks] = useState<Task[] | null>(null);

    // Memoized fetch function
    const fetchWorkflowDetail = useCallback(async () => {
        if (!workflowId) {
             setError('Workflow ID is missing.');
             setIsLoading(false);
             return;
        }
        // Keep loading state true while fetching, reset optimistic updates
        setIsLoading(true);
        setOptimisticTasks(null);
        setError(null);
        try {
            console.log(`[Page][Workflow ${workflowId}] Fetching details...`);
            const response = await fetch(`/api/workflows/${workflowId}`);
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Workflow not found.');
                } else {
                    const errorData = await response.json().catch(() => ({})); // Try to parse error
                    throw new Error(errorData.error || `Failed to fetch workflow details: ${response.statusText}`);
                }
            }
            const data = await response.json() as WorkflowDetail;
            console.log(`[Page][Workflow ${workflowId}] Details fetched successfully:`, data);
            setWorkflow(data);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error fetching workflow details';
            console.error(`[Page][Workflow ${workflowId}] Error fetching details:`, errorMessage);
            setError(errorMessage);
            setWorkflow(null); // Clear workflow data on error
        } finally {
            setIsLoading(false);
        }
    }, [workflowId]); // Dependency is workflowId

    useEffect(() => {
        fetchWorkflowDetail();
    }, [fetchWorkflowDetail]); // Use the memoized function

    // --- Task Status Change Handler ---
    const handleTaskStatusChange = useCallback(async (taskId: number, newStatus: Task['status']) => {
        console.log(`[Page][Workflow ${workflowId}] Attempting to update task ${taskId} status to ${newStatus}`);

        // Find the original task
        const originalTasks = workflow?.tasks || [];
        const taskToUpdate = originalTasks.find(t => t.id === taskId);
        if (!taskToUpdate || taskToUpdate.status === newStatus) {
            console.log('[Page] Task not found or status unchanged.');
            return; // No change needed
        }

        // --- Optimistic Update ---
        const previousTasks = workflow?.tasks ?? [];
        const updatedTasks = previousTasks.map(t =>
            t.id === taskId ? { ...t, status: newStatus } : t
        );
        setOptimisticTasks(updatedTasks); // Apply optimistic update
        // Note: This simple update doesn't reorder the task immediately within the new column
        // A more complex optimistic update would also adjust order_index if needed.

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`[API Error][PUT /api/tasks/${taskId}] Failed to update status:`, errorData);
                throw new Error(errorData.error || `Failed to update task status (${response.status})`);
            }

            const updatedTask = await response.json() as Task;
            console.log(`[Page][Workflow ${workflowId}] Task ${taskId} status updated successfully via API.`);

            // --- Sync with server response (or refetch) ---
            // Refetching is simpler and ensures consistency
            fetchWorkflowDetail();
            // Or, update the state more precisely based on updatedTask (more complex)
            // setWorkflow(prev => prev ? ({
            //     ...prev,
            //     tasks: prev.tasks.map(t => t.id === taskId ? updatedTask : t)
            // }) : null);
            // setOptimisticTasks(null); // Clear optimistic state after successful API call and state update

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error updating task status';
            console.error(`[Page][Workflow ${workflowId}] Error updating task ${taskId}:`, errorMessage);
            setError(`Failed to update task ${taskId}: ${errorMessage}`);
            // --- Revert Optimistic Update ---
            setOptimisticTasks(null); // Revert to original state from `workflow`
            // Optionally show a more prominent error message to the user
        }
    }, [workflow, workflowId, fetchWorkflowDetail]); // Include fetchWorkflowDetail

    // Determine which tasks to display (optimistic or actual)
    const displayTasks = optimisticTasks ?? workflow?.tasks ?? [];

    if (isLoading && !workflow) { // Show loading only if workflow is not yet loaded
        return <p className="text-center text-gray-500 dark:text-gray-400">Loading workflow details...</p>;
    }

    if (error && !workflow) { // Show error only if workflow failed to load initially
        return (
            <div className="text-center">
                 <p className="text-red-500 mb-4">Error: {error}</p>
                 <Link href="/" className="text-blue-600 hover:underline">Back to Workflows</Link>
            </div>
        );
    }

    if (!workflow) {
        // This case should ideally be covered by the error state if fetch fails
        return <p className="text-center text-gray-500 dark:text-gray-400">Workflow data not available.</p>;
    }

    return (
        <div>
            {/* Workflow Header */}
            <div className="mb-8 p-6 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl shadow-lg border border-white/30 dark:border-gray-700/30">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{workflow.name}</h1>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Created by {workflow.creator_name ?? 'Unknown'} on {formatDateTime(workflow.created_at)}</p>
                    </div>
                    <div className="flex space-x-2">
                        <button className="px-3 py-1.5 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded-md shadow disabled:opacity-50" disabled={isLoading}>Edit</button> {/* TODO: Implement Edit */}
                        <button className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md shadow disabled:opacity-50" disabled={isLoading}>Delete</button> {/* TODO: Implement Delete */}
                    </div>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mb-4">{workflow.description || 'No description provided.'}</p>
                 <div className="flex justify-end">
                     <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50" disabled={isLoading}>
                        Add New Task
                    </button> {/* TODO: Implement Add Task Modal */}
                 </div>
                 {/* Display API errors related to updates here */}
                 {error && !isLoading && <p className="text-red-500 text-sm mt-4">Update Error: {error}</p>}
            </div>

            {/* Kanban Board Area - Pass displayTasks and dependencies */}
            <KanbanBoard
                tasks={displayTasks}
                dependencies={workflow.dependencies}
                onTaskStatusChange={handleTaskStatusChange}
            />
        </div>
    );
}
