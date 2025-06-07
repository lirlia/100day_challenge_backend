'use client';

import React, { useState, useEffect } from 'react';

interface PageRankStats {
  totalDocuments: number;
  totalLinks: number;
  averagePageRank: number;
  maxPageRank: number;
  minPageRank: number;
  topDocuments: {
    id: number;
    title: string;
    pageRankScore: number;
  }[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<PageRankStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // 統計情報を取得
  const fetchStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/pagerank');
      const data = await response.json();

      if (data.success) {
        setStats(data.data);
        setLastUpdate(new Date().toLocaleString('ja-JP'));
      } else {
        setError(data.message || '統計の取得に失敗しました');
      }
    } catch (err) {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // PageRank計算を実行
  const calculatePageRank = async () => {
    setCalculating(true);
    setError(null);

    try {
      const response = await fetch('/api/pagerank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          generateLinks: true,
          dampingFactor: 0.85,
          maxIterations: 100,
          tolerance: 1e-6
        })
      });

      const data = await response.json();

      if (data.success) {
        setStats(data.data.statistics);
        setLastUpdate(new Date().toLocaleString('ja-JP'));
      } else {
        setError(data.message || 'PageRank計算に失敗しました');
      }
    } catch (err) {
      setError('ネットワークエラーが発生しました');
    } finally {
      setCalculating(false);
    }
  };

  // 初回読み込み
  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/50 bg-slate-950/90 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Day63 検索エンジン - 管理画面
            </h1>
            <nav className="flex gap-4">
              <a href="/" className="text-slate-400 hover:text-slate-200 transition-colors">
                ホーム
              </a>
              <a href="/search" className="text-slate-400 hover:text-slate-200 transition-colors">
                検索
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-100 mb-4">PageRank 管理</h2>

          <div className="flex gap-4 mb-6">
            <button
              onClick={fetchStats}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              {loading ? '読み込み中...' : '統計を更新'}
            </button>

            <button
              onClick={calculatePageRank}
              disabled={calculating}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
            >
              {calculating ? 'PageRank計算中...' : 'PageRankを再計算'}
            </button>
          </div>

          {lastUpdate && (
            <p className="text-sm text-slate-400 mb-6">
              最終更新: {lastUpdate}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {stats && (
          <div className="space-y-6">
            {/* 統計概要 */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-1">総文書数</h3>
                <p className="text-2xl font-bold text-cyan-400">{stats.totalDocuments}</p>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-1">総リンク数</h3>
                <p className="text-2xl font-bold text-blue-400">{stats.totalLinks}</p>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-1">平均PageRank</h3>
                <p className="text-2xl font-bold text-green-400">{stats.averagePageRank.toFixed(4)}</p>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-1">最大PageRank</h3>
                <p className="text-2xl font-bold text-yellow-400">{stats.maxPageRank.toFixed(4)}</p>
              </div>

              <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-400 mb-1">最小PageRank</h3>
                <p className="text-2xl font-bold text-purple-400">{stats.minPageRank.toFixed(4)}</p>
              </div>
            </div>

            {/* PageRankランキング */}
            <div className="p-6 bg-slate-900/50 border border-slate-700/50 rounded-lg">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">PageRank ランキング</h3>

              <div className="space-y-3">
                {stats.topDocuments.map((doc, index) => {
                  const percentage = (doc.pageRankScore / stats.maxPageRank) * 100;
                  const rankColors = [
                    'bg-gradient-to-r from-yellow-500 to-yellow-600', // 1位
                    'bg-gradient-to-r from-gray-400 to-gray-500',     // 2位
                    'bg-gradient-to-r from-orange-500 to-orange-600', // 3位
                    'bg-gradient-to-r from-cyan-500 to-cyan-600',     // 4位
                    'bg-gradient-to-r from-purple-500 to-purple-600'  // 5位
                  ];

                  return (
                    <div key={doc.id} className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full ${rankColors[index] || 'bg-slate-600'} flex items-center justify-center text-white font-bold text-sm`}>
                        {index + 1}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium text-slate-100">{doc.title}</h4>
                          <span className="text-sm text-slate-400">
                            {doc.pageRankScore.toFixed(6)}
                          </span>
                        </div>

                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${rankColors[index] || 'bg-slate-500'}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* インデックス再構築 */}
            <div className="p-6 bg-slate-900/30 border border-slate-700/30 rounded-lg">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">その他の管理機能</h3>

              <div className="flex gap-4">
                <button
                  onClick={() => fetch('/api/index/rebuild', { method: 'POST' })}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all font-medium"
                >
                  インデックス再構築
                </button>

                <a
                  href="/search"
                  className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg hover:from-slate-700 hover:to-slate-800 transition-all font-medium"
                >
                  検索画面に戻る
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}