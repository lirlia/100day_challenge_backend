'use client';

import { useState, useEffect } from 'react';
import { Node } from '../../lib/types';

export default function NodeList() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeWeight, setNewNodeWeight] = useState('100');

  // ノード一覧の取得
  const fetchNodes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cluster/nodes');
      if (!response.ok) {
        throw new Error('ノード情報の取得に失敗しました');
      }
      const data = await response.json();
      setNodes(data.nodes || []);
      // アクティブノードの数をカウント (ダッシュボード表示用)
      const activeNodesCount = data.nodes.filter((node: Node) => node.status === 'active').length;
      document.getElementById('active-nodes-count')!.textContent = activeNodesCount.toString();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // ノードの削除
  const handleDeleteNode = async (nodeId: string) => {
    if (!confirm('このノードを削除してもよろしいですか？')) {
      return;
    }

    try {
      const response = await fetch(`/api/cluster/nodes/${nodeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('ノードの削除に失敗しました');
      }

      // 成功したら一覧を更新
      fetchNodes();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // ノードの追加
  const handleAddNode = async () => {
    if (!newNodeName.trim()) {
      alert('ノード名を入力してください');
      return;
    }

    try {
      const response = await fetch('/api/cluster/nodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newNodeName,
          weight: parseInt(newNodeWeight),
        }),
      });

      if (!response.ok) {
        throw new Error('ノードの追加に失敗しました');
      }

      // 成功したらモーダルを閉じて一覧を更新
      setShowAddModal(false);
      setNewNodeName('');
      setNewNodeWeight('100');
      fetchNodes();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // ノード障害のシミュレーション
  const handleSimulateFailure = async (nodeId: string, type: 'down' | 'slow' | 'partition') => {
    try {
      const response = await fetch('/api/simulation/failure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeId,
          type,
        }),
      });

      if (!response.ok) {
        throw new Error('障害シミュレーションに失敗しました');
      }

      // 成功したら一覧を更新
      fetchNodes();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // ノード復旧のシミュレーション
  const handleSimulateRecovery = async (nodeId: string) => {
    try {
      const response = await fetch('/api/simulation/recover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeId,
        }),
      });

      if (!response.ok) {
        throw new Error('復旧シミュレーションに失敗しました');
      }

      // 成功したら一覧を更新
      fetchNodes();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // ノード追加モーダルのトグル
  useEffect(() => {
    const addNodeBtn = document.getElementById('add-node-btn');
    if (addNodeBtn) {
      addNodeBtn.addEventListener('click', () => setShowAddModal(true));
    }
    return () => {
      if (addNodeBtn) {
        addNodeBtn.removeEventListener('click', () => setShowAddModal(true));
      }
    };
  }, []);

  // 初期データの取得
  useEffect(() => {
    fetchNodes();
    // 30秒ごとに自動更新
    const interval = setInterval(fetchNodes, 30000);
    return () => clearInterval(interval);
  }, []);

  // ノードの状態に応じたスタイルとラベルを取得
  const getNodeStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return {
          bg: 'bg-green-100',
          border: 'border-green-300',
          text: 'text-green-800',
          label: 'アクティブ',
        };
      case 'down':
        return {
          bg: 'bg-red-100',
          border: 'border-red-300',
          text: 'text-red-800',
          label: '停止中',
        };
      case 'slow':
        return {
          bg: 'bg-yellow-100',
          border: 'border-yellow-300',
          text: 'text-yellow-800',
          label: '低速',
        };
      case 'partitioned':
        return {
          bg: 'bg-orange-100',
          border: 'border-orange-300',
          text: 'text-orange-800',
          label: 'ネットワーク分断',
        };
      default:
        return {
          bg: 'bg-gray-100',
          border: 'border-gray-300',
          text: 'text-gray-800',
          label: '不明',
        };
    }
  };

  return (
    <>
      {loading && nodes.length === 0 ? (
        <div className="text-center py-4 text-gray-500">読み込み中...</div>
      ) : error ? (
        <div className="text-center py-4 text-red-600">{error}</div>
      ) : nodes.length === 0 ? (
        <div className="text-center py-4 text-gray-500">ノードがありません</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map((node) => {
            const statusStyle = getNodeStatusStyle(node.status);
            return (
              <div
                key={node.id}
                className={`rounded-lg border ${statusStyle.border} overflow-hidden`}
              >
                <div className={`p-3 ${statusStyle.bg} ${statusStyle.text} font-medium flex justify-between items-center`}>
                  <span>{node.name}</span>
                  <span className="text-xs px-2 py-1 rounded-full bg-white">{statusStyle.label}</span>
                </div>
                <div className="p-3">
                  <div className="text-xs text-gray-500 mb-2">ID: {node.id.substring(0, 8)}...</div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm">ウェイト:</span>
                    <span className="font-medium">{node.weight}</span>
                  </div>

                  <div className="mt-3 space-x-2 flex justify-end">
                    {node.status === 'active' ? (
                      <div className="dropdown relative">
                        <button className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded hover:bg-yellow-100">
                          障害シミュレーション ▼
                        </button>
                        <div className="dropdown-menu absolute right-0 mt-1 bg-white shadow-lg rounded border border-gray-200 hidden">
                          <button
                            onClick={() => handleSimulateFailure(node.id, 'down')}
                            className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50"
                          >
                            停止
                          </button>
                          <button
                            onClick={() => handleSimulateFailure(node.id, 'slow')}
                            className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50"
                          >
                            低速化
                          </button>
                          <button
                            onClick={() => handleSimulateFailure(node.id, 'partition')}
                            className="block w-full text-left text-xs px-3 py-2 hover:bg-gray-50"
                          >
                            ネットワーク分断
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSimulateRecovery(node.id)}
                        className="text-xs px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
                      >
                        復旧
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteNode(node.id)}
                      className="text-xs px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100"
                    >
                      削除
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ノード追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">新しいノードを追加</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ノード名</label>
                <input
                  type="text"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ウェイト (1-1000)</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={newNodeWeight}
                  onChange={(e) => setNewNodeWeight(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-gray-50 text-gray-700 rounded border border-gray-300"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddNode}
                className="px-4 py-2 bg-blue-600 text-white rounded"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ドロップダウンメニューのためのスタイル */}
      <style jsx>{`
        .dropdown:hover .dropdown-menu {
          display: block;
        }
      `}</style>
    </>
  );
}
