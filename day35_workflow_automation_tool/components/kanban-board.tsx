'use client';

import React from 'react';
import { useDroppable, DndContext, DragEndEvent, UniqueIdentifier, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { TaskCard } from './task-card';

// --- Types ---
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

interface KanbanColumnProps {
    id: UniqueIdentifier; // Column ID (matches status)
    title: string;
    tasks: Task[];
    dependencies: TaskDependency[];
}

interface KanbanBoardProps {
    tasks: Task[];
    dependencies: TaskDependency[];
    onTaskStatusChange: (taskId: number, newStatus: Task['status']) => void;
    // onTaskOrderChange: (taskId: number, newOrderIndex: number) => void; // Optional: for reordering within columns
}

// --- Kanban Column Component ---
function KanbanColumn({ id, title, tasks, dependencies }: KanbanColumnProps) {
    const { setNodeRef } = useDroppable({ id });

    // Helper to check if a task has dependencies
    const taskHasDependencies = (taskId: number) => {
        return dependencies.some(dep => dep.task_id === taskId);
    };

    // Helper to check if a task is depended on by others
    const taskIsDependedOn = (taskId: number) => {
         return dependencies.some(dep => dep.depends_on_task_id === taskId);
    };

    return (
        <div
            ref={setNodeRef}
            className="flex-1 min-w-[280px] bg-gray-100/70 dark:bg-gray-800/50 rounded-lg p-4 shadow-inner border border-gray-200/50 dark:border-gray-700/30 backdrop-blur-sm"
        >
            <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center border-b pb-2 border-gray-300 dark:border-gray-600">{title} ({tasks.length})</h3>
            <SortableContext id={String(id)} items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2 min-h-[100px]"> {/* Min height for empty columns */}
                    {tasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            hasDependencies={taskHasDependencies(task.id)}
                            isDependedOn={taskIsDependedOn(task.id)}
                            // onClick={() => console.log('Task clicked:', task.id)} // Placeholder
                        />
                    ))}
                </div>
            </SortableContext>
        </div>
    );
}

// --- Kanban Board Component ---
export default function KanbanBoard({ tasks, dependencies, onTaskStatusChange }: KanbanBoardProps) {
    const statuses: Task['status'][] = ['pending', 'in_progress', 'completed', 'on_hold'];
    const columns = statuses.map(status => ({
        id: status,
        title: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '), // e.g., In progress
        tasks: tasks.filter(task => task.status === status).sort((a, b) => a.order_index - b.order_index),
    }));

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
             const activeTask = tasks.find(t => t.id === active.id);
             const targetStatus = over.id as Task['status']; // over.id should be the column status

             if (activeTask && targetStatus && activeTask.status !== targetStatus && statuses.includes(targetStatus)) {
                 console.log(`Attempting to move task ${active.id} from ${activeTask.status} to ${targetStatus}`);
                 onTaskStatusChange(active.id as number, targetStatus);
             } else {
                 // Handle reordering within the same column (optional)
                 console.log(`Task ${active.id} dropped over ${over.id}, but not a valid status change or same column.`);
                 // Implement reordering logic if needed using arrayMove
             }
        } else {
            console.log('Drag ended without a valid target or on the same item.');
        }
    };

    // We need DndContext here to manage the drag and drop state
    return (
         <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex space-x-4 overflow-x-auto pb-4">
                {columns.map(column => (
                    <KanbanColumn
                        key={column.id}
                        id={column.id}
                        title={column.title}
                        tasks={column.tasks}
                        dependencies={dependencies}
                    />
                ))}
            </div>
        </DndContext>
    );
}
