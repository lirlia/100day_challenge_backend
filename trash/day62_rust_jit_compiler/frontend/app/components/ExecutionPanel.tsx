'use client';

import { useState, useRef, useEffect } from 'react';
import { ExecutionResult } from '../page';

interface ExecutionPanelProps {
  onExecute: (code: string) => Promise<ExecutionResult | null>;
  disabled: boolean;
}

interface BenchmarkResult {
  totalExecutions: number;
  totalTime: number;
  averageTime: number;
  jitExecutions: number;
  interpreterExecutions: number;
}

export default function ExecutionPanel({ onExecute, disabled }: ExecutionPanelProps) {
  const [code, setCode] = useState('x = 100; x * x + 50 * 25');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const lastExecutionTime = useRef<number>(0);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // サンプル式
  const sampleExpressions = [
    // JITコンパイル可能な式（軽量で高速化効果が見える）
    'x = 100; x * x + 50 * 25',
    'y = 42; y + y * 3 - 10',
    '1000 + 2000 * 3000 / 500',

    // 関数呼び出し（JIT不可、遅い）
    'fib(30)',
    'fact(12)',
    'pow(2, 10) + pow(3, 8)',
  ];

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, []);

  const handleExecute = async () => {
    if (!code.trim() || loading || disabled || benchmarking) return;

    // 連続実行防止（500ms のクールダウン）
    const now = Date.now();
    if (now - lastExecutionTime.current < 500) {
      console.log('Too fast! Debouncing execution...');
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
      debounceTimeout.current = setTimeout(() => {
        handleExecute();
      }, 500);
      return;
    }

    lastExecutionTime.current = now;
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

  const handleBenchmark = async () => {
    if (!code.trim() || loading || disabled || benchmarking) return;

    setBenchmarking(true);
    setBenchmarkResult(null);

    try {
      const results: ExecutionResult[] = [];
      const totalRuns = 20; // 20回実行してベンチマーク

      for (let i = 0; i < totalRuns; i++) {
        const result = await onExecute(code);
        if (result) {
          results.push(result);
        }
        // 少し間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 結果を集計
      const totalTime = results.reduce((sum, r) => sum + r.execution_time_ns, 0);
      const jitExecutions = results.filter(r => r.was_jit_compiled).length;
      const interpreterExecutions = results.filter(r => !r.was_jit_compiled).length;

      setBenchmarkResult({
        totalExecutions: results.length,
        totalTime,
        averageTime: totalTime / results.length,
        jitExecutions,
        interpreterExecutions,
      });

    } catch (err) {
      console.error('Benchmark error:', err);
    } finally {
      setBenchmarking(false);
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      <h2 className="text-2xl font-bold text-white mb-4">式実行パネル</h2>

      {/* サンプル式選択 */}
      <div className="mb-4">
        <p className="text-slate-300 text-sm mb-2">
          サンプル式:
          <span className="text-cyan-400 ml-2">🚀 JIT対応</span>
          <span className="text-orange-400 ml-2">🐌 関数呼び出し</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {sampleExpressions.map((expr, index) => {
            const isJitCompatible = index < 3; // 最初の3つがJIT対応
            return (
              <button
                key={index}
                onClick={() => setCode(expr)}
                disabled={disabled || loading || benchmarking}
                className={`px-3 py-1 text-xs rounded-md disabled:opacity-50 transition-colors ${
                  isJitCompatible
                    ? 'bg-cyan-700 hover:bg-cyan-600 text-cyan-100'
                    : 'bg-orange-700 hover:bg-orange-600 text-orange-100'
                }`}
              >
                {isJitCompatible ? '🚀' : '🐌'} {expr}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-4">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={disabled || loading || benchmarking}
          className="w-full h-24 px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white font-mono"
          placeholder="🚀 JIT対応: x = 100; x * x + 50 * 25  |  🐌 関数: fib(30)"
        />
      </div>

      <button
        onClick={handleExecute}
        disabled={disabled || loading || !code.trim() || benchmarking}
        className="w-full py-3 bg-gradient-to-r from-cyan-600 to-purple-600 text-white font-medium rounded-lg disabled:opacity-50 mb-2"
      >
        {loading ? '実行中...' : '実行'}
      </button>

      <button
        onClick={handleBenchmark}
        disabled={disabled || benchmarking || !code.trim() || loading}
        className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-medium rounded-lg disabled:opacity-50"
      >
        {benchmarking ? 'ベンチマーク実行中... (20回)' : '🚀 ベンチマーク実行'}
      </button>

      {result && (
        <div className="mt-6 p-4 bg-green-900/30 border border-green-700 rounded-lg">
          <p className="text-white">結果: {result.result}</p>
          <p className="text-cyan-300">実行時間: {(result.execution_time_ns / 1000).toFixed(1)} μs</p>
          {result.was_jit_compiled && <p className="text-purple-300">⚡ JIT Compiled</p>}
        </div>
      )}

      {benchmarkResult && (
        <div className="mt-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
          <h3 className="text-white font-bold mb-2">📊 ベンチマーク結果</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="text-cyan-300">総実行回数: {benchmarkResult.totalExecutions}</p>
            <p className="text-green-300">平均実行時間: {(benchmarkResult.averageTime / 1000).toFixed(1)} μs</p>
            <p className="text-purple-300">JIT実行: {benchmarkResult.jitExecutions}回</p>
            <p className="text-orange-300">インタープリター: {benchmarkResult.interpreterExecutions}回</p>
          </div>
          {benchmarkResult.jitExecutions > 0 && benchmarkResult.interpreterExecutions > 0 && (
            <div className="mt-3 p-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-300 text-sm">
              💡 性能改善: JITコンパイル後に実行時間が大幅に短縮されました！
            </div>
          )}
        </div>
      )}
    </div>
  );
}
