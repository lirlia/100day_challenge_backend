'use client';

import React, { useMemo, useState } from 'react';
// Remove D&D imports
// import { DragDropContext, Droppable, OnDragEndResponder, DropResult, DroppableProvided, DroppableStateSnapshot } from '@hello-pangea/dnd';
import { toast } from 'react-toastify';
import TaskCard from './task-card';
import Modal from './modal';
import TaskForm from './task-form';
import DependencyForm from './dependency-form';
import type { Task, User as LibUser, TaskDependency, Workflow, TaskFormData } from '@/lib/types';

// Define statuses array and labels locally (needed for columns)
const statuses: Task['status'][] = ['pending', 'in_progress', 'completed', 'on_hold'];
const statusLabels: Record<Task['status'], string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    on_hold: 'On Hold',
};

interface KanbanBoardProps {
    tasks: Task[];
    dependencies: TaskDependency[];
    users: LibUser[];
    onTaskStatusChange: (taskId: number, newStatus: Task['status']) => Promise<void>;
    onTaskCreate: (data: TaskFormData) => Promise<void>;
    onTaskUpdate: (taskId: number, data: Partial<TaskFormData>) => Promise<void>;
    onTaskDelete: (taskId: number) => Promise<void>;
    onDependencyAdd: (taskId: number, dependsOnTaskId: number) => Promise<void>;
    onDependencyDelete: (taskId: number, dependsOnTaskId: number) => Promise<void>;
}

