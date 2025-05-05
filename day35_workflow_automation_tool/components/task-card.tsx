'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, User, Clock, GitBranch } from 'lucide-react'; // Using lucide-react for icons

// Task type from page.tsx
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

interface TaskCardProps {
    task: Task;
    hasDependencies: boolean; // Whether this task depends on others
    isDependedOn: boolean;    // Whether other tasks depend on this one
    // onClick: () => void; // TODO: Add handler to open edit modal
}

function formatShortDate(isoString: string | null): string {
    if (!isoString) return 'N/A';
    try {
        const date = new Date(isoString);
        // Get only date part if time is midnight
        if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) {
             return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        return date.toLocaleString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return 'Invalid Date';
    }
}

export function TaskCard({ task, hasDependencies, isDependedOn }: TaskCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: task.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.8 : 1,
        zIndex: isDragging ? 10 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            className={`p-4 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 cursor-grab touch-none ${isDragging ? 'ring-2 ring-blue-500' : ''}`}
            // onClick={onClick} // Re-enable when modal is ready
            aria-labelledby={`task-title-${task.id}`}
        >
            <div className="flex justify-between items-start">
                <h4 id={`task-title-${task.id}`} className="font-semibold text-gray-800 dark:text-white mb-1 text-sm break-words">
                    {task.name}
                </h4>
                <button {...listeners} aria-label="Drag task" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <GripVertical size={16} />
                </button>
            </div>
            {(task.assigned_user_name || task.due_date || hasDependencies || isDependedOn) && (
                 <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 items-center">
                    {task.assigned_user_name && (
                        <div className="flex items-center" title={`Assigned to ${task.assigned_user_name}`}>
                            <User size={12} className="mr-1" />
                            <span>{task.assigned_user_name}</span>
                        </div>
                    )}
                    {task.due_date && (
                        <div className="flex items-center" title={`Due ${formatShortDate(task.due_date)}`}>
                            <Clock size={12} className="mr-1" />
                            <span>{formatShortDate(task.due_date)}</span>
                        </div>
                    )}
                    {hasDependencies && (
                        <div className="flex items-center text-orange-600 dark:text-orange-400" title="This task has prerequisites">
                            <GitBranch size={12} className="mr-1 transform -scale-x-100" /> {/* Icon indicating dependency input */}
                            <span>Blocked</span>
                        </div>
                    )}
                     {isDependedOn && (
                        <div className="flex items-center text-blue-600 dark:text-blue-400" title="Other tasks depend on this one">
                            <GitBranch size={12} className="mr-1" /> {/* Icon indicating dependency output */}
                             <span>Blocking</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
