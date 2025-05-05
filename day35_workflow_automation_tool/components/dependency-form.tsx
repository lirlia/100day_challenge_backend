import React, { useState, useEffect, useMemo } from 'react';
// Import types from the central types file
import type { Task, TaskDependency } from '@/lib/types';
import { toast } from 'react-toastify';

interface DependencyFormProps {
    targetTask: Task; // The task to which we are adding a dependency
    allTasks: Task[]; // All tasks in the workflow
    existingDependencies: TaskDependency[]; // All existing dependencies
    onSubmit: (dependsOnTaskId: number) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
    submitError: string | null;
}

// Helper function to detect potential circular dependencies
// Returns true if adding dependency (taskId -> dependsOnId) creates a cycle
const createsCircularDependency = (
    taskId: number,
    dependsOnId: number,
    allTasks: Task[],
    dependencies: TaskDependency[]
): boolean => {
    const visited = new Set<number>();
    const recursionStack = new Set<number>();

    // Temporary add the new dependency for checking
    const tempDependencies = [...dependencies, { task_id: taskId, depends_on_task_id: dependsOnId }];

    function detectCycleUtil(nodeId: number): boolean {
        visited.add(nodeId);
        recursionStack.add(nodeId);

        // Find tasks that depend on the current node
        const dependentTasks = tempDependencies.filter(dep => dep.depends_on_task_id === nodeId);

        for (const dep of dependentTasks) {
            const neighborId = dep.task_id;
            if (!visited.has(neighborId)) {
                if (detectCycleUtil(neighborId)) {
                    return true;
                }
            } else if (recursionStack.has(neighborId)) {
                // Cycle detected
                return true;
            }
        }

        recursionStack.delete(nodeId);
        return false;
    }

    // Start DFS from the task we are potentially making dependent (dependsOnId)
    // A cycle exists if we can reach the original task (taskId)
    // This is slightly complex, let's simplify: Start check from the *targetTask*
    // If dependsOnId can reach taskId through existing deps, adding taskId -> dependsOnId creates a cycle.

    const checkDependenciesOf = (startNodeId: number, targetNodeId: number): boolean => {
         const stack: number[] = [startNodeId];
         const checked = new Set<number>();

         while(stack.length > 0) {
            const currentNodeId = stack.pop()!;
            if(currentNodeId === targetNodeId) return true; // Found path back to target
            if(checked.has(currentNodeId)) continue;
            checked.add(currentNodeId);

            const directDependencies = dependencies // Use original dependencies here
                .filter(dep => dep.task_id === currentNodeId)
                .map(dep => dep.depends_on_task_id);

            for(const depId of directDependencies) {
                if(!checked.has(depId)) {
                    stack.push(depId);
                }
            }
         }
         return false; // No path found
    };


    // Check if `dependsOnId` can reach `taskId` through existing dependencies
    return checkDependenciesOf(dependsOnId, taskId);


    // Initial simpler check (might miss indirect cycles):
    // Check if dependsOnId already depends on taskId directly or indirectly.
    // return detectCycleUtil(taskId); // Start DFS from the task adding the dependency
};


export default function DependencyForm({
    targetTask,
    allTasks,
    existingDependencies,
    onSubmit,
    onCancel,
    isSubmitting,
    submitError,
}: DependencyFormProps) {
    const [selectedTaskId, setSelectedTaskId] = useState<string>(''); // Store as string for select value

    // Calculate available tasks to depend on
    const availableTasks = useMemo(() => {
        const targetTaskId = targetTask.id;
        // Filter out:
        // 1. The target task itself
        // 2. Tasks already depended upon by the target task
        // 3. Tasks that would create a circular dependency
        const currentDependencies = existingDependencies
            .filter(dep => dep.task_id === targetTaskId)
            .map(dep => dep.depends_on_task_id);

        return allTasks.filter(task => {
            const isSelf = task.id === targetTaskId;
            const isAlreadyDependent = currentDependencies.includes(task.id);
            // More robust cycle check needed here
             const wouldCreateCycle = createsCircularDependency(
                 targetTaskId,
                 task.id,
                 allTasks,
                 existingDependencies
             );
             if (wouldCreateCycle) {
                 console.log(`Cycle detected if ${targetTaskId} depends on ${task.id}`);
             }

            return !isSelf && !isAlreadyDependent && !wouldCreateCycle;
        });
    }, [targetTask, allTasks, existingDependencies]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTaskId) {
            toast.warn('Please select a task to depend on.');
            return;
        }
        if (isSubmitting) return;
        onSubmit(parseInt(selectedTaskId, 10));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="dependency-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Select Task for "{targetTask.name}" to Depend On:
                </label>
                <select
                    id="dependency-select"
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    disabled={isSubmitting || availableTasks.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-50"
                >
                    <option value="" disabled>
                        {availableTasks.length === 0 ? 'No available tasks' : '-- Select a Task --'}
                    </option>
                    {availableTasks.map((task) => (
                        <option key={task.id} value={String(task.id)}>
                            {task.name} (ID: {task.id}, Status: {task.status})
                        </option>
                    ))}
                </select>
                 {availableTasks.length === 0 && (
                     <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                         Cannot add dependencies: No suitable tasks available (check for cycles or existing dependencies).
                     </p>
                 )}
            </div>

            {/* Submit Error */}
            {submitError && (
                <p className="text-sm text-red-500 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 p-2 rounded-md">{submitError}</p>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white dark:bg-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || !selectedTaskId || availableTasks.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'Adding...' : 'Add Dependency'}
                </button>
            </div>
        </form>
    );
}