export default function KanbanBoard({
    tasks,
    dependencies,
    users,
    onTaskStatusChange,
    onTaskCreate,
    onTaskUpdate,
    onTaskDelete,
    onDependencyAdd,
    onDependencyDelete
}: KanbanBoardProps) {
    const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isSubmittingTask, setIsSubmittingTask] = useState(false);
    const [taskSubmitError, setTaskSubmitError] = useState<string | null>(null);
    const [isDependencyModalOpen, setIsDependencyModalOpen] = useState(false);
    const [dependencyTargetTask, setDependencyTargetTask] = useState<Task | null>(null);
    const [isSubmittingDependency, setIsSubmittingDependency] = useState(false);
    const [dependencySubmitError, setDependencySubmitError] = useState<string | null>(null);

    const openEditModal = (task: Task) => {
        setEditingTask(task);
        setIsSubmittingTask(false);
        setTaskSubmitError(null);
        setIsEditTaskModalOpen(true);
    };

    const closeEditModal = () => {
        setIsEditTaskModalOpen(false);
        setEditingTask(null);
    };

    const handleTaskEditSubmit = async (formData: TaskFormData) => {
        if (!editingTask) return;
        setIsSubmittingTask(true);
        setTaskSubmitError(null);
        try {
            const updateData: Partial<TaskFormData> = {
                name: formData.name,
                description: formData.description,
                assigned_user_id: formData.assigned_user_id,
                due_date: formData.due_date,
            };
            await onTaskUpdate(editingTask.id, updateData);
            closeEditModal();
            toast.success(`Task "${formData.name}" updated.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update task.';
            console.error("Task update error:", err);
            setTaskSubmitError(message);
        } finally {
            setIsSubmittingTask(false);
        }
    };

    const handleTaskDeleteClick = async (taskId: number) => {
        const taskToDelete = tasks.find(t => t.id === taskId);
        if (!taskToDelete) return;
        if (window.confirm(`Are you sure you want to delete task "${taskToDelete.name}"?`)) {
            try {
                await onTaskDelete(taskId);
                toast.success(`Task "${taskToDelete.name}" deleted.`);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete task.';
                console.error("Task delete error:", err);
                toast.error(message);
            }
        }
    };

    const openDependencyModal = (taskId: number) => {
        const targetTask = tasks.find(t => t.id === taskId);
        if (targetTask) {
            setDependencyTargetTask(targetTask);
            setIsSubmittingDependency(false);
            setDependencySubmitError(null);
            setIsDependencyModalOpen(true);
        } else {
            console.error("Target task for dependency not found:", taskId);
            toast.error("Cannot add dependency: Task not found.");
        }
    };

    const closeDependencyModal = () => {
        setIsDependencyModalOpen(false);
        setDependencyTargetTask(null);
    };

    const handleDependencyAddSubmit = async (dependsOnTaskId: number) => {
        if (!dependencyTargetTask) return;
        setIsSubmittingDependency(true);
        setDependencySubmitError(null);
        try {
            await onDependencyAdd(dependencyTargetTask.id, dependsOnTaskId);
            closeDependencyModal();
            toast.success(`Dependency added to task "${dependencyTargetTask.name}".`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to add dependency.';
            console.error("Dependency add error:", err);
            setDependencySubmitError(message);
        } finally {
            setIsSubmittingDependency(false);
        }
    };

    const handleDependencyDeleteClick = async (taskId: number, dependsOnTaskId: number) => {
        const task = tasks.find(t => t.id === taskId);
        const dependsOnTask = tasks.find(t => t.id === dependsOnTaskId);
        if (!task || !dependsOnTask) return;

        if (window.confirm(`Remove dependency: Task "${task.name}" will no longer depend on "${dependsOnTask.name}"?`)) {
            try {
                await onDependencyDelete(taskId, dependsOnTaskId);
                toast.success(`Dependency removed from task "${task.name}".`);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to remove dependency.';
                console.error("Dependency delete error:", err);
                toast.error(message);
            }
        }
    };

    const taskFormInitialData: (Partial<TaskFormData> & { id?: number }) | undefined = editingTask ? {
        id: editingTask.id,
        name: editingTask.name,
        description: editingTask.description ?? '',
        assigned_user_id: editingTask.assigned_user_id,
        due_date: editingTask.due_date ? editingTask.due_date.split('T')[0].split(' ')[0] : '',
    } : undefined;

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {statuses.map((status) => (
                    <div key={status} className="p-4 rounded-xl bg-gray-100/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/40 min-h-[250px] transition-colors duration-200 flex flex-col">
                        <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-200 text-center border-b border-gray-300/50 dark:border-gray-600/50 pb-2 capitalize">
                            {statusLabels[status]} ({tasks.filter(t => t.status === status).length})
                        </h3>
                        <div className="flex-grow overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                            {tasks
                                .filter((task) => task.status === status)
                                .sort((a, b) => a.order_index - b.order_index)
                                .map((task) => (
                                    <TaskCard
                                        key={task.id}
                                        task={task}
                                        users={users}
                                        dependencies={dependencies}
                                        allTasks={tasks}
                                        onEdit={openEditModal}
                                        onDelete={handleTaskDeleteClick}
                                        onAddDependency={openDependencyModal}
                                        onDeleteDependency={handleDependencyDeleteClick}
                                        onTaskStatusChange={onTaskStatusChange}
                                    />
                                ))}
                            {tasks.filter((task) => task.status === status).length === 0 && (
                                <div className="text-center text-sm text-gray-400 dark:text-gray-500 mt-4 italic p-4">
                                    No tasks in this column.
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={isEditTaskModalOpen} onClose={closeEditModal} title={`Edit Task ${editingTask?.id ?? ''}`}>
                <TaskForm
                    onSubmit={handleTaskEditSubmit}
                    onCancel={closeEditModal}
                    initialData={taskFormInitialData}
                    users={users}
                    isSubmitting={isSubmittingTask}
                    submitError={taskSubmitError}
                />
            </Modal>

            <Modal isOpen={isDependencyModalOpen} onClose={closeDependencyModal} title={`Add Dependency for "${dependencyTargetTask?.name}"`}>
                {dependencyTargetTask && (
                    <DependencyForm
                        targetTask={dependencyTargetTask}
                        allTasks={tasks}
                        existingDependencies={dependencies}
                        onSubmit={handleDependencyAddSubmit}
                        onCancel={closeDependencyModal}
                        isSubmitting={isSubmittingDependency}
                        submitError={dependencySubmitError}
                    />
                )}
            </Modal>
        </>
    );
}
