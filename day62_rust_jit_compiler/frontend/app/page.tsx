'use client';

import { useState, useEffect } from 'react';
import ExecutionPanel from '@/components/ExecutionPanel';
import StatsPanel from '@/components/StatsPanel';
import CachePanel from '@/components/CachePanel';
import PerformanceChart from '@/components/PerformanceChart';

// API型定義
export type JitStats = {
  total_executions: number;
  jit_compilations: number;
  total_execution_time_ns: number;
  total_compilation_time_ns: number;
  average_execution_time_ns: number;
  average_compilation_time_ns: number;
  cache_entries: number;
};

export type CacheEntry = {
  hash: string;
  execution_count: number;
  is_compiled: boolean;
  code_size_bytes?: number;
};

export type CacheResponse = {
  entries: CacheEntry[];
  total_entries: number;
};

export type ExecutionResult = {
  result: number;
  execution_time_ns: number;
  was_jit_compiled: boolean;
  message?: string;
};

export default function JitDashboard() {
  const [stats, setStats] = useState<JitStats | null>(null);
  const [cache, setCache] = useState<CacheResponse | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [performanceHistory, setPerformanceHistory] = useState<Array<{
    timestamp: number;
    execution_time: number;
    was_jit_compiled: boolean;
  }>>([]);

  // バックエンドサーバーのURL
  const API_BASE = 'http://localhost:3001';

  // サーバー接続チェック
  const checkConnection = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/health`);
      if (response.ok) {
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    } catch (error) {
      setIsConnected(false);
    }
  };

  // 統計情報を取得
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  // キャッシュ情報を取得
  const fetchCache = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/cache`);
      if (response.ok) {
        const data = await response.json();
        setCache(data);
      }
    } catch (error) {
      console.error('Failed to fetch cache:', error);
    }
  };

  // 式を実行
  const executeExpression = async (code: string): Promise<ExecutionResult | null> => {
    try {
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      if (response.ok) {
        const result = await response.json();

        // パフォーマンス履歴に追加
        setPerformanceHistory(prev => [
          ...prev,
          {
            timestamp: Date.now(),
            execution_time: result.execution_time_ns,
            was_jit_compiled: result.was_jit_compiled,
          }
        ].slice(-50)); // 最新50件のみ保持

        // 統計情報とキャッシュ情報を更新
        await Promise.all([fetchStats(), fetchCache()]);

        return result;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to execute expression:', error);
      return null;
    }
  };

  // 統計をリセット
  const resetStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/reset`, {
        method: 'POST',
      });

      if (response.ok) {
        setPerformanceHistory([]);
        await Promise.all([fetchStats(), fetchCache()]);
      }
    } catch (error) {
      console.error('Failed to reset stats:', error);
    }
  };

  // 定期的なデータ更新
  useEffect(() => {
    checkConnection();
    fetchStats();
    fetchCache();

    const interval = setInterval(() => {
      checkConnection();
      fetchStats();
      fetchCache();
    }, 2000); // 2秒間隔

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* ヘッダー */}
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            Day62 - Rust JIT コンパイラ Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
              }`} />
              <span className="text-slate-300">
                {isConnected ? 'Backend Connected' : 'Backend Disconnected'}
              </span>
            </div>
            <button
              onClick={resetStats}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
            >
              統計リセット
            </button>
          </div>
        </header>

        {!isConnected && (
          <div className="mb-8 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-300">
              ⚠️ バックエンドサーバーに接続できません。<br />
              <code className="bg-red-800 px-2 py-1 rounded">cd backend && cargo run server</code> でサーバーを起動してください。
            </p>
          </div>
        )}

        {/* メインコンテンツ */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* 左カラム */}
          <div className="space-y-8">
            <ExecutionPanel
              onExecute={executeExpression}
              disabled={!isConnected}
            />
            <StatsPanel stats={stats} />
          </div>

          {/* 右カラム */}
          <div className="space-y-8">
            <PerformanceChart data={performanceHistory} />
            <CachePanel cache={cache} />
          </div>
        </div>
      </div>
    </div>
  );
}
