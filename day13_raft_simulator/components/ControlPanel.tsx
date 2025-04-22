'use client';

import React from 'react';
// import { useRaft } from '@/context/RaftContext'; // パスは後で修正
import { useRaft } from '../context/RaftContext'; // 相対パス

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
  } = useRaft();

  const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSimulationSpeed(Number(event.target.value));
  };

  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold mb-3">Controls</h2>
      <div className="space-y-3">
        {/* Start/Pause/Step Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={isRunning ? pauseSimulation : startSimulation}
            className={`flex-1 px-3 py-2 rounded text-white ${
              isRunning ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'
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
  );
};

export default ControlPanel;
