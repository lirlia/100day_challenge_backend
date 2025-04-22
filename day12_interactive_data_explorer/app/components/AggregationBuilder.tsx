'use client';

import React from 'react';

// Assume ColumnInfo is imported or defined elsewhere
interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'other';
  isNumeric: boolean;
  isDate: boolean;
}

// Define the structure for a single aggregation
export interface AggregationCondition {
  id: string; // Unique ID for React key
  function: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  column: string; // Column name or '*' for COUNT
  alias: string; // Alias for the result column
}

interface AggregationBuilderProps {
  columns: ColumnInfo[];
  aggregations: AggregationCondition[];
  onAggregationsChange: (newAggregations: AggregationCondition[]) => void;
}

const AGG_FUNCTIONS: AggregationCondition['function'][] = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];

export default function AggregationBuilder({ columns, aggregations, onAggregationsChange }: AggregationBuilderProps) {

  const addAggregation = () => {
    const newId = Date.now().toString();
    const defaultAlias = `agg_${newId.slice(-4)}`; // Simple default alias
    const defaultColumn = columns.find(c => c.isNumeric)?.name || (columns.length > 0 ? columns[0].name : '');

    const newAggregation: AggregationCondition = {
      id: newId,
      function: 'COUNT', // Default function
      column: '*',       // Default to * for COUNT
      alias: `count_${defaultAlias}`,
    };
    onAggregationsChange([...aggregations, newAggregation]);
  };

  const updateAggregation = (id: string, field: keyof AggregationCondition, newValue: any) => {
    const newAggregations = aggregations.map((agg) => {
      if (agg.id === id) {
        const updatedAgg = { ...agg, [field]: newValue };
        let shouldUpdateAlias = false; // Flag to control alias update

        // If function changes to COUNT, set column to *
        if (field === 'function' && newValue === 'COUNT') {
          updatedAgg.column = '*';
          shouldUpdateAlias = true; // Mark alias for update
        }
        // If function changes *from* COUNT, set column to the first numeric or first column
        if (field === 'function' && agg.function === 'COUNT' && newValue !== 'COUNT') {
          const firstNumeric = columns.find(c => c.isNumeric);
          updatedAgg.column = firstNumeric ? firstNumeric.name : (columns.length > 0 ? columns[0].name : '');
          shouldUpdateAlias = true; // Mark alias for update
        }
        // If column changes, mark alias for update
        if (field === 'column') {
          shouldUpdateAlias = true;
        }
        // If function changes, mark alias for update
        if (field === 'function') {
          shouldUpdateAlias = true;
        }

        // Auto-generate alias if function or column changed
        if (shouldUpdateAlias) {
          const colPart = updatedAgg.column === '*' ? 'all' : updatedAgg.column;
          // Ensure alias is valid (alphanumeric + underscore, max length, clean up)
          updatedAgg.alias = `${updatedAgg.function.toLowerCase()}_${colPart}`.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_{2,}/g, '_').slice(0, 30);
          if (updatedAgg.alias.startsWith('_')) updatedAgg.alias = updatedAgg.alias.substring(1);
          if (updatedAgg.alias.endsWith('_')) updatedAgg.alias = updatedAgg.alias.slice(0, -1);
          if (!updatedAgg.alias) updatedAgg.alias = `agg_${Date.now().toString().slice(-4)}`; // Fallback alias
        }

        return updatedAgg;
      }
      return agg;
    });
    onAggregationsChange(newAggregations);
  };

  const removeAggregation = (id: string) => {
    onAggregationsChange(aggregations.filter((agg) => agg.id !== id));
  };

  // Filter columns available for aggregation based on function type
  const getAvailableColumns = (func: AggregationCondition['function']): string[] => {
    if (func === 'COUNT') {
      return ['*', ...columns.map(c => c.name)];
    }
    // SUM, AVG require numeric columns
    if (func === 'SUM' || func === 'AVG') {
      return columns.filter(c => c.isNumeric).map(c => c.name);
    }
    // MIN, MAX can work on most types (simplification: allow all for now)
    return columns.map(c => c.name);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">Aggregations</h2>
        <button
          onClick={addAggregation}
          disabled={columns.length === 0}
          className="text-sm bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          + Add Aggregation
        </button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {aggregations.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No aggregations added.</p>
        )}
        {aggregations.map((agg) => {
          const availableCols = getAvailableColumns(agg.function);
          // Ensure the currently selected column is valid for the function
          const isColumnValid = agg.column === '*' || availableCols.includes(agg.column);

          return (
            <div key={agg.id} className="flex items-start gap-2 border-t dark:border-gray-700 pt-2">
              {/* Function Select */}
              <div className="flex-1 min-w-0">
                <label className="text-xs text-gray-500 dark:text-gray-400">Function</label>
                <select
                  value={agg.function}
                  onChange={(e) => updateAggregation(agg.id, 'function', e.target.value as AggregationCondition['function'])}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {AGG_FUNCTIONS.map((func) => (
                    <option key={func} value={func}>{func}</option>
                  ))}
                </select>
              </div>

              {/* Column Select */}
              <div className="flex-1 min-w-0">
                <label className="text-xs text-gray-500 dark:text-gray-400">Column</label>
                <select
                  value={isColumnValid ? agg.column : ''} // Reset selection if invalid
                  onChange={(e) => updateAggregation(agg.id, 'column', e.target.value)}
                  disabled={availableCols.length === 0 || (agg.function === 'COUNT' && agg.column === '*')}
                  className={`mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white ${!isColumnValid ? 'border-red-500' : ''}`}
                >
                  <option value="" disabled>-- Select --</option>
                  {availableCols.map((colName) => (
                    <option key={colName} value={colName}>{colName}</option>
                  ))}
                </select>
                {!isColumnValid && agg.column !== '*' && (
                  <p className="text-xs text-red-500 mt-1">Select a valid column for {agg.function}.</p>
                )}
              </div>

              {/* Alias Input */}
              <div className="flex-1 min-w-0">
                <label className="text-xs text-gray-500 dark:text-gray-400">Alias</label>
                <input
                  type="text"
                  value={agg.alias}
                  onChange={(e) => updateAggregation(agg.id, 'alias', e.target.value)}
                  placeholder="Result column name"
                  required
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeAggregation(agg.id)}
                className="mt-5 text-red-500 hover:text-red-700"
                title="Remove Aggregation"
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
