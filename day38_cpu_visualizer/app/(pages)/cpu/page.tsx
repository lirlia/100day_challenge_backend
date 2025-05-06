"use client"; // ステートを持つため Client Component

import { useCpuSimulator } from '../../_lib/cpuEngine'; // 相対パスに変更
import { OpCode } from '../../_lib/types'; // OpCodeもインポートしてHALTチェックなどに使える

export default function CpuPage() {
  // const initialJs = "let a = 10;\\nlet b = 5;\\nlet sum = a + b;\\n// Add a HALT instruction to stop execution\\nHALT;";
  const initialJs = `let a = 10;
let b = 5;
let sum = a + b;
// Add a HALT instruction to stop execution
HALT;`;
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
    <div className="container mx-auto p-2 md:p-4 min-h-screen flex flex-col items-center selection:bg-green-500 selection:text-black">
      <header className="mb-4 md:mb-6 text-center w-full">
        <h1 className="text-4xl md:text-5xl font-bold text-green-400 py-1 md:py-2 font-mono">
          Day38 :: CPU_Visualizer_v1.0
        </h1>
        <p className="text-green-600 mt-1 md:mt-2 text-base md:text-lg font-mono">
          -- Visualize simple JS execution at CPU level --
        </p>
      </header>

      {/* Main content area - adjusted for better one-page fit */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-3 w-full max-w-screen-xl px-2 md:px-4 flex-grow">
        {/* Column 1: JS Input & Controls */}
        <section className="lg:col-span-1 flex flex-col gap-3">
          <div className="terminal-panel flex-grow flex flex-col">
            <h2 className="text-xl font-semibold mb-2 text-green-500 font-mono">// JavaScript_Input</h2>
            <textarea
              className="terminal-input w-full flex-grow p-2 text-xs font-mono min-h-[100px]" // Adjusted height
              value={simulator.rawJsCode}
              onChange={(e) => simulator.compileAndLoad(e.target.value)}
              placeholder="> let x = 10;\n> let y = 20;\n> let z = x + y;\n> HALT;"
              spellCheck="false"
            />
            <button
              onClick={() => simulator.compileAndLoad(simulator.rawJsCode)}
              className="mt-2 w-full terminal-button-accent py-2"
            >
              [ Compile & Load ]
            </button>
          </div>
          <div className="terminal-panel flex flex-col space-y-2 p-3"> {/* Adjusted padding & spacing */}
            <h2 className="text-xl font-semibold mb-1 text-green-500 font-mono">// Controls</h2>
            <button
              onClick={simulator.step}
              disabled={!simulator.cpuState.isRunning || !simulator.isProgramLoaded()}
              className="w-full terminal-button disabled:opacity-50 disabled:cursor-not-allowed py-1.5 text-sm" // Adjusted padding & text size
            >
              Step_Execute (PC: {simulator.cpuState.registers.pc})
            </button>
            <button onClick={() => simulator.reset(true)} className="w-full terminal-button py-1.5 text-sm">
              Reset_CPU_State
            </button>
            <button onClick={() => simulator.reset(false)} className="w-full terminal-button-danger py-1.5 text-sm">
              Reset_All_(Clear_Code)
            </button>
          </div>
        </section>

        {/* Column 2 & 3: Assembly, Machine Code, Registers, Memory */}
        <section className="lg:col-span-2 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="terminal-panel flex flex-col min-h-[240px] md:min-h-[280px]"> {/* Adjusted height */}
              <h2 className="text-xl font-semibold mb-2 text-green-500 font-mono">// Assembly_Output</h2>
              <pre className="flex-grow w-full p-1.5 bg-black/30 border border-green-700/50 rounded-sm text-[11px] font-mono overflow-auto pretty-scrollbar">
                {assemblyLinesForDisplay.length === 0 && <span className="text-green-700">Waiting for JS compilation...</span>}
                {assemblyLinesForDisplay.map((line, index) => (
                  <div key={`asm-${index}`} className={`whitespace-pre-wrap py-0.5 px-1 rounded-sm transition-colors ${index === simulator.cpuState.currentAssemblyLine && simulator.cpuState.isRunning ? 'bg-green-700/60 text-yellow-300 ring-1 ring-green-400' : 'hover:bg-black/40'}`}>
                    <span className="text-green-700 select-none mr-1">{index.toString().padStart(2, '0')}:</span>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
            <div className="terminal-panel flex flex-col min-h-[240px] md:min-h-[280px]"> {/* Adjusted height */}
              <h2 className="text-xl font-semibold mb-2 text-green-500 font-mono">// Machine_Code_(Hex)</h2>
              <pre className="flex-grow w-full p-1.5 bg-black/30 border border-green-700/50 rounded-sm text-[11px] font-mono overflow-auto pretty-scrollbar">
                {machineCodeLinesForDisplay.length === 0 && <span className="text-green-700">Waiting for JS compilation...</span>}
                {machineCodeLinesForDisplay.map((line, index) => (
                  <div key={`mc-${index}`} className={`whitespace-pre-wrap py-0.5 px-1 rounded-sm transition-colors ${index === simulator.cpuState.currentAssemblyLine && simulator.cpuState.isRunning ? 'bg-blue-700/60 text-yellow-300 ring-1 ring-blue-400' : 'hover:bg-black/40'}`}>
                    <span className="text-green-700 select-none mr-1">{(index * 2).toString(16).padStart(4, '0').toUpperCase()}:</span>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
          </div>

          <div className="terminal-panel cpu-package-panel p-3">
            <h2 className="text-lg font-semibold mb-2 text-green-500 font-mono text-center">
              // Central_Processing_Unit - Register_Array
            </h2>
            <div className="cpu-die-surface">
              <div className="grid grid-cols-3 gap-1.5 md:gap-2 p-2">
                <div className="terminal-register-block">
                  <div className="terminal-register-name">PC</div>
                  <div className="terminal-register-value">{displayRegisters.PC}</div>
                </div>
                <div className="terminal-register-block">
                  <div className="terminal-register-name">ACC</div>
                  <div className="terminal-register-value">{displayRegisters.ACC}</div>
                </div>
                <div className="terminal-register-block">
                  <div className="terminal-register-name">FLAGS</div>
                  <div className="terminal-register-value text-xs md:text-sm">{displayRegisters.FLAGS}</div>
                </div>
                <div className="terminal-register-block">
                  <div className="terminal-register-name">R0</div>
                  <div className="terminal-register-value">{displayRegisters.R0}</div>
                </div>
                <div className="terminal-register-block">
                  <div className="terminal-register-name">R1</div>
                  <div className="terminal-register-value">{displayRegisters.R1}</div>
                </div>
                <div className="terminal-register-block">
                  <div className="terminal-register-name">R2</div>
                  <div className="terminal-register-value">{displayRegisters.R2}</div>
                </div>
              </div>
            </div>
            <p className={`mt-2 text-xs font-semibold font-mono ${simulator.cpuState.isRunning ? 'text-green-400 animate-pulse' : 'text-red-500'}`}>
              CPU_Status: {simulator.cpuState.isRunning ? 'RUNNING...' : 'HALTED.'}
            </p>
          </div>

          <div className="terminal-panel p-3">
            <h2 className="text-lg font-semibold mb-2 text-green-500 font-mono">// Memory_View_(Sim)</h2>
            {displayMemory.length === 0 ? (
                 <p className="text-green-700 text-xs font-mono">Memory bank empty.</p>
            ) : (
                <div className="space-y-0.5 text-[10px] font-mono max-h-[60px] overflow-auto pretty-scrollbar"> {/* Adjusted max-h and spacing */}
                {displayMemory.map((memEntry, index) => (
                    <div key={`mem-${index}`} className="flex justify-between p-0.5 bg-black/40 rounded-sm hover:bg-black/60">
                    <span className="text-green-700">{memEntry.address}:</span>
                    <span className="text-blue-400">{memEntry.value}</span>
                    </div>
                ))}
                </div>
            )}
             <p className="text-[9px] text-green-700 mt-1 font-mono">Note: Simplified memory representation.</p>
          </div>
        </section>
      </main>

      <footer className="mt-4 mb-2 md:mt-6 text-center text-green-700 text-xs font-mono">
        <p>&copy; {new Date().getFullYear()} CYBER_CPU_SIM. All rights reserved by Day38_BIOS_Inc.</p>
      </footer>
    </div>
  );
}
