'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Node as CacheNode } from '../../lib/types';

export default function NodeList() {
  const [nodes, setNodes] = useState<CacheNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeWeight, setNewNodeWeight] = useState(100);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ノード一覧の取得
  const fetchNodes = useCallback(async () => {
    console.log('[fetchNodes] Start');
    try {
      setLoading(true);
      setError(null);
      const startTime = Date.now();
      const response = await fetch('/api/cluster/nodes');

      const duration = Date.now() - startTime;
      console.log(`[fetchNodes] GET /api/cluster/nodes completed in ${duration}ms. Status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Failed to fetch nodes: ${response.status}` }));
        console.error('[fetchNodes] API Error:', errorData);
        throw new Error(errorData.error || `Failed to fetch nodes: ${response.status}`);
      }

      const data = await response.json();
      console.log('[fetchNodes] API Success. Data received:', data);
      if (Array.isArray(data.nodes)) {
        setNodes(data.nodes);
        console.log('[fetchNodes] setNodes called with:', data.nodes);
      } else {
        console.error('[fetchNodes] Expected data.nodes to be an array, but got:', data.nodes);
        setNodes([]);
        throw new Error('Received invalid node data format from server.');
      }
    } catch (err) {
      setError((err as Error).message);
      console.error('[fetchNodes] Caught error:', err);
      setNodes([]);
    } finally {
      console.log('[fetchNodes] Finally block reached. setLoading(false)');
      setLoading(false);
    }
    console.log('[fetchNodes] End');
  }, []);

  // ノードの追加
  const handleAddNode = async () => {
    console.log('[handleAddNode] Start');
    if (!newNodeName.trim()) {
      alert('ノード名を入力してください');
      console.log('[handleAddNode] Validation failed');
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('[handleAddNode] setIsSubmitting(true)');
      const startTime = Date.now();
      const response = await fetch('/api/cluster/nodes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newNodeName,
          weight: newNodeWeight,
        }),
      });

      const duration = Date.now() - startTime;
      console.log(`[handleAddNode] POST /api/cluster/nodes completed in ${duration}ms. Status: ${response.status}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Failed to add node: ${response.status}` }));
        console.error('[handleAddNode] API Error:', errorData);
        throw new Error(errorData.error || `Failed to add node: ${response.status}`);
      }

      console.log('[handleAddNode] API Success. Resetting form.');
      // フォームをリセット
      setNewNodeName('');
      setNewNodeWeight(100);
      setIsFormVisible(false);

      console.log('[handleAddNode] Calling fetchNodes...');
      // ノード一覧を再取得
      fetchNodes();
      console.log('[handleAddNode] fetchNodes completed.');

    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
      console.error('[handleAddNode] Caught error:', err);
    } finally {
      console.log('[handleAddNode] Finally block reached. setIsSubmitting(false)');
      setIsSubmitting(false);
    }
    console.log('[handleAddNode] End');
  };

  // ノードの削除
  const handleRemoveNode = async (nodeId: string) => {
    if (!confirm('このノードを削除してもよろしいですか？')) {
      return;
    }

    try {
      const response = await fetch(`/api/cluster/nodes/${nodeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to remove node: ${response.status}`);
      }

      // ノード一覧を再取得
      fetchNodes();
    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
      console.error('Failed to remove node:', err);
    }
  };

  // ノードの状態に基づいて色を決定
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'down':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'slow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'partitioned':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // 初回ロード時にノード一覧を取得
  useEffect(() => {
    fetchNodes();
    console.log('[NodeList] Initial fetchNodes called.');

    const handleNodesUpdate = () => {
      console.log('[NodeList] Received nodes-updated event. Fetching nodes...');
      fetchNodes();
    };

    window.addEventListener('nodes-updated', handleNodesUpdate);

    // クリーンアップ関数
    return () => {
      console.log('[NodeList] Removing event listener for nodes-updated.');
      window.removeEventListener('nodes-updated', handleNodesUpdate);
    };
  }, [fetchNodes]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">ノード一覧</h2>
        <button
          onClick={() => {
            console.log('[Toggle Button] Clicked. Current isFormVisible:', isFormVisible);
            setIsFormVisible(!isFormVisible);
            console.log('[Toggle Button] New isFormVisible:', !isFormVisible);
          }}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
        >
          {isFormVisible ? 'キャンセル' : '+ ノード追加'}
        </button>
      </div>

      {isFormVisible && (
        <div className="bg-blue-50 p-4 rounded-md border border-blue-200 mb-4">
          <h3 className="text-lg font-medium mb-2">新規ノード追加</h3>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">ノード名</label>
              <input
                type="text"
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="例: Node 4"
              />
            </div>
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-1">ウェイト</label>
              <input
                type="number"
                value={newNodeWeight}
                onChange={(e) => setNewNodeWeight(parseInt(e.target.value) || 100)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                min="1"
                max="1000"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={(e) => {
                  console.log('[Add Button] Clicked. Event:', e);
                  console.log('[Add Button] Current isSubmitting state:', isSubmitting);
                  handleAddNode();
                }}
                disabled={isSubmitting}
                className="w-full md:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              >
                {isSubmitting ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && nodes.length === 0 ? (
        <div className="text-center py-4">ノード一覧を読み込み中...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 p-4 rounded-md text-red-700">
          エラー: {error}
          <button
            onClick={fetchNodes}
            className="ml-4 px-2 py-1 bg-red-100 hover:bg-red-200 rounded"
          >
            再試行
          </button>
        </div>
      ) : nodes.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md text-yellow-700">
          ノードがありません。「ノード追加」をクリックして最初のノードを追加してください。
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ノード名
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状態
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ウェイト
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {nodes.map((node) => (
                <tr key={node.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {node.id.slice(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {node.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(node.status)}`}>
                      {node.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {node.weight}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => handleRemoveNode(node.id)}
                      className="text-red-600 hover:text-red-900"
                      disabled={node.status !== 'active'}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
