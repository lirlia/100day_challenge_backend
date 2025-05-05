'use client';

import React, { useState, useEffect } from 'react';

interface WorkflowFormData {
    name: string;
    description: string;
}

interface WorkflowFormProps {
    onSubmit: (data: WorkflowFormData) => Promise<void>;
    onCancel: () => void;
    initialData?: Partial<WorkflowFormData>; // For editing existing workflows
    isSubmitting: boolean;
    submitError: string | null;
}

export default function WorkflowForm({
    onSubmit,
    onCancel,
    initialData = { name: '', description: '' },
    isSubmitting,
    submitError,
}: WorkflowFormProps) {
    const [formData, setFormData] = useState<WorkflowFormData>({
        name: initialData.name ?? '',
        description: initialData.description ?? '',
    });
    const [nameError, setNameError] = useState<string | null>(null);

    // Reset form when initialData CONTENT changes
    useEffect(() => {
        setFormData({
            name: initialData.name ?? '',
            description: initialData.description ?? '',
        });
        setNameError(null); // Reset error on data change
    // Depend on the content of initialData, not the object reference itself
    }, [initialData.name, initialData.description]);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (name === 'name' && value.trim() === '') {
            setNameError('Workflow name is required.');
        } else if (name === 'name') {
            setNameError(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name.trim() === '') {
            setNameError('Workflow name is required.');
            return;
        }
        if (isSubmitting) return;

        await onSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="workflow-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Workflow Name <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    id="workflow-name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600 ${nameError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500'}`}
                    aria-describedby={nameError ? "name-error" : undefined}
                />
                {nameError && <p id="name-error" className="mt-1 text-xs text-red-500">{nameError}</p>}
            </div>
            <div>
                <label htmlFor="workflow-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                </label>
                <textarea
                    id="workflow-description"
                    name="description"
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                />
            </div>
            {submitError && (
                <p className="text-sm text-red-500 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 p-2 rounded-md">{submitError}</p>
            )}
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
                    {isSubmitting ? 'Saving...' : initialData.name ? 'Update Workflow' : 'Create Workflow'}
                </button>
            </div>
        </form>
    );
}
