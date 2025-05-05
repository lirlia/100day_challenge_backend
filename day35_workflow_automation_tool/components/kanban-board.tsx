'use client';

import React, { useMemo } from 'react';
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
    console.log(`[Render] KanbanColumn (id: ${id}, taskCount: ${tasks.length})`);
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
    // Define statuses within the component or receive as prop if dynamic
    const statuses: Task['status'][] = ['pending', 'in_progress', 'completed', 'on_hold'];

    // Memoize the columns calculation to prevent unnecessary re-computation
    const columns = useMemo(() => {
        console.log('[KanbanBoard] Recalculating columns...'); // Log to check frequency
        return statuses.map(status => ({
            id: status,
            title: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
            // Filter and sort tasks for each column
            tasks: tasks.filter(task => task.status === status).sort((a, b) => a.order_index - b.order_index),
        }));
    // Depend on the tasks array. If tasks array reference changes, recalculate.
    // statuses is constant within this scope, but included for completeness if it were dynamic.
    }, [tasks, statuses]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        // Ensure we have a valid drop target and the item moved
        if (over && active.id !== over.id) {
             const activeTask = tasks.find(t => t.id === active.id);
             // The droppable target ID is the status column ID
             const targetStatus = over.id as Task['status'];

             // Check if the target is a valid status column and the task status actually changes
             if (activeTask && targetStatus && activeTask.status !== targetStatus && statuses.includes(targetStatus)) {
                 console.log(`Attempting to move task ${active.id} from ${activeTask.status} to ${targetStatus}`);
                 // Call the handler passed from the parent page to update the task status via API
                 onTaskStatusChange(active.id as number, targetStatus);
             } else {
                 // Handle cases like dropping back into the same column or invalid drop target
                 console.log(`Task ${active.id} dropped over ${over.id}, but not a valid status change.`);
                 // Optional: Implement reordering within the same column if needed
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
                        tasks={column.tasks} // Pass the memoized tasks for this column
                        dependencies={dependencies}
                    />
                ))}
            </div>
        </DndContext>
    );
}
