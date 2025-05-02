'use client';

import React from 'react';
import { useAutomatonStore } from '../lib/store';

// スタイル定義 (流用)
const btnStyle = "px-3 py-1 bg-white border-2 border-black text-black font-bold hover:bg-gray-200 active:translate-y-px active:shadow-none shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed";
const inputStyle = "px-2 py-1 bg-white border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full font-mono"; // フォントをmonoに
const labelStyle = "block text-sm font-bold mb-1";
const sectionStyle = "mb-6 p-3 border-2 border-black bg-gray-100 shadow-[4px_4px_0px_rgba(0,0,0,1)]";
const resultStyle = (result: string) => {
    switch (result) {
        case 'Accepted': return 'text-green-600 font-bold';
        case 'Rejected': return 'text-red-600 font-bold';
        case 'Running': return 'text-blue-600';
        case 'Idle': return 'text-gray-500';
        default: return 'text-yellow-600 font-bold'; // Errors
    }
};

export default function SimulationControl() {
    const {
        simulationInput,
        simulationCurrentStep,
        simulationCurrentStateId,
        simulationResult,
        simulationPath,
        automata,
        activeAutomatonId,
        setSimulationInput,
        resetSimulation,
        stepSimulation,
        runSimulation,
    } = useAutomatonStore();

    const activeAutomaton = activeAutomatonId ? automata[activeAutomatonId] : null;
    const currentStateLabel = activeAutomaton?.states.find(s => s.id === simulationCurrentStateId)?.label;
    const pathLabels = simulationPath.map(id => activeAutomaton?.states.find(s => s.id === id)?.label || '??').join(' -> ');

    const handleStep = () => {
        stepSimulation();
    };

    const handleRun = () => {
        runSimulation();
    };

    const handleReset = () => {
        resetSimulation();
    };

    const isSimulationActive = simulationResult === 'Running' || simulationResult === 'Accepted' || simulationResult === 'Rejected' || simulationResult.startsWith('Error');
    const canStep = simulationResult === 'Idle' || simulationResult === 'Running';
    const canRun = simulationResult === 'Idle';

    return (
        <div className="space-y-4">
            <div className={sectionStyle}>
                <label htmlFor="simulationInput" className={labelStyle}>Input String</label>
                <input
                    id="simulationInput"
                    type="text"
                    value={simulationInput}
                    onChange={(e) => setSimulationInput(e.target.value)}
                    className={inputStyle}
                    placeholder="Enter string to test (e.g., abb)"
                    disabled={simulationResult === 'Running'} // 実行中は変更不可
                />
            </div>

            <div className={sectionStyle}>
                <h3 className={`${labelStyle} border-b border-black mb-2 pb-1`}>Controls</h3>
                <div className="flex justify-between gap-2">
                    <button onClick={handleRun} className={btnStyle} disabled={!canRun || !activeAutomaton?.startStateId}>Run</button>
                    <button onClick={handleStep} className={btnStyle} disabled={!canStep || !activeAutomaton?.startStateId}>Step</button>
                    <button onClick={handleReset} className={btnStyle} disabled={!isSimulationActive}>Reset</button>
                </div>
                {!activeAutomaton?.startStateId && simulationResult === 'Idle' && (
                    <p className="text-xs text-yellow-600 mt-1">Warning: Set a start state first.</p>
                )}
            </div>

            <div className={sectionStyle}>
                <h3 className={`${labelStyle} border-b border-black mb-2 pb-1`}>Status</h3>
                <div className="text-sm space-y-1">
                    <p>Result: <span className={resultStyle(simulationResult)}>{simulationResult}</span></p>
                    <p>Current State: <span className="font-bold">{currentStateLabel || '-'}</span> (Step: {simulationCurrentStep})</p>
                    <p className="text-xs break-words">Path: {pathLabels || '-'}</p>
                </div>
            </div>
        </div>
    );
}
