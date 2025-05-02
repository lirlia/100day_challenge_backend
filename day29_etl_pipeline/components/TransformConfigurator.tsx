'use client';

import React, { useState, useCallback } from 'react';
import type { TransformConfig, TransformStep } from '../app/_lib/etl'; // Import types

interface TransformConfiguratorProps {
  availableColumns: string[]; // Available columns from the source
  config: TransformConfig;
  onConfigChange: (newConfig: TransformConfig) => void;
  disabled?: boolean;
}

// Define more specific types for each step for easier state management
type EditableTransformStep = TransformStep & { id: string };

export function TransformConfigurator({ availableColumns, config, onConfigChange, disabled }: TransformConfiguratorProps) {

  const addStep = (type: TransformStep['type']) => {
    let newStep: Partial<TransformStep> = { type };
    // Set default values based on type
    switch(type) {
        case 'selectColumns': newStep.columns = availableColumns.slice(0, 1); break; // Default to first column
        case 'toUpperCase':
        case 'toLowerCase': newStep.column = availableColumns[0]; break;
        case 'addConstant':
        case 'multiplyConstant': newStep.column = availableColumns[0]; newStep.value = 0; break;
        case 'filter': newStep.column = availableColumns[0]; newStep.operator = '=='; newStep.value = ''; break;
    }
    // Add a temporary unique ID for React keys
    const stepWithId: EditableTransformStep = { ...newStep as TransformStep, id: crypto.randomUUID() };
    onConfigChange([...config, stepWithId]);
  };

  const updateStep = (index: number, updatedStep: Partial<TransformStep>) => {
    const newConfig = [...config];
    // Merge existing step with updates
    newConfig[index] = { ...newConfig[index], ...updatedStep };
    onConfigChange(newConfig);
  };

  const removeStep = (index: number) => {
    const newConfig = config.filter((_, i) => i !== index);
    onConfigChange(newConfig);
  };

  const renderStepInputs = (step: EditableTransformStep, index: number) => {
    switch (step.type) {
      case 'selectColumns':
        return (
          <div className="flex flex-wrap gap-2">
            <label className="w-full text-sm font-medium">含める列:</label>
            {availableColumns.map(col => (
              <label key={col} className="flex items-center space-x-1 text-sm">
                <input
                  type="checkbox"
                  checked={step.columns.includes(col)}
                  onChange={(e) => {
                    const newColumns = e.target.checked
                      ? [...step.columns, col]
                      : step.columns.filter((c: string) => c !== col);
                    updateStep(index, { columns: newColumns });
                  }}
                  disabled={disabled}
                  className="disabled:opacity-50"
                />
                <span>{col}</span>
              </label>
            ))}
          </div>
        );
      case 'toUpperCase':
      case 'toLowerCase':
        return (
          <select
            value={step.column}
            onChange={(e) => updateStep(index, { column: e.target.value })}
            disabled={disabled}
            className="p-1 border rounded text-sm w-full disabled:opacity-50"
          >
            {availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
          </select>
        );
      case 'addConstant':
      case 'multiplyConstant':
        return (
          <div className="flex items-center space-x-2">
            <select
              value={step.column}
              onChange={(e) => updateStep(index, { column: e.target.value })}
              disabled={disabled}
              className="p-1 border rounded text-sm disabled:opacity-50"
            >
              {availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
            </select>
            <input
              type="number"
              value={step.value}
              onChange={(e) => updateStep(index, { value: parseFloat(e.target.value) || 0 })}
              disabled={disabled}
              className="p-1 border rounded text-sm w-20 disabled:opacity-50"
            />
          </div>
        );
      case 'filter':
        return (
          <div className="flex items-center space-x-2 flex-wrap">
            <select
              value={step.column}
              onChange={(e) => updateStep(index, { column: e.target.value })}
              disabled={disabled}
              className="p-1 border rounded text-sm disabled:opacity-50"
            >
              {availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
            </select>
            <select
              value={step.operator}
              onChange={(e) => updateStep(index, { operator: e.target.value as TransformStep['operator'] })}
              disabled={disabled}
              className="p-1 border rounded text-sm disabled:opacity-50"
            >
              <option value="==">==</option>
              <option value="!=">!=</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
            </select>
            <input
              type="text" // Use text for flexibility (handle number conversion in ETL)
              value={step.value}
              onChange={(e) => updateStep(index, { value: e.target.value })}
              disabled={disabled}
              className="p-1 border rounded text-sm w-24 disabled:opacity-50"
              placeholder="値"
            />
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">変換ステップ</h3>
      {config.length === 0 && <p className="text-sm text-gray-500">変換ステップはありません。</p>}
      {config.map((step, index) => (
        <div key={(step as EditableTransformStep).id || index} className="border p-3 rounded bg-gray-50 space-y-2">
            <div className="flex justify-between items-center">
                <span className="font-medium text-sm capitalize">{step.type.replace(/([A-Z])/g, ' $1')}</span>
                <button
                    type="button"
                    onClick={() => removeStep(index)}
                    disabled={disabled}
                    className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title="ステップ削除"
                >
                    削除
                </button>
            </div>
            {renderStepInputs(step as EditableTransformStep, index)}
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-2 border-t mt-4">
        <button type="button" onClick={() => addStep('selectColumns')} disabled={disabled || availableColumns.length === 0} className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">列選択 追加</button>
        <button type="button" onClick={() => addStep('toUpperCase')} disabled={disabled || availableColumns.length === 0} className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">大文字化 追加</button>
        <button type="button" onClick={() => addStep('toLowerCase')} disabled={disabled || availableColumns.length === 0} className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">小文字化 追加</button>
        <button type="button" onClick={() => addStep('addConstant')} disabled={disabled || availableColumns.length === 0} className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">定数加算 追加</button>
        <button type="button" onClick={() => addStep('multiplyConstant')} disabled={disabled || availableColumns.length === 0} className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">定数乗算 追加</button>
        <button type="button" onClick={() => addStep('filter')} disabled={disabled || availableColumns.length === 0} className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">フィルタ 追加</button>
      </div>
    </div>
  );
}
