'use client';

import React from 'react';
// import { useRaft } from '@/context/RaftContext'; // パスは後で修正
import { useRaft, EventFilterCategory } from '../context/RaftContext'; // 相対パスと EventFilterCategory をインポート

const ControlPanel: React.FC = () => {
  const {
    isRunning,
    simulationSpeed,
    startSimulation,
    pauseSimulation,
    stepSimulation,
    resetSimulation,
    setSimulationSpeed,
    addNode,
    activeFilters, // フィルター状態を取得
    setActiveFilters, // フィルター更新関数を取得
  } = useRaft();

  const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSimulationSpeed(Number(event.target.value));
  };

  // フィルターのチェックボックス変更ハンドラ
  const handleFilterChange = (category: EventFilterCategory, checked: boolean) => {
    setActiveFilters(prev => {
      const newFilters = new Set(prev);
      if (checked) {
        newFilters.add(category);
      } else {
        newFilters.delete(category);
      }
      return newFilters;
    });
  };

  // フィルターカテゴリーの定義 (UI表示用)
  const filterCategories: { key: EventFilterCategory, label: string }[] = [
    { key: 'StateChange', label: '状態変化' },
    { key: 'Voting', label: '投票' },
    { key: 'LogReplication', label: 'ログ/HB' },
    { key: 'Cluster', label: 'クラスター' },
    { key: 'Timer', label: 'タイマー' },
    { key: 'Messaging', label: 'メッセージ詳細' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-3">Controls</h2>
        <div className="space-y-3">
          {/* Start/Pause/Step Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={isRunning ? pauseSimulation : startSimulation}
              className={`flex-1 px-3 py-2 rounded text-white ${isRunning ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'
                }`}
            >
              {isRunning ? 'Pause' : 'Start'}
            </button>
            <button
              onClick={stepSimulation}
              disabled={isRunning}
              className="flex-1 px-3 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Step
            </button>
          </div>

          {/* Reset Button */}
          <button
            onClick={() => resetSimulation()}
            className="w-full px-3 py-2 rounded bg-red-500 hover:bg-red-600 text-white"
          >
            Reset Cluster
          </button>

          {/* Add Node Button */}
          <button
            onClick={addNode}
            className="w-full px-3 py-2 rounded bg-indigo-500 hover:bg-indigo-600 text-white"
          >
            Add Node
          </button>

          {/* Simulation Speed Slider */}
          <div className="pt-2">
            <label htmlFor="speed" className="block text-sm font-medium mb-1">
              Simulation Speed (ms/step): {simulationSpeed}
            </label>
            <input
              type="range"
              id="speed"
              min="50"
              max="2000"
              step="50"
              value={simulationSpeed}
              onChange={handleSpeedChange}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>Fast</span>
              <span>Slow</span>
            </div>
          </div>
        </div>
      </div>

      {/* Event Log Filters */}
      <div className="mt-6 pt-4 border-t border-gray-300 dark:border-gray-600">
        <h3 className="text-md font-semibold mb-3">Log Filters</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {filterCategories.map(({ key, label }) => (
            <label key={key} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={activeFilters.has(key)}
                onChange={(e) => handleFilterChange(key, e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
