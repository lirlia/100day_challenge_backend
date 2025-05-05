'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-toastify';
import KanbanBoard from '@/components/kanban-board';
import { useUserStore } from '@/lib/store';
import Modal from '@/components/modal';
import TaskForm from '@/components/task-form';
import { WorkflowDetail, Task, TaskDependency, TaskFormData, User as LibUser } from '@/lib/types';

function formatDateTime(isoString: string | null): string {
    if (!isoString) return 'N/A';
    try {
        return new Date(isoString).toLocaleString('ja-JP', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (e) { return 'Invalid Date'; }
}

export default function WorkflowDetailPage() {
    const params = useParams();
    const router = useRouter();
    const workflowId = params?.workflowId as string | undefined;
    const workflowIdNumber = workflowId ? parseInt(workflowId, 10) : NaN;
    const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { users: userListFromStore, fetchUsers: fetchUserList } = useUserStore();
    const userList: LibUser[] = userListFromStore as LibUser[];

    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskModalMode, setTaskModalMode] = useState<'create' | 'edit'>('create');
    const [editingTaskData, setEditingTaskData] = useState<Task | null>(null);
    const [isSubmittingTask, setIsSubmittingTask] = useState(false);
    const [taskSubmitError, setTaskSubmitError] = useState<string | null>(null);

    useEffect(() => { fetchUserList(); }, [fetchUserList]);

    const fetchWorkflowDetail = useCallback(async (showLoading = true) => {
        if (isNaN(workflowIdNumber)) { setError('Invalid Workflow ID.'); setIsLoading(false); return; }
        if (showLoading) setIsLoading(true);
        try {
            const response = await fetch(`/api/workflows/${workflowIdNumber}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to fetch workflow details (${response.status})`);
            }
            const data = await response.json() as WorkflowDetail;
            setWorkflow(data);
            setError(null);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error fetching workflow details';
            console.error(`Error fetching details:`, errorMessage);
            setError(errorMessage);
        } finally {
            if (showLoading) setIsLoading(false);
        }
    }, [workflowIdNumber]);

    useEffect(() => { fetchWorkflowDetail(true); }, [fetchWorkflowDetail]);

    const handleTaskStatusChange = useCallback(async (taskId: number, newStatus: Task['status']) => {
        const originalWorkflow = workflow ? { ...workflow, tasks: [...workflow.tasks] } : null;
        setWorkflow((prev: WorkflowDetail | null): WorkflowDetail | null => {
            if (!prev) {
                return null;
            }
            const taskIndex = prev.tasks.findIndex((t: Task) => t.id === taskId);

            if (taskIndex === -1 || prev.tasks[taskIndex].status === newStatus) {
                return prev;
            }
            const newTasks = [...prev.tasks];
            newTasks[taskIndex] = { ...newTasks[taskIndex], status: newStatus, updated_at: new Date().toISOString() };
            const newCompletedCount = newTasks.filter((t: Task) => t.status === 'completed').length;
            return { ...prev, tasks: newTasks, completed_tasks: newCompletedCount };
        });
        setError(null);

        try {
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `API Error (${response.status})`);
            }
            toast.success(`Task status updated to ${newStatus}.`);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error updating task status';
            setError(`Failed to update task ${taskId}: ${errorMessage}`);
            setWorkflow(originalWorkflow);
            toast.error(`Failed to update status: ${errorMessage}`);
        }
    }, [workflow, fetchWorkflowDetail]);

    const handleTaskCreate = async (formData: TaskFormData) => {
        if (isNaN(workflowIdNumber)) throw new Error('Workflow ID is invalid.');
        const body = {
            name: formData.name,
            description: formData.description || null,
            assigned_user_id: formData.assigned_user_id,
            due_date: formData.due_date || null,
        };
        const response = await fetch(`/api/workflows/${workflowIdNumber}/tasks`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to create task (${response.status})`);
        }
        await fetchWorkflowDetail(false);
    };

    const handleTaskUpdate = async (taskId: number, formData: Partial<TaskFormData>) => {
         const body = {
             name: formData.name,
             description: formData.description === undefined ? undefined : (formData.description || null),
             assigned_user_id: formData.assigned_user_id,
             due_date: formData.due_date === undefined ? undefined : (formData.due_date || null),
         };
         const response = await fetch(`/api/tasks/${taskId}`, {
             method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
         });
         if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData.error || `Failed to update task (${response.status})`);
         }
         await fetchWorkflowDetail(false);
     };

    const handleTaskDelete = async (taskId: number) => {
        const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
             if (response.status === 400 && errorData.error?.includes('depend')) {
                 throw new Error(errorData.error);
             }
            throw new Error(errorData.error || `Failed to delete task (${response.status})`);
        }
        await fetchWorkflowDetail(false);
    };

    const handleDependencyAdd = async (taskId: number, dependsOnTaskId: number) => {
         const response = await fetch(`/api/tasks/${taskId}/dependencies`, {
             method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ depends_on_task_id: dependsOnTaskId }),
         });
         if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData.error || `Failed to add dependency (${response.status})`);
         }
         await fetchWorkflowDetail(false);
     };

    const handleDependencyDelete = async (taskId: number, dependsOnTaskId: number) => {
        const response = await fetch(`/api/tasks/${taskId}/dependencies/${dependsOnTaskId}`, { method: 'DELETE' });
         if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData.error || `Failed to delete dependency (${response.status})`);
         }
        await fetchWorkflowDetail(false);
    };

    const openCreateTaskModal = () => {
        setEditingTaskData(null); setTaskModalMode('create');
        setTaskSubmitError(null); setIsSubmittingTask(false); setIsTaskModalOpen(true);
    };
    const openEditTaskModal = (task: Task) => {
         setEditingTaskData(task); setTaskModalMode('edit');
         setTaskSubmitError(null); setIsSubmittingTask(false); setIsTaskModalOpen(true);
    };
    const closeTaskModal = () => { setIsTaskModalOpen(false); };

    const handleTaskSubmit = async (formData: TaskFormData) => {
        setIsSubmittingTask(true); setTaskSubmitError(null);
        try {
            if (taskModalMode === 'create') {
                await handleTaskCreate(formData); toast.success(`Task "${formData.name}" created.`);
            } else if (editingTaskData) {
                await handleTaskUpdate(editingTaskData.id, formData); toast.success(`Task "${formData.name}" updated.`);
            }
            closeTaskModal();
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : `Unknown error ${taskModalMode}ing task`;
            setTaskSubmitError(errorMessage);
        } finally { setIsSubmittingTask(false); }
    };

    const taskFormInitialDataForModal: (Partial<TaskFormData> & { id?: number }) | undefined = editingTaskData ? {
         id: editingTaskData.id, name: editingTaskData.name, description: editingTaskData.description ?? '',
         assigned_user_id: editingTaskData.assigned_user_id,
         due_date: editingTaskData.due_date ? editingTaskData.due_date.split('T')[0].split(' ')[0] : '',
     } : undefined;

    if (isLoading && !workflow) { return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div></div>; }
    if (!workflow) {
        return ( <div className="text-center p-8"> <p className="text-red-500 dark:text-red-400 text-xl mb-4">Error loading workflow</p> <p className="text-gray-600 dark:text-gray-400 mb-6">{error || 'Could not retrieve workflow data.'}</p> <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">&larr; Back to Workflows List</Link> </div> );
    }

    const dummyOnTaskCreate = async (data: TaskFormData): Promise<void> => {
        console.warn("onTaskCreate called from KanbanBoard unexpectedly, using page handler", data);
    };

    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            {/* Workflow Header */}
            <div className="mb-8 p-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-xl shadow-lg border border-white/30 dark:border-gray-700/40">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{workflow.name}</h1>
                        <p className="text-sm text-gray-600 dark:text-gray-400"> Created by {workflow.creator_name ?? 'Unknown'} on {formatDateTime(workflow.created_at)} <span className="mx-2">|</span> Last updated: {formatDateTime(workflow.updated_at)} </p>
                    </div>
                    <div className="flex space-x-2 flex-shrink-0">
                        <button className="px-3 py-1.5 text-sm bg-yellow-500 hover:bg-yellow-600 text-white rounded-md shadow disabled:opacity-50" disabled>Edit WF</button>
                        <button className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md shadow disabled:opacity-50" disabled>Delete WF</button>
                        <button onClick={openCreateTaskModal} className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition duration-150 ease-in-out disabled:opacity-50" disabled={isLoading}> Add Task </button>
                    </div>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mb-4">{workflow.description || <span className="italic">No description.</span>}</p>
                {error && <p className="text-red-500 dark:text-red-400 text-sm mt-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded">Error: {error}</p>}
            </div>

            {/* Kanban Board Area */}
            <KanbanBoard
                tasks={workflow.tasks} dependencies={workflow.dependencies} users={userList}
                onTaskStatusChange={handleTaskStatusChange}
                onTaskUpdate={handleTaskUpdate} onTaskDelete={handleTaskDelete}
                onDependencyAdd={handleDependencyAdd} onDependencyDelete={handleDependencyDelete}
                onTaskCreate={dummyOnTaskCreate}
            />

            {/* Task Create/Edit Modal */}
            <Modal isOpen={isTaskModalOpen} onClose={closeTaskModal} title={taskModalMode === 'create' ? 'Create New Task' : `Edit Task "${editingTaskData?.name ?? ''}"`}>
                <TaskForm
                    onSubmit={handleTaskSubmit} onCancel={closeTaskModal}
                    initialData={taskFormInitialDataForModal} users={userList}
                    isSubmitting={isSubmittingTask} submitError={taskSubmitError}
                />
            </Modal>
        </div>
    );
}
