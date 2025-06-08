'use client';

import { useState } from 'react';
import { ExecutionResult } from '../page';

interface ExecutionPanelProps {
  onExecute: (code: string) => Promise<ExecutionResult | null>;
  disabled: boolean;
}

export default function ExecutionPanel({ onExecute, disabled }: ExecutionPanelProps) {
  const [code, setCode] = useState('1 + 2 * 3');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExecute = async () => {
    if (!code.trim() || loading || disabled) return;

    setLoading(true);
    try {
      const executionResult = await onExecute(code);
      setResult(executionResult);
    } catch (err) {
      console.error('Execution error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      <h2 className="text-2xl font-bold text-white mb-4">式実行パネル</h2>

      <div className="mb-4">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={disabled || loading}
          className="w-full h-24 px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white font-mono"
          placeholder="例: x = 42; x * 2 + 10"
        />
      </div>

      <button
        onClick={handleExecute}
        disabled={disabled || loading || !code.trim()}
        className="w-full py-3 bg-gradient-to-r from-cyan-600 to-purple-600 text-white font-medium rounded-lg disabled:opacity-50"
      >
        {loading ? '実行中...' : '実行'}
      </button>

      {result && (
        <div className="mt-6 p-4 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-white">結果: {result.result}</p>
          <p className="text-cyan-300">実行時間: {result.execution_time_ns} ns</p>
          {result.was_jit_compiled && <p className="text-purple-300">JIT Compiled</p>}
        </div>
      )}
    </div>
  );
}