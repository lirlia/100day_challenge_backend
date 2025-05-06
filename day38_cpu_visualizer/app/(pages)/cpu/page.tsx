"use client"; // ステートを持つため Client Component

import { useCpuSimulator } from '../../_lib/cpuEngine'; // 相対パスに変更
import { OpCode } from '../../_lib/types'; // OpCodeもインポートしてHALTチェックなどに使える

export default function CpuPage() {
  const initialJs = "let a = 10;\\nlet b = 5;\\nlet sum = a + b;\\n// Add a HALT instruction to stop execution\\nHALT;";
  const simulator = useCpuSimulator(initialJs);

  const handleJsCodeChangeAndCompile = (newCode: string) => {
    simulator.compileAndLoad(newCode);
  };

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
    <div className="container mx-auto p-4 min-h-screen flex flex-col items-center selection:bg-purple-500 selection:text-white">
      <header className="mb-8 text-center w-full">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-red-400 py-2">
          Day38 - CPU Visualizer
        </h1>
        <p className="text-gray-400 mt-2 text-lg">
          シンプルなJavaScriptコードのCPUレベルでの実行をステップごとに追体験。
        </p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-screen-2xl px-4">
        {/* Code Input & Controls */}
        <section className="lg:col-span-1 space-y-6">
          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">JavaScript Code</h2>
            <textarea
              className="w-full h-60 p-3 bg-gray-800/60 border border-gray-700 rounded-md text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none placeholder-gray-500"
              value={simulator.rawJsCode}
              onChange={(e) => simulator.compileAndLoad(e.target.value)} // 直接 rawJsCode を更新し、再コンパイルを促す
              placeholder="例:\nlet x = 10;\nlet y = 20;\nlet z = x + y;\nHALT;"
              spellCheck="false"
            />
            <button
              onClick={() => simulator.compileAndLoad(simulator.rawJsCode)}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              Compile & Load
            </button>
          </div>

          <div className="glassmorphism-panel p-6 flex flex-col space-y-4">
            <h2 className="text-2xl font-semibold mb-2 text-purple-300">Controls</h2>
            <button
              onClick={simulator.step}
              disabled={!simulator.cpuState.isRunning || !simulator.isProgramLoaded()}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:cursor-not-allowed"
            >
              Step Execute (PC: {simulator.cpuState.registers.pc})
            </button>
            <button
              onClick={() => simulator.reset(true)} // Keep JS code
              className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-pink-400"
            >
              Reset CPU State
            </button>
             <button
              onClick={() => simulator.reset(false)} // Clear JS code
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              Reset All (Clear Code)
            </button>
          </div>
        </section>

        {/* Assembly and Machine Code */}
        <section className="lg:col-span-1 space-y-6">
          <div className="glassmorphism-panel p-6 h-full flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Assembly Code</h2>
            <pre className="flex-grow w-full p-3 bg-gray-800/60 border border-gray-700 rounded-md text-sm font-mono overflow-auto pretty-scrollbar">
              {assemblyLinesForDisplay.length === 0 && <span className="text-gray-500">JSコードをコンパイルしてください...</span>}
              {assemblyLinesForDisplay.map((line, index) => (
                <div key={`asm-${index}`} className={`whitespace-pre-wrap py-0.5 px-2 rounded-sm transition-colors ${index === simulator.cpuState.currentAssemblyLine && simulator.cpuState.isRunning ? 'bg-purple-600/50 text-yellow-300 ring-1 ring-purple-400' : 'hover:bg-gray-700/50'}`}>
                  <span className="text-gray-500 select-none mr-2">{index.toString().padStart(2, '0')}:</span>
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </section>

        <section className="lg:col-span-1 space-y-6">
           <div className="glassmorphism-panel p-6 h-full flex flex-col">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Machine Code (Hex)</h2>
            <pre className="flex-grow w-full p-3 bg-gray-800/60 border border-gray-700 rounded-md text-sm font-mono overflow-auto pretty-scrollbar">
              {machineCodeLinesForDisplay.length === 0 && <span className="text-gray-500">JSコードをコンパイルしてください...</span>}
              {machineCodeLinesForDisplay.map((line, index) => (
                <div key={`mc-${index}`} className={`whitespace-pre-wrap py-0.5 px-2 rounded-sm transition-colors ${index === simulator.cpuState.currentAssemblyLine && simulator.cpuState.isRunning ? 'bg-pink-600/50 text-yellow-300 ring-1 ring-pink-400' : 'hover:bg-gray-700/50'}`}>
                  <span className="text-gray-500 select-none mr-2">{(index * 2).toString(16).padStart(4, '0').toUpperCase()}:</span> {/* Assuming each instruction is 2 bytes for display address */}
                  {line}
                </div>
              ))}
            </pre>
          </div>
        </section>


        {/* Registers and Memory - Combined or separate as preferred */}
        <section className="lg:col-span-full grid md:grid-cols-2 gap-6 mt-0 md:mt-6">
          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">CPU Registers</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm font-mono">
              {Object.entries(displayRegisters).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center border-b border-gray-700/50 pb-1">
                  <span className="text-gray-400 mr-2">{key}:</span>
                  <span className="text-purple-300 text-lg font-semibold">{String(value)}</span>
                </div>
              ))}
            </div>
             <p className={`mt-4 text-sm font-semibold ${simulator.cpuState.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                CPU Status: {simulator.cpuState.isRunning ? 'Running' : 'Halted'}
             </p>
          </div>

          <div className="glassmorphism-panel p-6">
            <h2 className="text-2xl font-semibold mb-4 text-purple-300">Memory View (Simplified)</h2>
            {displayMemory.length === 0 ? (
                 <p className="text-gray-500 text-sm">メモリは現在空です。STORE命令などで値が書き込まれます。</p>
            ) : (
                <div className="space-y-1 text-sm font-mono max-h-48 overflow-auto pretty-scrollbar">
                {displayMemory.map((memEntry, index) => (
                    <div key={`mem-${index}`} className="flex justify-between p-1.5 bg-gray-800/50 rounded-sm hover:bg-gray-700/70">
                    <span className="text-gray-400">{memEntry.address}:</span>
                    <span className="text-pink-300">{memEntry.value}</span>
                    </div>
                ))}
                </div>
            )}
             <p className="text-xs text-gray-500 mt-3">注: これは非常に簡略化されたメモリビューです。</p>
          </div>
        </section>
      </main>

      <footer className="mt-12 mb-6 text-center text-gray-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Day38 CPU Visualizer Challenge. Crafted with Next.js & Tailwind CSS.</p>
      </footer>
      <style jsx global>{`
        .pretty-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .pretty-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .pretty-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(192, 132, 252, 0.5); // purple-400 with opacity
          border-radius: 10px;
        }
        .pretty-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(192, 132, 252, 0.7); // purple-400 with more opacity
        }
      `}</style>
    </div>
  );
}