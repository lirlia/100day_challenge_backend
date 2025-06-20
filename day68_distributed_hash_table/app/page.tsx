'use client';

import { useState, useEffect } from 'react';
import ChordRingVisualization from './components/ChordRingVisualization';

// 型定義
interface ChordNode {
  id: number;
  address: string;
  isAlive: boolean;
  dataCount: number;
  fingerTable: number[];
  successor: number | null;
  predecessor: number | null;
}

interface RingInfo {
  nodes: ChordNode[];
  totalNodes: number;
  totalData: number;
  lastUpdated: string;
}

interface DataOperation {
  key: string;
  value: any;
  keyHash: number;
  responsibleNodeId: number;
  found?: boolean;
}

export default function ChordDashboard() {
  const [ringInfo, setRingInfo] = useState<RingInfo>({ nodes: [], totalNodes: 0, totalData: 0, lastUpdated: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ノード管理
  const [nodeAddress, setNodeAddress] = useState('');
  const [addingNode, setAddingNode] = useState(false);

  // データ操作
  const [dataKey, setDataKey] = useState('');
  const [dataValue, setDataValue] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [searchResult, setSearchResult] = useState<DataOperation | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // リング可視化
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  // リング情報を取得
  const fetchRingInfo = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/chord');
      const data = await response.json();
      setRingInfo(data);
      setError('');
    } catch (err) {
      console.error('Error fetching ring info:', err);
      setError('リング情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // ノードを追加
  const addNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeAddress.trim()) return;

    try {
      setAddingNode(true);
      const response = await fetch('/api/chord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: nodeAddress })
      });

      if (response.ok) {
        setNodeAddress('');
        fetchRingInfo();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'ノード追加に失敗しました。');
      }
    } catch (err) {
      console.error('Error adding node:', err);
      setError('ノード追加に失敗しました。');
    } finally {
      setAddingNode(false);
    }
  };

  // ノードを削除
  const removeNode = async (nodeId: number) => {
    try {
      const response = await fetch(`/api/chord?nodeId=${nodeId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchRingInfo();
        // 削除されたノードが選択されていた場合は選択を解除
        if (selectedNodeId === nodeId) {
          setSelectedNodeId(null);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'ノード削除に失敗しました。');
      }
    } catch (err) {
      console.error('Error removing node:', err);
      setError('ノード削除に失敗しました。');
    }
  };

  // データを保存
  const putData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataKey.trim()) return;

    try {
      setDataLoading(true);
      const response = await fetch('/api/chord/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: dataKey, value: dataValue })
      });

      if (response.ok) {
        setDataKey('');
        setDataValue('');
        fetchRingInfo();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'データ保存に失敗しました。');
      }
    } catch (err) {
      console.error('Error storing data:', err);
      setError('データ保存に失敗しました。');
    } finally {
      setDataLoading(false);
    }
  };

  // データを検索
  const searchData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchKey.trim()) return;

    try {
      setDataLoading(true);
      const response = await fetch(`/api/chord/data?key=${encodeURIComponent(searchKey)}`);
      const data = await response.json();
      setSearchResult(data);
    } catch (err) {
      console.error('Error searching data:', err);
      setError('データ検索に失敗しました。');
    } finally {
      setDataLoading(false);
    }
  };

  // データを削除
  const deleteData = async (key: string) => {
    try {
      setDataLoading(true);
      const response = await fetch(`/api/chord/data?key=${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchRingInfo();
        if (searchResult && searchResult.key === key) {
          setSearchResult(null);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'データ削除に失敗しました。');
      }
    } catch (err) {
      console.error('Error deleting data:', err);
      setError('データ削除に失敗しました。');
    } finally {
      setDataLoading(false);
    }
  };

  // 自動更新
  useEffect(() => {
    fetchRingInfo();
    const interval = setInterval(fetchRingInfo, 5000); // 5秒ごとに更新
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Day68 - Chord 分散ハッシュテーブル
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Chord プロトコルによる分散ハッシュテーブルのリアルタイムダッシュボード
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* リング統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-2">ノード数</h3>
          <p className="text-3xl font-bold text-blue-600">{ringInfo.totalNodes}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-2">総データ数</h3>
          <p className="text-3xl font-bold text-green-600">{ringInfo.totalData}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
          <h3 className="text-lg font-semibold mb-2">最終更新</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {ringInfo.lastUpdated ? new Date(ringInfo.lastUpdated).toLocaleString() : '-'}
          </p>
        </div>
      </div>

      {/* リング可視化 */}
      <div className="mb-8">
        <ChordRingVisualization
          nodes={ringInfo.nodes}
          selectedNodeId={selectedNodeId}
          onNodeSelect={setSelectedNodeId}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ノード管理 */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4">ノード追加</h2>
            <form onSubmit={addNode} className="flex gap-2">
              <input
                type="text"
                value={nodeAddress}
                onChange={(e) => setNodeAddress(e.target.value)}
                placeholder="ノードアドレス (例: node1.example.com:8000)"
                className="flex-1 px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              />
              <button
                type="submit"
                disabled={addingNode}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded"
              >
                {addingNode ? '追加中...' : '追加'}
              </button>
            </form>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4">リングノード一覧</h2>
            {loading ? (
              <p>読み込み中...</p>
            ) : ringInfo.nodes.length === 0 ? (
              <p>ノードがありません。新しいノードを追加してください。</p>
            ) : (
              <div className="space-y-3">
                {ringInfo.nodes.map((node) => (
                  <div
                    key={node.id}
                    className={`p-4 border rounded cursor-pointer transition-colors ${selectedNodeId === node.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}
                    onClick={() => setSelectedNodeId(selectedNodeId === node.id ? null : node.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">ノード {node.id}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{node.address}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          データ: {node.dataCount}件 |
                          後継: {node.successor} |
                          前任: {node.predecessor}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNode(node.id);
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* データ操作 */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4">データ保存</h2>
            <form onSubmit={putData} className="space-y-3">
              <input
                type="text"
                value={dataKey}
                onChange={(e) => setDataKey(e.target.value)}
                placeholder="キー"
                className="w-full px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              />
              <input
                type="text"
                value={dataValue}
                onChange={(e) => setDataValue(e.target.value)}
                placeholder="値"
                className="w-full px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              />
              <button
                type="submit"
                disabled={dataLoading}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white px-4 py-2 rounded"
              >
                {dataLoading ? '保存中...' : '保存'}
              </button>
            </form>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4">データ検索</h2>
            <form onSubmit={searchData} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder="検索キー"
                  className="flex-1 px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                />
                <button
                  type="submit"
                  disabled={dataLoading}
                  className="bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white px-4 py-2 rounded"
                >
                  検索
                </button>
              </div>
            </form>

            {searchResult && (
              <div className="mt-4 p-4 border rounded dark:border-gray-600">
                <h3 className="font-semibold mb-2">検索結果</h3>
                <p><strong>キー:</strong> {searchResult.key}</p>
                <p><strong>値:</strong> {searchResult.found ? searchResult.value : '見つかりません'}</p>
                <p><strong>ハッシュ:</strong> {searchResult.keyHash}</p>
                <p><strong>責任ノード:</strong> {searchResult.responsibleNodeId}</p>
                {searchResult.found && (
                  <button
                    onClick={() => deleteData(searchResult.key)}
                    className="mt-2 bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                  >
                    削除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
