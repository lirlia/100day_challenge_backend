'use client';

import { JitStats } from '../page';

interface StatsPanelProps {
  stats: JitStats | null;
}

export default function StatsPanel({ stats }: StatsPanelProps) {
  if (!stats) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-blue-400">📊</span>
          JIT統計情報
        </h2>
        <div className="flex items-center justify-center h-32">
          <div className="text-slate-400">統計情報を読み込み中...</div>
        </div>
      </div>
    );
  }

  const formatTime = (ns: number) => {
    if (ns < 1000) return `${ns}ns`;
    if (ns < 1000000) return `${(ns / 1000).toFixed(1)}μs`;
    if (ns < 1000000000) return `${(ns / 1000000).toFixed(1)}ms`;
    return `${(ns / 1000000000).toFixed(2)}s`;
  };

  const jitRatio = stats.total_executions > 0
    ? (stats.jit_compilations / stats.total_executions * 100).toFixed(1)
    : '0.0';

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6" data-testid="stats-panel">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <span className="text-blue-400">📊</span>
        JIT統計情報
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 実行統計 */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-300 border-b border-slate-600 pb-2">
            実行統計
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">総実行回数:</span>
              <span className="text-cyan-300 font-mono font-bold text-lg" data-testid="total-executions">
                {stats.total_executions.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">JITコンパイル回数:</span>
              <span className="text-purple-300 font-mono font-bold text-lg">
                {stats.jit_compilations.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">JIT率:</span>
              <span className="text-yellow-300 font-mono font-bold">
                {jitRatio}%
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">キャッシュエントリ:</span>
              <span className="text-green-300 font-mono font-bold">
                {stats.cache_entries.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* パフォーマンス統計 */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-300 border-b border-slate-600 pb-2">
            パフォーマンス
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">平均実行時間:</span>
              <span className="text-cyan-300 font-mono">
                {formatTime(stats.average_execution_time_ns)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">平均コンパイル時間:</span>
              <span className="text-purple-300 font-mono">
                {formatTime(stats.average_compilation_time_ns)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">総実行時間:</span>
              <span className="text-slate-300 font-mono">
                {formatTime(stats.total_execution_time_ns)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400">総コンパイル時間:</span>
              <span className="text-slate-300 font-mono">
                {formatTime(stats.total_compilation_time_ns)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* プログレスバー */}
      {stats.total_executions > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">JIT コンパイル進捗</span>
            <span className="text-slate-300">{stats.jit_compilations} / {stats.total_executions}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-purple-500 to-cyan-500 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (stats.jit_compilations / stats.total_executions) * 100)}%`
              }}
            />
          </div>
        </div>
      )}

      {/* パフォーマンス指標 */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="bg-slate-900/50 rounded-lg p-3 text-center">
          <div className="text-cyan-400 text-2xl font-bold">
            {stats.total_executions > 0 ?
              Math.round(stats.total_execution_time_ns / stats.total_executions / 1000) : 0}
          </div>
          <div className="text-slate-400 text-sm">μs/実行 (平均)</div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-3 text-center">
          <div className="text-purple-400 text-2xl font-bold">
            {stats.jit_compilations > 0 ?
              Math.round(stats.total_compilation_time_ns / stats.jit_compilations / 1000) : 0}
          </div>
          <div className="text-slate-400 text-sm">μs/コンパイル</div>
        </div>
      </div>
    </div>
  );
}