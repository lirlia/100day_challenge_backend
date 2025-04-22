'use client';

import React, { useState } from 'react';

// Assume ColumnInfo is imported or defined elsewhere
interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'other';
  distinctValues?: (string | number | null)[];
  isNumeric: boolean;
  isDate: boolean;
}

// Define the structure for a single filter
export interface FilterCondition {
  id: string; // Unique ID for React key
  column: string;
  operator: string;
  value: any;
}

interface FilterBuilderProps {
  columns: ColumnInfo[];
  filters: FilterCondition[];
  onFiltersChange: (newFilters: FilterCondition[]) => void;
}

// Define available operators based on column type
const OPERATORS: Record<ColumnInfo['type'], { label: string; value: string }[]> = {
  string: [
    { label: 'Equals', value: '=' },
    { label: 'Not Equals', value: '!=' },
    { label: 'Is In', value: 'IN' },
    // Add more string operators if needed (e.g., CONTAINS, STARTS WITH)
  ],
  number: [
    { label: 'Equals', value: '=' },
    { label: 'Not Equals', value: '!=' },
    { label: 'Greater Than', value: '>' },
    { label: 'Less Than', value: '<' },
    { label: 'Greater Than or Equal', value: '>=' },
    { label: 'Less Than or Equal', value: '<=' },
    { label: 'Is In', value: 'IN' },
  ],
  date: [
    { label: 'Equals', value: '=' },
    { label: 'Not Equals', value: '!=' },
    { label: 'Greater Than', value: '>' },
    { label: 'Less Than', value: '<' },
    { label: 'Greater Than or Equal', value: '>=' },
    { label: 'Less Than or Equal', value: '<=' },
  ],
  boolean: [{ label: 'Is', value: '=' }],
  other: [{ label: 'Equals', value: '=' }, { label: 'Not Equals', value: '!=' }], // Basic operators for unknown types
};

export default function FilterBuilder({ columns, filters, onFiltersChange }: FilterBuilderProps) {

  const addFilter = () => {
    const newFilter: FilterCondition = {
      id: Date.now().toString(), // Simple unique ID generation
      column: columns.length > 0 ? columns[0].name : '', // Default to first column
      operator: columns.length > 0 ? OPERATORS[columns[0].type][0].value : '=', // Default to first operator of first column type
      value: '',
    };
    onFiltersChange([...filters, newFilter]);
  };

  const updateFilter = (id: string, field: keyof FilterCondition, newValue: any) => {
    const newFilters = filters.map((f) => {
      if (f.id === id) {
        const updatedFilter = { ...f, [field]: newValue };

        // If column changes, reset operator and value based on the new column type
        if (field === 'column') {
          const newColumnInfo = columns.find(c => c.name === newValue);
          const newColumnType = newColumnInfo ? newColumnInfo.type : 'other';
          updatedFilter.operator = OPERATORS[newColumnType][0]?.value || '='; // Reset operator
          updatedFilter.value = ''; // Reset value
        }

        // If operator changes to/from IN, potentially adjust value format (e.g., to array)
        if (field === 'operator') {
          // Simple reset for now, could add parsing logic later
          updatedFilter.value = '';
        }

        return updatedFilter;
      }
      return f;
    });
    onFiltersChange(newFilters);
  };

  const removeFilter = (id: string) => {
    onFiltersChange(filters.filter((f) => f.id !== id));
  };

  const getColumnType = (columnName: string): ColumnInfo['type'] => {
    return columns.find(c => c.name === columnName)?.type || 'other';
  };

  const renderValueInput = (filter: FilterCondition) => {
    const columnInfo = columns.find(c => c.name === filter.column);
    const columnType = columnInfo?.type || 'other';
    const operators = OPERATORS[columnType] || OPERATORS.other;
    const selectedOperator = operators.find(op => op.value === filter.operator);

    if (filter.operator === 'IN') {
      // For IN operator, use a text input for comma-separated values (can be enhanced later)
      return (
        <input
          type="text"
          value={filter.value} // Keep as string for now
          onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
          placeholder="e.g., value1, value2"
          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      );
    }

    switch (columnType) {
      case 'string':
        if (columnInfo?.distinctValues && columnInfo.distinctValues.length > 0 && columnInfo.distinctValues.length <= 50) { // Limit dropdown size
          return (
            <select
              value={filter.value}
              onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">-- Select Value --</option>
              {columnInfo.distinctValues.map((val, index) => (
                <option key={index} value={String(val)}>
                  {String(val)}
                </option>
              ))}
            </select>
          );
        }
        return (
          <input
            type="text"
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        );
      case 'date':
        return (
          <input
            type="date" // Use date input
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        );
      case 'boolean':
        return (
          <select
            value={String(filter.value)} // Ensure value is string for select
            onChange={(e) => updateFilter(filter.id, 'value', e.target.value === 'true')}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        );
      default:
        return (
          <input
            type="text"
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, 'value', e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        );
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">Filters</h2>
        <button
          onClick={addFilter}
          disabled={columns.length === 0}
          className="text-sm bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          + Add Filter
        </button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filters.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No filters added.</p>
        )}
        {filters.map((filter) => {
          const columnType = getColumnType(filter.column);
          const availableOperators = OPERATORS[columnType] || OPERATORS.other;

          return (
            <div key={filter.id} className="flex items-start gap-2 border-t dark:border-gray-700 pt-2">
              {/* Column Select */}
              <div className="flex-1 min-w-0">
                <label className="text-xs text-gray-500 dark:text-gray-400">Column</label>
                <select
                  value={filter.column}
                  onChange={(e) => updateFilter(filter.id, 'column', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {columns.map((col) => (
                    <option key={col.name} value={col.name}>{col.name}</option>
                  ))}
                </select>
              </div>

              {/* Operator Select */}
              <div className="flex-1 min-w-0">
                <label className="text-xs text-gray-500 dark:text-gray-400">Operator</label>
                <select
                  value={filter.operator}
                  onChange={(e) => updateFilter(filter.id, 'operator', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {availableOperators.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>

              {/* Value Input */}
              <div className="flex-1 min-w-0">
                <label className="text-xs text-gray-500 dark:text-gray-400">Value</label>
                {renderValueInput(filter)}
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeFilter(filter.id)}
                className="mt-5 text-red-500 hover:text-red-700"
                title="Remove Filter"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
