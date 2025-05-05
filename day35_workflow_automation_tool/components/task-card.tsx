'use client';

import React from 'react';
// Remove dnd imports
// import { Draggable, DraggableProvided, DraggableStateSnapshot } from '@hello-pangea/dnd';
import { Pencil, Trash2, Users, Calendar, Link2, PlusCircle, XCircle, ChevronDown } from 'lucide-react';
import type { Task, User as LibUser, TaskDependency } from '@/lib/types';

interface TaskCardProps {
    task: Task;
    // index is no longer needed without dnd
    users: LibUser[];
    dependencies: TaskDependency[];
    allTasks: Task[];
    onEdit: (task: Task) => void;
    onDelete: (taskId: number) => void;
    onAddDependency: (taskId: number) => void;
    onDeleteDependency: (taskId: number, dependsOnTaskId: number) => void;
    onTaskStatusChange: (taskId: number, newStatus: Task['status']) => void; // Add status change handler prop
}

const getTaskName = (taskId: number, allTasks: Task[]): string => {
    const task = allTasks.find(t => t.id === taskId);
    return task ? task.name : 'Unknown Task';
};

const getAssigneeName = (assigneeId: number | null, users: LibUser[]): string => {
    if (assigneeId === null) return 'Unassigned';
    const user = users.find(u => u.id === assigneeId);
    return user ? user.name : 'Unknown User';
};

const formatDueDate = (dueDate: string | null): string => {
    if (!dueDate) return 'No due date';
    try {
        const date = new Date(dueDate);
        if (isNaN(date.getTime())) return 'Invalid date';
        return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (e) {
        console.error("Error formatting due date:", dueDate, e);
        return 'Invalid date';
    }
};

// Define statuses and labels here or import if defined globally
const statuses: Task['status'][] = ['pending', 'in_progress', 'completed', 'on_hold'];
const statusLabels: Record<Task['status'], string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    on_hold: 'On Hold',
};
const statusColors: Record<Task['status'], string> = {
     pending: 'bg-gray-400',
     in_progress: 'bg-blue-500',
     completed: 'bg-green-500',
     on_hold: 'bg-yellow-500',
};

export default function TaskCard({
    task,
    users,
    dependencies,
    allTasks,
    onEdit,
    onDelete,
    onAddDependency,
    onDeleteDependency,
    onTaskStatusChange // Destructure the new prop
}: TaskCardProps) {
    const assigneeName = getAssigneeName(task.assigned_user_id, users);
    const formattedDueDate = formatDueDate(task.due_date);
    const taskDependencies = dependencies.filter(dep => dep.task_id === task.id);

    const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = event.target.value as Task['status'];
        if (statuses.includes(newStatus)) {
            onTaskStatusChange(task.id, newStatus);
        }
    };

    return (
        // Remove Draggable wrapper
        <div
            className="mb-3 p-4 rounded-lg shadow-md bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm border border-white/30 dark:border-gray-600/50"
            // Remove style related to dragging
        >
            {/* Task Header */}
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-800 dark:text-gray-100 break-words mr-2 flex-grow">{task.name}</h4>
                <div className="flex-shrink-0 flex items-center space-x-1">
                    {/* Use template literals for className for brevity */}
                    <button onClick={() => onEdit(task)} className={`p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-600 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150`} aria-label="Edit task"> <Pencil size={16} /> </button>
                    <button onClick={() => onDelete(task.id)} className={`p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-600 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150`} aria-label="Delete task"> <Trash2 size={16} /> </button>
                </div>
            </div>

            {/* Description */}
            {task.description && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 break-words">{task.description}</p>
            )}

            {/* Task Details */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400 mt-auto mb-3">
                {/* Status Dropdown */}
                <div className="relative group">
                     <span className={`absolute -left-1 top-1/2 transform -translate-y-1/2 inline-block w-3 h-3 rounded-full mr-1 ${statusColors[task.status]}`}></span>
                     <select
                         value={task.status}
                         onChange={handleStatusChange}
                         className={`pl-3 pr-6 py-0.5 appearance-none text-xs rounded border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-transparent cursor-pointer`}
                         title={`Change status (Current: ${statusLabels[task.status]})`}
                     >
                         {statuses.map(s => (
                             <option key={s} value={s}>{statusLabels[s]}</option>
                         ))}
                     </select>
                     <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 group-hover:text-gray-600 pointer-events-none" />
                </div>

                {/* Assignee */}
                <div className="flex items-center" title={`Assignee: ${assigneeName}`}>
                    <Users size={14} className="mr-1" />
                    <span>{assigneeName}</span>
                </div>
                {/* Due Date */}
                <div className="flex items-center" title={`Due Date: ${formattedDueDate}`}>
                    <Calendar size={14} className="mr-1" />
                    <span>{formattedDueDate}</span>
                </div>
            </div>

            {/* Dependencies Section (remains the same) */}
             <div className="mt-3 pt-3 border-t border-gray-200/80 dark:border-gray-600/50 text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex justify-between items-center mb-1">
                            <p className="font-medium text-gray-600 dark:text-gray-300 flex items-center">
                                <Link2 size={14} className="mr-1.5" />
                                Depends On:
                            </p>
                            <button
                                onClick={() => onAddDependency(task.id)}
                                className="p-1 rounded-full text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                                aria-label="Add dependency"
                            >
                                <PlusCircle size={16} />
                            </button>
                        </div>
                        {taskDependencies.length === 0 ? (
                            <p className="italic text-gray-400 dark:text-gray-500">No dependencies</p>
                        ) : (
                            <ul className="space-y-1 max-h-16 overflow-y-auto custom-scrollbar-xs pr-1"> {/* Limit height and add scroll */}
                                {taskDependencies.map((dep) => (
                                    <li key={dep.depends_on_task_id} className="flex justify-between items-center group">
                                        <span className="truncate pr-2" title={getTaskName(dep.depends_on_task_id, allTasks)}>
                                            {getTaskName(dep.depends_on_task_id, allTasks)}
                                        </span>
                                        <button
                                            onClick={() => onDeleteDependency(task.id, dep.depends_on_task_id)}
                                            className="p-0.5 rounded-full text-gray-400 dark:text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                            aria-label={`Remove dependency on task ${dep.depends_on_task_id}`}
                                        >
                                            <XCircle size={14} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
        </div>
        // Remove closing Draggable tag
    );
}
