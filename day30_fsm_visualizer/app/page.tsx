'use client';

import React, { useEffect } from 'react';
import AutomatonGraph from '../components/AutomatonGraph';
import DefinitionForm from '../components/DefinitionForm';
import AutomatonSelector from '../components/AutomatonSelector';
import SimulationControl from '../components/SimulationControl';
import { useAutomatonStore } from '../lib/store';

export default function Home() {
  useEffect(() => {
    useAutomatonStore.getState().loadInitialData();
  }, []);

  return (
    <main className="flex flex-col md:flex-row min-h-screen bg-gray-100 text-gray-900 font-mono">
      {/* Left Panel: Definition Form & Selector */}
      <div className="w-full md:w-1/4 p-4 bg-gray-200 border-r-4 border-black overflow-y-auto flex flex-col">
        <h2 className="text-2xl font-bold border-b-4 border-black mb-4 pb-2 flex-shrink-0">Day30 - Finite State Machine Visualizer</h2>
        {/* Automaton Selector */}
        <div className="flex-shrink-0">
             <AutomatonSelector />
        </div>
        {/* Definition Form (takes remaining space) */}
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
            <DefinitionForm />
        </div>
      </div>

      {/* Center Panel: Graph Visualization */}
      <div className="w-full md:w-1/2 p-4 bg-white border-r-4 border-black relative flex-grow">
        <h2 className="text-2xl font-bold border-b-4 border-black mb-4 pb-2">Visualization</h2>
        <div className="w-full h-[calc(100vh-150px)] border-2 border-dashed border-gray-400">
          <AutomatonGraph />
        </div>
      </div>

      {/* Right Panel: Simulation */}
      <div className="w-full md:w-1/4 p-4 bg-gray-200 overflow-y-auto">
        <h2 className="text-2xl font-bold border-b-4 border-black mb-4 pb-2">Simulation</h2>
        {/* Simulation controls and results will go here */}
        <SimulationControl />
      </div>
    </main>
  );
}
