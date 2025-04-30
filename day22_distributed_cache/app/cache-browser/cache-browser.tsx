'use client';

import { useState } from 'react';
import { CacheItemResponse } from '../../lib/types';

export default function CacheBrowser() {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [ttl, setTtl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CacheItemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operation, setOperation] = useState<string | null>(null);

  // キャッシュから値を取得
  const handleGet = async () => {
    if (!key) {
      setError('キーを入力してください');
      return;
    }

    setOperation('get');
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/cache/${encodeURIComponent(key)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'キャッシュからの取得に失敗しました');
      }

      setResult(data);
      setValue(data.value);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // キャッシュに値を設定
  const handleSet = async () => {
    if (!key) {
      setError('キーを入力してください');
      return;
    }

    if (!value) {
      setError('値を入力してください');
      return;
    }

    setOperation('set');
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload: { value: string; ttl?: number } = { value };

      if (ttl && !isNaN(parseInt(ttl))) {
        payload.ttl = parseInt(ttl);
      }

      const response = await fetch(`/api/cache/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'キャッシュへの設定に失敗しました');
      }

      // 設定成功後に値を取得して表示
      handleGet();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  // キャッシュから値を削除
  const handleDelete = async () => {
    if (!key) {
      setError('キーを入力してください');
      return;
    }

    setOperation('delete');
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/cache/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'キャッシュからの削除に失敗しました');
      }

      setValue('');
      setResult(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">キー</label>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="例: user:123, product:456"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">値</label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={3}
          placeholder="例: {&quot;name&quot;: &quot;John&quot;, &quot;age&quot;: 30}"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          TTL (秒) <span className="text-xs text-gray-400">オプション</span>
        </label>
        <input
          type="number"
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="例: 3600 (1時間)"
        />
      </div>

      <div className="flex space-x-2">
        <button
          onClick={handleGet}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          取得
        </button>
        <button
          onClick={handleSet}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
        >
          設定
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          削除
        </button>
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin h-5 w-5 border-2 border-gray-500 border-t-transparent rounded-full mr-2"></div>
          処理中...
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          <div className="mb-2 font-medium">結果:</div>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md overflow-x-auto">
            <pre className="text-sm">{JSON.stringify(result, null, 2)}</pre>
          </div>

          {result.metadata && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="bg-blue-50 border border-blue-100 rounded p-2">
                <span className="font-medium text-blue-700">バージョン:</span>{' '}
                <span>{result.metadata.version}</span>
              </div>

              {result.metadata.expiresAt && (
                <div className="bg-blue-50 border border-blue-100 rounded p-2">
                  <span className="font-medium text-blue-700">有効期限:</span>{' '}
                  <span>{new Date(result.metadata.expiresAt).toLocaleString()}</span>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded p-2">
                <span className="font-medium text-blue-700">作成日時:</span>{' '}
                <span>{new Date(result.metadata.createdAt).toLocaleString()}</span>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded p-2">
                <span className="font-medium text-blue-700">更新日時:</span>{' '}
                <span>{new Date(result.metadata.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {operation === 'delete' && !error && !loading && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md text-green-700">
          キャッシュから削除されました
        </div>
      )}
    </div>
  );
}
