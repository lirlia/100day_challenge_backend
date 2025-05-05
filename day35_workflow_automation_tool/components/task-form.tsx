'use client';

import React, { useState, useEffect } from 'react';
import { User, useUserStore } from '@/lib/store'; // Import User type and store

// Task type subset needed for the form
interface TaskFormData {
    name: string;
    description: string;
    assigned_user_id: number | null;
    due_date: string; // Store as YYYY-MM-DD string for input type="date"
}

interface TaskFormProps {
    onSubmit: (data: TaskFormData) => Promise<void>;
    onCancel: () => void;
    initialData?: Partial<TaskFormData> & { id?: number }; // id is useful for edit mode title
    users: User[]; // Pass users for assignee dropdown
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
    initialData = { name: '', description: '', assigned_user_id: null, due_date: '' },
    users,
    isSubmitting,
    submitError,
}: TaskFormProps) {
    const [formData, setFormData] = useState<TaskFormData>({
        name: initialData.name ?? '',
        description: initialData.description ?? '',
        assigned_user_id: initialData.assigned_user_id ?? null,
        due_date: formatDateForInput(initialData.due_date),
    });
    const [nameError, setNameError] = useState<string | null>(null);

    // Reset form when initialData changes
    useEffect(() => {
        // Safely access initialData properties to set the form state
        const name = initialData?.name ?? '';
        const description = initialData?.description ?? '';
        const assignedUserId = initialData?.assigned_user_id ?? null;
        const dueDate = formatDateForInput(initialData?.due_date);

        setFormData({
            name: name,
            description: description,
            assigned_user_id: assignedUserId,
            due_date: dueDate,
        });
        setNameError(null);
        // Depend on the actual primitive values that define the task being edited,
        // rather than the object reference which might change on every render.
    }, [
        initialData?.id, // Primary identifier for the task being edited
        initialData?.name,
        initialData?.description,
        initialData?.assigned_user_id,
        initialData?.due_date,
    ]);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value } = e.target;
        const newValue = name === 'assigned_user_id' ? (value ? parseInt(value, 10) : null) : value;
        setFormData((prev) => ({ ...prev, [name]: newValue }));

        if (name === 'name' && value.trim() === '') {
            setNameError('Task name is required.');
        } else if (name === 'name') {
            setNameError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name.trim() === '') {
            setNameError('Task name is required.');
            return;
        }
        if (isSubmitting) return;

        // Convert date back to format API expects if needed, or handle in API
        // Assuming API can handle YYYY-MM-DD for DATETIME column for simplicity here
        await onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Task Name */}
            <div>
                <label htmlFor="task-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Task Name <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    id="task-name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 ${nameError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500'}`}
                    aria-describedby={nameError ? "task-name-error" : undefined}
                />
                {nameError && <p id="task-name-error" className="mt-1 text-xs text-red-500">{nameError}</p>}
            </div>

            {/* Description */}
            <div>
                <label htmlFor="task-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                </label>
                <textarea
                    id="task-description"
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                />
            </div>

            {/* Assignee */}
            <div>
                <label htmlFor="assigned-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Assignee
                </label>
                <select
                    id="assigned-user"
                    name="assigned_user_id"
                    value={formData.assigned_user_id ?? ''} // Handle null value for select
                    onChange={handleChange}
                    disabled={isSubmitting || users.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-50"
                >
                    <option value="">Unassigned</option>
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
                    Due Date
                </label>
                <input
                    type="date" // Use date input for simplicity
                    id="due-date"
                    name="due_date"
                    value={formData.due_date}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:text-scheme-invert"
                     style={{ colorScheme: 'dark' }} // Hint for dark mode date picker styling
                />
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
                    disabled={isSubmitting || !!nameError}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'Saving...' : initialData.id ? 'Update Task' : 'Create Task'}
                </button>
            </div>
        </form>
    );
}
