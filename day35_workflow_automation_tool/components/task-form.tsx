'use client';

import React, { useState, useEffect } from 'react';
import { User } from '@/lib/store'; // Import User type
import { TaskFormData } from '@/lib/types'; // Import TaskFormData type

interface TaskFormProps {
    onSubmit: (data: TaskFormData) => Promise<void>;
    onCancel: () => void;
    initialData?: Partial<TaskFormData> & { id?: number }; // Allow Partial of imported type
    users: User[];
    isSubmitting: boolean;
    submitError: string | null;
}

// Helper to format date for input type="date"
const formatDateForInput = (isoDateString: string | null | undefined): string => {
    if (!isoDateString) return '';
    try {
        // Extract YYYY-MM-DD part
        return isoDateString.split('T')[0].split(' ')[0];
    } catch {
        return '';
    }
};

export default function TaskForm({
    onSubmit,
    onCancel,
    initialData = {},
    users,
    isSubmitting,
    submitError,
}: TaskFormProps) {
    const [formData, setFormData] = useState<TaskFormData>(() => ({
        name: initialData?.name ?? '',
        description: initialData?.description ?? null,
        assigned_user_id: initialData?.assigned_user_id ?? null,
        due_date: initialData?.due_date ?? null,
    }));
    const [nameError, setNameError] = useState<string | null>(null);

    useEffect(() => {
        setFormData({
            name: initialData?.name ?? '',
            description: initialData?.description ?? null,
            assigned_user_id: initialData?.assigned_user_id ?? null,
            due_date: initialData?.due_date ?? null,
        });
        setNameError(null);
    }, [
        initialData?.id, initialData?.name, initialData?.description,
        initialData?.assigned_user_id, initialData?.due_date,
    ]);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value } = e.target;
        const key = name as keyof TaskFormData;
        let newValue: string | number | null = value;

        if (key === 'assigned_user_id') {
            newValue = value ? parseInt(value, 10) : null;
        } else if (key === 'description') {
            newValue = value;
        } else if (key === 'due_date') {
            newValue = value;
        }

        setFormData((prev: TaskFormData) => ({
            ...prev,
            [key]: newValue
        }));

        if (key === 'name' && value.trim() === '') {
            setNameError('タスク名は必須です。');
        } else if (key === 'name') {
            setNameError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name.trim() === '') {
            setNameError('タスク名は必須です。'); return;
        }
        if (isSubmitting) return;

        const dataToSend: TaskFormData = {
            ...formData,
            description: formData.description?.trim() || null,
            due_date: formData.due_date || null,
        };
        await onSubmit(dataToSend);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Task Name */}
            <div>
                <label htmlFor="task-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    タスク名 <span className="text-red-500">*</span>
                </label>
                <input
                    type="text" id="task-name" name="name" value={formData.name} onChange={handleChange}
                    required disabled={isSubmitting}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 ${nameError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500'}`}
                    aria-describedby={nameError ? "task-name-error" : undefined}
                />
                {nameError && <p id="task-name-error" className="mt-1 text-xs text-red-500">{nameError}</p>}
            </div>

            {/* Description */}
            <div>
                <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    説明
                </label>
                <textarea
                    id="task-description" name="description" rows={3}
                    value={formData.description ?? ''}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                />
            </div>

            {/* Assignee */}
            <div>
                <label htmlFor="assigned-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    担当者
                </label>
                <select
                    id="assigned-user" name="assigned_user_id" value={formData.assigned_user_id ?? ''} onChange={handleChange}
                    disabled={isSubmitting || users.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-50"
                >
                    <option value="">未割り当て</option>
                    {users.map((user) => (
                        <option key={user.id} value={user.id}>
                            {user.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Due Date */}
            <div>
                <label htmlFor="due-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    期限日
                </label>
                <input
                    type="date" id="due-date" name="due_date"
                    value={formData.due_date ?? ''}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:text-scheme-invert"
                    style={{ colorScheme: 'dark' }}
                />
            </div>

            {/* Submit Error */}
            {submitError && (
                <p className="text-sm text-red-500 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 p-2 rounded-md">
                    エラー: {submitError}
                </p>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={onCancel} disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white dark:bg-gray-600 dark:text-gray-200 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
                    キャンセル
                </button>
                <button type="submit" disabled={isSubmitting || !!nameError}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSubmitting ? '保存中...' : initialData?.id ? 'タスク更新' : 'タスク作成'}
                </button>
            </div>
        </form>
    );
}
