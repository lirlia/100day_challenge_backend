"use client"; // ステートを持つため Client Component

import { useState } from 'react';

export default function CpuPage() {
  const [jsCode, setJsCode] = useState<string>("let a = 10;\nlet b = 20;\nlet sum = a + b;");
  const [assemblyCode, setAssemblyCode] = useState<string[]>([
    "LOAD_VAL 10, R0",
    "STORE_VAL R0, a",
    "LOAD_VAL 20, R1",
    "STORE_VAL R1, b",
    "LOAD_MEM a, R0",
    "LOAD_MEM b, R1",
    "ADD R0, R1, R2",
    "STORE_VAL R2, sum",
  ]);
  const [machineCode, setMachineCode] = useState<string[]>([
    "0x100A00",
    "0x200000", // 仮の値
    "0x101401",
    "0x200101", // 仮の値
    "0x300000", // 仮の値
    "0x300101", // 仮の値
    "0x400001",
    "0x200202", // 仮の値
  ]);
  const [registers, setRegisters] = useState<{ [key: string]: string | number }>({
    PC: "0x0000",
    ACC: 0,
    R0: 0,
    R1: 0,
    R2: 0,
    FLAGS: "Z N C V",
  });
  const [memory, setMemory] = useState<{ address: string; value: string }[]>([
    { address: "0x1000 (a)", value: "0 (初期値)" },
    { address: "0x1004 (b)", value: "0 (初期値)" },
    { address: "0x1008 (sum)", value: "0 (初期値)" },
  ]);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const handleStep = () => {
    // TODO: CPU実行ロジックを呼び出し、各状態を更新
    console.log("Stepping through code...");
    if (currentStep < assemblyCode.length -1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleReset = () => {
    // TODO: 状態を初期化
    setJsCode("let a = 10;\nlet b = 20;\nlet sum = a + b;");
    setCurrentStep(0);
    // 他のステートも初期化
    console.log("Resetting state...");
  };

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center">
      <header className="mb-8 text-center">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 py-2">
          Day38 - CPU Visualizer
        </h1>
        <p className="text-gray-400 mt-2">
          簡単なJavaScriptコードの実行をステップごとに視覚化します。
        </p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-7xl">
        {/* Code Input & Controls */}
        <section className="md:col-span-1 space-y-6">
          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">JavaScript Code</h2>
            <textarea
              className="w-full h-48 p-3 bg-gray-700/50 border border-gray-600 rounded-md text-sm font-mono focus:ring-purple-500 focus:border-purple-500"
              value={jsCode}
              onChange={(e) => setJsCode(e.target.value)}
              placeholder="Enter simple JS code here (e.g., let x = 10;)"
            />
          </div>
          <div className="glassmorphism-panel p-6 flex flex-col space-y-4">
            <h2 className="text-2xl font-semibold mb-2 text-purple-300">Controls</h2>
            <button
              onClick={handleStep}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
            >
              Step Execute
            </button>
            <button
              onClick={handleReset}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
            >
              Reset
            </button>
             {/* TODO: Compile button */}
          </div>
        </section>

        {/* Assembly and Machine Code */}
        <section className="md:col-span-1 space-y-6">
          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Assembly Code</h2>
            <pre className="w-full h-72 p-3 bg-gray-700/50 border border-gray-600 rounded-md text-sm font-mono overflow-auto">
              {assemblyCode.map((line, index) => (
                <div key={index} className={`${index === currentStep ? 'bg-purple-500/30 text-yellow-300' : ''} py-0.5 px-1 rounded-sm`}>
                  {`${index.toString().padStart(2, '0')}: ${line}`}
                </div>
              ))}
            </pre>
          </div>
          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Machine Code (Hex)</h2>
            <pre className="w-full h-72 p-3 bg-gray-700/50 border border-gray-600 rounded-md text-sm font-mono overflow-auto">
              {machineCode.map((line, index) => (
                <div key={index} className={`${index === currentStep ? 'bg-pink-500/30 text-yellow-300' : ''} py-0.5 px-1 rounded-sm`}>
                  {`${(index * 4).toString(16).padStart(4, '0')}: ${line}`}
                </div>
              ))}
            </pre>
          </div>
        </section>

        {/* Registers and Memory */}
        <section className="md:col-span-1 space-y-6">
          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Registers</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-mono">
              {Object.entries(registers).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-400">{key}:</span>
                  <span className="text-purple-300">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Memory View</h2>
            <div className="space-y-1 text-sm font-mono">
              {memory.map((memEntry, index) => (
                <div key={index} className="flex justify-between p-1 bg-gray-700/30 rounded-sm">
                  <span className="text-gray-400">{memEntry.address}:</span>
                  <span className="text-pink-300">{memEntry.value}</span>
                </div>
              ))}
            </div>
             <p className="text-xs text-gray-500 mt-3">Simplified memory view. Actual addresses and values will depend on the simulation.</p>
          </div>
        </section>
      </main>

      <footer className="mt-12 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Day38 Challenge. Inspired by CPU architecture.</p>
      </footer>
    </div>
  );
}