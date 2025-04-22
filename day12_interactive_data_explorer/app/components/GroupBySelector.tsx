'use client';

import React from 'react';

// Assume ColumnInfo is imported or defined elsewhere
interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'other';
  isNumeric: boolean;
  isDate: boolean;
}

interface GroupBySelectorProps {
  columns: ColumnInfo[];
  selectedGroups: string[];
  onGroupsChange: (newGroups: string[]) => void;
}

export default function GroupBySelector({ columns, selectedGroups, onGroupsChange }: GroupBySelectorProps) {

  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;
    let newGroups;
    if (checked) {
      newGroups = [...selectedGroups, value];
    } else {
      newGroups = selectedGroups.filter((group) => group !== value);
    }
    onGroupsChange(newGroups);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
      <h2 className="text-lg font-semibold mb-2">Group By</h2>
      {columns.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Select a dataset first.</p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-1">
          {columns.map((col) => (
            <div key={col.name} className="flex items-center">
              <input
                id={`group-${col.name}`}
                name="groupByColumn"
                type="checkbox"
                value={col.name}
                checked={selectedGroups.includes(col.name)}
                onChange={handleCheckboxChange}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor={`group-${col.name}`} className="ml-2 block text-sm font-mono text-gray-900 dark:text-gray-300 truncate" title={col.name}>
                {col.name}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
