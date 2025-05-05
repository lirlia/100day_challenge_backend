import React, { useState, useEffect, useMemo } from 'react';
// Import types from the central types file
import type { Task, TaskDependency } from '@/lib/types';
import { toast } from 'react-toastify';

interface DependencyFormProps {
    targetTask: Task; // 依存関係を追加する対象のタスク
    allTasks: Task[]; // ワークフロー内の全タスク
    existingDependencies: TaskDependency[]; // 既存の全依存関係
    onSubmit: (dependsOnTaskId: number) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
    submitError: string | null;
}

// 循環依存の可能性を検出するヘルパー関数
// (taskId -> dependsOnId) の依存関係を追加すると循環が発生する場合に true を返す
const createsCircularDependency = (
    taskId: number,
    dependsOnId: number,
    allTasks: Task[],
    dependencies: TaskDependency[]
): boolean => {
    const visited = new Set<number>();
    const recursionStack = new Set<number>();

    // チェック用に新しい依存関係を一時的に追加
    const tempDependencies = [...dependencies, { task_id: taskId, depends_on_task_id: dependsOnId }];

    function detectCycleUtil(nodeId: number): boolean {
        visited.add(nodeId);
        recursionStack.add(nodeId);

        // 現在のノードに依存するタスクを検索
        const dependentTasks = tempDependencies.filter(dep => dep.depends_on_task_id === nodeId);

        for (const dep of dependentTasks) {
            const neighborId = dep.task_id;
            if (!visited.has(neighborId)) {
                if (detectCycleUtil(neighborId)) {
                    return true;
                }
            } else if (recursionStack.has(neighborId)) {
                // 循環を検出
                return true;
            }
        }

        recursionStack.delete(nodeId);
        return false;
    }

    // dependsOnId が既存の依存関係を通じて taskId に到達できるかチェック
    const checkDependenciesOf = (startNodeId: number, targetNodeId: number): boolean => {
         const stack: number[] = [startNodeId];
         const checked = new Set<number>();

         while(stack.length > 0) {
            const currentNodeId = stack.pop()!;
            if(currentNodeId === targetNodeId) return true; // ターゲットへのパス発見
            if(checked.has(currentNodeId)) continue;
            checked.add(currentNodeId);

            const directDependencies = dependencies // ここでは元の依存関係を使用
                .filter(dep => dep.task_id === currentNodeId)
                .map(dep => dep.depends_on_task_id);

            for(const depId of directDependencies) {
                if(!checked.has(depId)) {
                    stack.push(depId);
                }
            }
         }
         return false; // パスが見つからない
    };

    return checkDependenciesOf(dependsOnId, taskId);
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
    const [selectedTaskId, setSelectedTaskId] = useState<string>(''); // select の value のために文字列として保存

    // 依存可能なタスクを計算
    const availableTasks = useMemo(() => {
        const targetTaskId = targetTask.id;
        // 除外対象:
        // 1. 対象タスク自身
        // 2. 対象タスクが既に依存しているタスク
        // 3. 循環依存を引き起こすタスク
        const currentDependencies = existingDependencies
            .filter(dep => dep.task_id === targetTaskId)
            .map(dep => dep.depends_on_task_id);

        return allTasks.filter(task => {
            const isSelf = task.id === targetTaskId;
            const isAlreadyDependent = currentDependencies.includes(task.id);
            const wouldCreateCycle = createsCircularDependency(
                 targetTaskId,
                 task.id,
                 allTasks,
                 existingDependencies
             );
             // if (wouldCreateCycle) {
             //     console.log(`Cycle detected if ${targetTaskId} depends on ${task.id}`);
             // }

            return !isSelf && !isAlreadyDependent && !wouldCreateCycle;
        });
    }, [targetTask, allTasks, existingDependencies]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTaskId) {
            toast.warn('依存するタスクを選択してください。');
            return;
        }
        if (isSubmitting) return;
        onSubmit(parseInt(selectedTaskId, 10));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="dependency-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    タスク「{targetTask.name}」が依存するタスクを選択:
                </label>
                <select
                    id="dependency-select"
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    disabled={isSubmitting || availableTasks.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-50"
                >
                    <option value="" disabled>
                        {availableTasks.length === 0 ? '利用可能なタスクがありません' : '-- タスクを選択 --'}
                    </option>
                    {availableTasks.map((task) => (
                        <option key={task.id} value={String(task.id)}>
                            {task.name} (ID: {task.id}, 状態: {task.status})
                        </option>
                    ))}
                </select>
                 {availableTasks.length === 0 && (
                     <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                         依存関係を追加できません: 利用可能なタスクがありません（循環依存や既存の依存関係を確認してください）。
                     </p>
                 )}
            </div>

            {/* Submit Error */}
            {submitError && (
                <p className="text-sm text-red-500 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 p-2 rounded-md">
                    エラー: {submitError}
                </p>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white dark:bg-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                    キャンセル
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || !selectedTaskId || availableTasks.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? '追加中...' : '依存関係を追加'}
                </button>
            </div>
        </form>
    );
}
