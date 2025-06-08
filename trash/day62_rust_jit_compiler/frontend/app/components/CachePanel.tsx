'use client';

import { CacheResponse } from '../page';

interface CachePanelProps {
  cache: CacheResponse | null;
}

export default function CachePanel({ cache }: CachePanelProps) {
  if (!cache) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-amber-400">🗂️</span>
          JITキャッシュ
        </h2>
        <div className="flex items-center justify-center h-32">
          <div className="text-slate-400">キャッシュ情報を読み込み中...</div>
        </div>
      </div>
    );
  }

  const sortedEntries = [...cache.entries].sort((a, b) => b.execution_count - a.execution_count);
  const compiledEntries = cache.entries.filter(entry => entry.is_compiled);
  const compilationRate = cache.total_entries > 0
    ? (compiledEntries.length / cache.total_entries * 100).toFixed(1)
    : '0.0';

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <span className="text-amber-400">🗂️</span>
          JITキャッシュ
        </h2>
        <div className="text-right text-sm">
          <div className="text-slate-300">
            {cache.total_entries} エントリ
          </div>
          <div className="text-amber-400">
            コンパイル率: {compilationRate}%
          </div>
        </div>
      </div>

      {cache.total_entries === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <div className="text-4xl mb-2">📦</div>
          <p>まだキャッシュエントリがありません</p>
          <p className="text-sm">式を実行するとキャッシュが作成されます</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* キャッシュ統計 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-amber-400 text-xl font-bold">
                {cache.total_entries}
              </div>
              <div className="text-slate-400 text-sm">総エントリ</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-purple-400 text-xl font-bold">
                {compiledEntries.length}
              </div>
              <div className="text-slate-400 text-sm">コンパイル済み</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-green-400 text-xl font-bold">
                {sortedEntries.reduce((sum, entry) => sum + entry.execution_count, 0)}
              </div>
              <div className="text-slate-400 text-sm">総実行回数</div>
            </div>
          </div>

          {/* キャッシュエントリ一覧 */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {sortedEntries.map((entry, index) => (
              <div
                key={entry.hash}
                className="bg-slate-900/30 border border-slate-600 rounded-lg p-4 hover:border-slate-500 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">#{index + 1}</span>
                    {entry.is_compiled ? (
                      <span className="px-2 py-1 bg-purple-600 text-purple-100 text-xs rounded-full">
                        ⚡ JIT Compiled
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-slate-600 text-slate-300 text-xs rounded-full">
                        📄 Cached
                      </span>
                    )}
                  </div>
                  <div className="text-slate-300 font-mono text-sm">
                    {entry.execution_count} 回実行
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">ハッシュ:</span>
                    <code className="text-cyan-300 text-xs font-mono bg-slate-800 px-2 py-1 rounded">
                      {entry.hash}
                    </code>
                  </div>

                  {entry.code_size_bytes && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">コードサイズ:</span>
                      <span className="text-slate-300 text-sm">
                        {entry.code_size_bytes} bytes
                      </span>
                    </div>
                  )}
                </div>

                {/* 実行回数プログレスバー */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>実行頻度</span>
                    <span>{entry.execution_count}/回</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        entry.is_compiled
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                          : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (entry.execution_count / 20) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* JITコンパイル条件説明 */}
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
            <div className="text-blue-300 text-sm font-medium mb-1">
              💡 JITコンパイル条件
            </div>
            <div className="text-blue-200 text-xs space-y-1">
              <p>• 同じ式が10回実行されると自動的にJITコンパイルされます</p>
              <p>• コンパイル済みの式は高速なマシンコードで実行されます</p>
              <p>• ハッシュは式の内容に基づいて生成されます</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}