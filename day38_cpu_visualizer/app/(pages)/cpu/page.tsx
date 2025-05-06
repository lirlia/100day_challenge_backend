"use client"; // ステートを持つため Client Component

import { useState, useEffect, useCallback } from 'react'; // useState, useEffect, useCallback をインポート
import { useCpuSimulator } from '../../_lib/cpuEngine'; // 相対パスに変更
import { OpCode } from '../../_lib/types'; // OpCodeもインポートしてHALTチェックなどに使える

const registerNameMap: { [key: string]: string } = {
  PC: "プログラムカウンタ (PC)",
  ACC: "アキュムレータ (ACC)",
  FLAGS: "フラグレジスタ (FLAGS)",
  R0: "汎用レジスタ0 (R0)",
  R1: "汎用レジスタ1 (R1)",
  R2: "汎用レジスタ2 (R2)",
};

export default function CpuPage() {
  // const initialJs = "let a = 10;\\nlet b = 5;\\nlet sum = a + b;\\n// Add a HALT instruction to stop execution\\nHALT;";
  const initialJs = `let a = 10;
let b = 5;
let sum = a + b;
// 実行を停止するにはHALT命令を追加します
HALT;`;
  const simulator = useCpuSimulator(initialJs);

  // Textarea の内容を管理するローカルステートを追加
  const [editorCode, setEditorCode] = useState<string>(initialJs);

  // simulator.rawJsCode が変更されたら editorCode も同期する (Reset All などのため)
  useEffect(() => {
      setEditorCode(simulator.rawJsCode);
  }, [simulator.rawJsCode]);

  // キー入力でステップ実行する useEffect フック
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();

        if (simulator.cpuState.isRunning && simulator.isProgramLoaded()) {
          simulator.step();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [simulator]);

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

  // --- JS行ハイライトのためのロジック ---
  const currentAssemblyLine = simulator.cpuState.currentAssemblyLine;
  const sourceMap = simulator.sourceMap;
  let currentJsLineIndex: number | undefined = undefined;
  if (sourceMap && currentAssemblyLine !== undefined && sourceMap[currentAssemblyLine] !== undefined) {
    currentJsLineIndex = sourceMap[currentAssemblyLine];
  }
  const jsCodeLines = simulator.rawJsCode.split('\n');
  // --- ここまで ---

  return (
    <div className="container mx-auto p-2 md:p-4 min-h-screen flex flex-col items-center selection:bg-green-500 selection:text-black">
      <header className="mb-4 md:mb-6 text-center w-full">
        <h1 className="text-4xl md:text-5xl font-bold text-green-400 py-1 md:py-2 font-mono">
          Day38 - CPU Visualizer
        </h1>
      </header>

      {/* Main content area - adjusted for better one-page fit */}
      <main className="grid grid-cols-1 lg:grid-cols-3 gap-3 w-full max-w-screen-xl px-2 md:px-4 flex-grow">
        {/* Column 1: JS Input & Controls */}
        <section className="lg:col-span-1 flex flex-col gap-3">
          <div className="terminal-panel flex-grow flex flex-col">
            <h2 className="text-xl font-semibold mb-2 text-green-500 font-mono">// JavaScript コード入力 & 表示</h2>
            <div className="grid grid-cols-2 gap-2 flex-grow">
              {/* 左: 入力エリア - onChange を変更 */}
              <textarea
                className="terminal-input w-full h-full p-2 text-xs font-mono min-h-[100px] resize-none" // h-full, resize-none追加
                value={editorCode} // value をローカルステートに
                onChange={(e) => setEditorCode(e.target.value)} // onChange はローカルステート更新のみ
                placeholder="> let x = 10;\n> let y = 20;\n> // HALT; で停止"
                spellCheck="false"
              />
              {/* 右: ハイライト付き表示エリア - 表示内容は simulator.rawJsCode を使う */}
              <pre className="w-full h-full p-1.5 bg-black/30 border border-gray-700/50 rounded-sm text-xs font-mono overflow-auto pretty-scrollbar min-h-[100px]">
                {jsCodeLines.map((line, index) => (
                  <div
                    key={`js-line-${index}`}
                    className={`whitespace-pre-wrap py-0.5 px-1 rounded-sm transition-colors ${index === currentJsLineIndex && simulator.cpuState.isRunning ? 'js-highlight-class' : ''}`}
                  >
                    <span className="text-gray-600 select-none mr-1">{(index + 1).toString().padStart(2, '0')}:</span>
                    {line || ' '}{/* 空行でも高さを保つ */}
                  </div>
                ))}
              </pre>
            </div>
            {/* ボタンの onClick を変更 */}
            <button
              onClick={() => simulator.compileAndLoad(editorCode)} // ボタンで compileAndLoad を呼ぶ
              className="mt-2 w-full terminal-button-accent py-2"
            >
              [ コンパイル & ロード ]
            </button>
          </div>
          <div className="terminal-panel flex flex-col space-y-2 p-3"> {/* Adjusted padding & spacing */}
            <h2 className="text-xl font-semibold mb-1 text-green-500 font-mono">// 操作パネル</h2>
            <button
              onClick={simulator.step}
              disabled={!simulator.cpuState.isRunning || !simulator.isProgramLoaded()}
              className="w-full terminal-button disabled:opacity-50 disabled:cursor-not-allowed py-1.5 text-sm" // Adjusted padding & text size
            >
              ステップ実行 (PC: {simulator.cpuState.registers.pc})
            </button>
            <button onClick={() => simulator.reset(true)} className="w-full terminal-button py-1.5 text-sm">
              CPU状態リセット
            </button>
            <button onClick={() => simulator.reset(false)} className="w-full terminal-button-danger py-1.5 text-sm">
              全リセット (コードもクリア)
            </button>
          </div>
        </section>

        {/* Column 2 & 3: Assembly, Machine Code, Registers, Memory */}
        <section className="lg:col-span-2 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="terminal-panel flex flex-col min-h-[240px] md:min-h-[280px]"> {/* Adjusted height */}
              <h2 className="text-xl font-semibold mb-2 text-green-500 font-mono">// アセンブリコード出力</h2>
              <pre className="flex-grow w-full p-1.5 bg-black/30 border border-green-700/50 rounded-sm text-[11px] font-mono overflow-auto pretty-scrollbar">
                {assemblyLinesForDisplay.length === 0 && <span className="text-green-700">JavaScriptコードをコンパイルしてください...</span>}
                {assemblyLinesForDisplay.map((line, index) => (
                  <div key={`asm-${index}`} className={`whitespace-pre-wrap py-0.5 px-1 rounded-sm transition-colors ${index === simulator.cpuState.currentAssemblyLine && simulator.cpuState.isRunning ? 'bg-green-700/60 text-yellow-300 ring-1 ring-green-400' : 'hover:bg-black/40'}`}>
                    <span className="text-green-700 select-none mr-1">{index.toString().padStart(2, '0')}:</span>
                    {line}
                  </div>
                ))}
              </pre>
            </div>
            <div className="terminal-panel flex flex-col min-h-[240px] md:min-h-[280px]"> {/* Adjusted height */}
              <h2 className="text-xl font-semibold mb-2 text-green-500 font-mono">// マシンコード出力 (16進数)</h2>
              <pre className="flex-grow w-full p-1.5 bg-black/30 border border-green-700/50 rounded-sm text-[11px] font-mono overflow-auto pretty-scrollbar">
                {machineCodeLinesForDisplay.length === 0 && <span className="text-green-700">JavaScriptコードをコンパイルしてください...</span>}
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
              // 中央処理装置 (CPU) - レジスタ群
            </h2>
            <div className="cpu-die-surface">
              <div className="grid grid-cols-3 gap-1.5 md:gap-2 p-2">
                {Object.entries(displayRegisters).map(([key, value]) => (
                  <div className="terminal-register-block" key={key}>
                    <div className="terminal-register-name">{registerNameMap[key] || key}</div>
                    <div className="terminal-register-value">{String(value)}</div>
                  </div>
                ))}
              </div>
            </div>
            <p className={`mt-2 text-xs font-semibold font-mono ${simulator.cpuState.isRunning ? 'text-green-400 animate-pulse' : 'text-red-500'}`}>
              CPUステータス: {simulator.cpuState.isRunning ? '実行中...' : '停止'}
            </p>
          </div>

          <div className="terminal-panel p-3">
            <h2 className="text-lg font-semibold mb-2 text-green-500 font-mono">// メモリビュー (簡易)</h2>
            {displayMemory.length === 0 ? (
                 <p className="text-green-700 text-xs font-mono">メモリは空です。</p>
            ) : (
                <div className="space-y-0.5 text-[10px] font-mono max-h-[60px] overflow-auto pretty-scrollbar">
                {displayMemory.map((memEntry, index) => (
                    <div key={`mem-${index}`} className="flex justify-between p-0.5 bg-black/40 rounded-sm hover:bg-black/60">
                    <span className="text-green-700">0x{memEntry.address.replace('mem_', '')}:</span>
                    <span className="text-blue-400 font-semibold">{memEntry.value}</span>
                    </div>
                ))}
                </div>
            )}
             <p className="text-[9px] text-green-700 mt-1 font-mono">注: 簡略化されたメモリ表現です。</p>
          </div>
        </section>
      </main>
    </div>
  );
}
