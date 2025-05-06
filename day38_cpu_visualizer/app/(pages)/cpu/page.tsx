"use client"; // ステートを持つため Client Component

import { useCpuSimulator } from '../../_lib/cpuEngine'; // 相対パスに変更
import { OpCode } from '../../_lib/types'; // OpCodeもインポートしてHALTチェックなどに使える

export default function CpuPage() {
  const initialJs = "let a = 10;\nlet b = 5;\nlet sum = a + b;\n// Add a HALT instruction to stop execution\nHALT;";
  const simulator = useCpuSimulator(initialJs);

  const assemblyLinesForDisplay = simulator.getAssemblyForDisplay();
  const machineCodeLinesForDisplay = simulator.getMachineCodeForDisplay();

  const { pc, acc, r0, r1, r2, flags } = simulator.cpuState.registers;
  const displayRegisters = {
    PC: pc.toString(16).padStart(4, '0').toUpperCase(),
    ACC: acc,
    R0: r0,
    R1: r1,
    R2: r2,
    FLAGS: `Z:${flags.zero ? 1:0} C:${flags.carry ? 1:0}`,
  };

  // メモリ表示: cpuState.memoryは Instruction[] には存在しないため、cpuEngine.ts の CpuState.memory (Record<string, number>) を使う想定で修正が必要。
  // 現状の cpuEngine.ts ではメモリはあまり活用されていないが、表示だけは cpuState.memory から行う。
  const displayMemory = Object.entries(simulator.cpuState.memory)
    .map(([address, value]) => ({ address, value: String(value) }))
    .slice(0, 10); // Display first 10 memory entries for brevity

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center selection:bg-green-500 selection:text-black">
      <header className="mb-8 text-center w-full">
        <h1 className="text-5xl font-bold text-green-400 py-2 font-mono">
          Day38 :: CPU_Visualizer_v1.0
        </h1>
        <p className="text-green-600 mt-2 text-lg font-mono">
          -- Visualize simple JS execution at CPU level --
        </p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-screen-2xl px-4">
        {/* Code Input & Controls */}
        <section className="lg:col-span-1 space-y-6">
          <div className="terminal-panel">
            <h2 className="text-2xl font-semibold mb-4 text-green-500 font-mono">// JavaScript_Input</h2>
            <textarea
              className="terminal-input w-full h-60 p-3 text-sm font-mono"
              value={simulator.rawJsCode}
              onChange={(e) => simulator.compileAndLoad(e.target.value)}
              placeholder="> let x = 10;\n> let y = 20;\n> let z = x + y;\n> HALT;"
              spellCheck="false"
            />
            <button
              onClick={() => simulator.compileAndLoad(simulator.rawJsCode)}
              className="mt-4 w-full terminal-button-accent"
            >
              [ Compile & Load ]
            </button>
          </div>

          <div className="terminal-panel flex flex-col space-y-4">
            <h2 className="text-2xl font-semibold mb-2 text-green-500 font-mono">// Controls</h2>
            <button
              onClick={simulator.step}
              disabled={!simulator.cpuState.isRunning || !simulator.isProgramLoaded()}
              className="w-full terminal-button disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Step_Execute (PC: {simulator.cpuState.registers.pc})
            </button>
            <button
              onClick={() => simulator.reset(true)}
              className="w-full terminal-button"
            >
              Reset_CPU_State
            </button>
             <button
              onClick={() => simulator.reset(false)}
              className="w-full terminal-button-danger"
            >
              Reset_All_(Clear_Code)
            </button>
          </div>
        </section>

        {/* Assembly and Machine Code */}
        <section className="lg:col-span-1 space-y-6">
          <div className="terminal-panel h-full flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-green-500 font-mono">// Assembly_Output</h2>
            <pre className="flex-grow w-full p-3 bg-black/30 border border-green-700/50 rounded-sm text-xs font-mono overflow-auto pretty-scrollbar">
              {assemblyLinesForDisplay.length === 0 && <span className="text-green-700">Waiting for JS compilation...</span>}
              {assemblyLinesForDisplay.map((line, index) => (
                <div key={`asm-${index}`} className={`whitespace-pre-wrap py-0.5 px-2 rounded-sm transition-colors ${index === simulator.cpuState.currentAssemblyLine && simulator.cpuState.isRunning ? 'bg-green-700/60 text-yellow-300 ring-1 ring-green-400' : 'hover:bg-black/40'}`}>
                  <span className="text-green-700 select-none mr-2">{index.toString().padStart(2, '0')}:</span>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </section>

        <section className="lg:col-span-1 space-y-6">
           <div className="terminal-panel h-full flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-green-500 font-mono">// Machine_Code_(Hex)</h2>
            <pre className="flex-grow w-full p-3 bg-black/30 border border-green-700/50 rounded-sm text-xs font-mono overflow-auto pretty-scrollbar">
              {machineCodeLinesForDisplay.length === 0 && <span className="text-green-700">Waiting for JS compilation...</span>}
              {machineCodeLinesForDisplay.map((line, index) => (
                <div key={`mc-${index}`} className={`whitespace-pre-wrap py-0.5 px-2 rounded-sm transition-colors ${index === simulator.cpuState.currentAssemblyLine && simulator.cpuState.isRunning ? 'bg-blue-700/60 text-yellow-300 ring-1 ring-blue-400' : 'hover:bg-black/40'}`}>
                  <span className="text-green-700 select-none mr-2">{(index * 2).toString(16).padStart(4, '0').toUpperCase()}:</span>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </section>


        {/* Registers and Memory - Combined or separate as preferred */}
        <section className="lg:col-span-full grid md:grid-cols-2 gap-6 mt-0 md:mt-6">
          <div className="terminal-panel">
            <h2 className="text-2xl font-semibold mb-4 text-green-500 font-mono">// CPU_Registers</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm font-mono">
              {Object.entries(displayRegisters).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center border-b border-green-700/50 pb-1">
                  <span className="text-green-600 mr-2">{key}:</span>
                  <span className="text-green-300 text-lg font-semibold">{String(value)}</span>
                </div>
              ))}
            </div>
             <p className={`mt-4 text-sm font-semibold font-mono ${simulator.cpuState.isRunning ? 'text-green-400 animate-pulse' : 'text-red-500'}`}>
                CPU_Status: {simulator.cpuState.isRunning ? 'RUNNING...' : 'HALTED.'}
             </p>
          </div>

          <div className="terminal-panel">
            <h2 className="text-2xl font-semibold mb-4 text-green-500 font-mono">// Memory_View_(Sim)</h2>
            {displayMemory.length === 0 ? (
                 <p className="text-green-700 text-sm font-mono">Memory bank empty. Use STORE op to load data.</p>
            ) : (
                <div className="space-y-1 text-xs font-mono max-h-48 overflow-auto pretty-scrollbar">
                {displayMemory.map((memEntry, index) => (
                    <div key={`mem-${index}`} className="flex justify-between p-1.5 bg-black/40 rounded-sm hover:bg-black/60">
                    <span className="text-green-700">{memEntry.address}:</span>
                    <span className="text-blue-400">{memEntry.value}</span>
                    </div>
                ))}
                </div>
            )}
             <p className="text-xs text-green-700 mt-3 font-mono">Note: Simplified memory representation.</p>
          </div>
        </section>
      </main>

      <footer className="mt-12 mb-6 text-center text-green-700 text-sm font-mono">
        <p>&copy; {new Date().getFullYear()} CYBER_CPU_SIM. All rights reserved by Day38_BIOS_Inc.</p>
      </footer>
      <style jsx global>{`
        .pretty-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .pretty-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.3); /* Darker track for terminal theme */
          border-radius: 10px;
        }
        .pretty-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(22, 163, 74, 0.5); /* green-600 with opacity */
          border-radius: 10px;
        }
        .pretty-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(22, 163, 74, 0.7); /* green-600 with more opacity */
        }
      `}</style>
    </div>
  );
}
