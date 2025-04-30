'use client';

import { useState, useEffect } from 'react';
import type { CacheItemResponse } from '../../lib/types';

export default function CacheBrowser() {
  const [cacheKey, setCacheKey] = useState('');
  const [cacheValue, setCacheValue] = useState('');
  const [ttl, setTtl] = useState('3600');
  const [loading, setLoading] = useState(false);
  const [cacheItems, setCacheItems] = useState<CacheItemResponse[]>([]);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [currentView, setCurrentView] = useState<CacheItemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // キャッシュキーの取得処理
  const handleGetCache = async (key: string) => {
    if (!key.trim()) {
      setError('キーを入力してください');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/cache/${encodeURIComponent(key)}`);

      if (response.status === 404) {
        setError(`キー "${key}" は存在しません`);
        setCurrentView(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`キャッシュの取得に失敗しました: ${response.status}`);
      }

      const data = await response.json();
      setCurrentView(data);

      // 最近アクセスしたキーリストに追加
      if (!recentKeys.includes(key)) {
        setRecentKeys([key, ...recentKeys].slice(0, 10));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // キャッシュキーの設定処理
  const handleSetCache = async () => {
    if (!cacheKey.trim()) {
      setError('キーを入力してください');
      return;
    }

    if (!cacheValue.trim()) {
      setError('値を入力してください');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/cache/${encodeURIComponent(cacheKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: cacheValue,
          ttl: parseInt(ttl) || 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`キャッシュの設定に失敗しました: ${response.status}`);
      }

      // 保存成功したらキーを取得して表示
      handleGetCache(cacheKey);

      // 最近アクセスしたキーリストに追加
      if (!recentKeys.includes(cacheKey)) {
        setRecentKeys([cacheKey, ...recentKeys].slice(0, 10));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // キャッシュキーの削除処理
  const handleDeleteCache = async (key: string) => {
    if (!key.trim()) {
      setError('キーを入力してください');
      return;
    }

    if (!confirm(`キー "${key}" を削除してもよろしいですか？`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/cache/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`キャッシュの削除に失敗しました: ${response.status}`);
      }

      setCurrentView(null);

      // 削除後に最新のキャッシュアイテムリストを更新
      const updatedItems = cacheItems.filter(item => item.key !== key);
      setCacheItems(updatedItems);

      // 削除成功のメッセージ
      setError(`キー "${key}" を削除しました`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 全キャッシュの取得
  const fetchAllCacheItems = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cache');

      if (!response.ok) {
        throw new Error('キャッシュリストの取得に失敗しました');
      }

      const data = await response.json();
      setCacheItems(data.items || []);
    } catch (err) {
      console.error('Error fetching cache items:', err);
    } finally {
      setLoading(false);
    }
  };

  // TTLの表示形式を整形する
  const formatTTL = (expiresAt: string | undefined): string => {
    if (!expiresAt) return '無期限';

    const expireTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const diff = expireTime - now;

    if (diff <= 0) return '期限切れ';

    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}秒`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分${seconds % 60}秒`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間${minutes % 60}分`;

    const days = Math.floor(hours / 24);
    return `${days}日${hours % 24}時間`;
  };

  // 初回ロード時に全キャッシュを取得
  useEffect(() => {
    fetchAllCacheItems();

    // 30秒ごとに更新
    const interval = setInterval(fetchAllCacheItems, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* 左側: キャッシュ操作パネル */}
      <div className="md:col-span-2 space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4">キャッシュ操作</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                キー
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={cacheKey}
                  onChange={(e) => setCacheKey(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例: user:1234"
                />
                <button
                  onClick={() => handleGetCache(cacheKey)}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-r-md"
                >
                  取得
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                値
              </label>
              <textarea
                value={cacheValue}
                onChange={(e) => setCacheValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="キャッシュの値"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                TTL (秒)
              </label>
              <input
                type="number"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="3600"
                min="0"
              />
              <p className="mt-1 text-xs text-gray-500">
                0を入力すると無期限になります
              </p>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={handleSetCache}
                disabled={loading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
              >
                {loading ? '処理中...' : '保存'}
              </button>

              <button
                onClick={() => handleDeleteCache(cacheKey)}
                disabled={loading || !cacheKey.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
              >
                削除
              </button>
            </div>
          </div>

          {error && (
            <div className={`mt-4 p-3 rounded-md ${error.includes('削除しました') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}
        </div>

        {/* キャッシュ詳細表示 */}
        {currentView && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">キャッシュ詳細</h2>

            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <dt className="text-sm font-medium text-gray-500">キー</dt>
                <dd className="mt-1 text-lg font-medium">{currentView.key}</dd>
              </div>

              <div className="col-span-2">
                <dt className="text-sm font-medium text-gray-500">値</dt>
                <dd className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded-md whitespace-pre-wrap break-words">
                  {currentView.value}
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">バージョン</dt>
                <dd className="mt-1">{currentView.metadata.version}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">TTL</dt>
                <dd className="mt-1">{formatTTL(currentView.metadata.expiresAt)}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">ノード名</dt>
                <dd className="mt-1">{currentView.metadata.nodeName}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">作成日時</dt>
                <dd className="mt-1">{new Date(currentView.metadata.createdAt).toLocaleString()}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">更新日時</dt>
                <dd className="mt-1">{new Date(currentView.metadata.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {/* 右側: キャッシュリスト */}
      <div className="space-y-6">
        {/* 最近アクセスしたキー */}
        {recentKeys.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-lg font-bold mb-3">最近アクセスしたキー</h2>
            <ul className="space-y-2">
              {recentKeys.map((key) => (
                <li key={key}>
                  <button
                    onClick={() => {
                      setCacheKey(key);
                      handleGetCache(key);
                    }}
                    className="text-left w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
                  >
                    {key}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* すべてのキャッシュアイテム */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">すべてのキャッシュ</h2>
            <button
              onClick={fetchAllCacheItems}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              更新
            </button>
          </div>

          {loading && cacheItems.length === 0 ? (
            <div className="py-2 text-gray-500 text-center">読み込み中...</div>
          ) : cacheItems.length === 0 ? (
            <div className="py-2 text-gray-500 text-center">キャッシュが存在しません</div>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {cacheItems.map((item, index) => (
                <li key={`${item.key}-${index}`} className="border-b last:border-b-0 border-gray-100 pb-2">
                  <button
                    onClick={() => {
                      setCacheKey(item.key);
                      setCurrentView(item);
                    }}
                    className="text-left w-full"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-blue-600 font-medium">{item.key}</span>
                      {/* ノード名を表示 */}
                      <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-full">
                        {item.metadata.nodeName}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      TTL: {formatTTL(item.metadata.expiresAt)}
                      {' | '}バージョン: {item.metadata.version}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
