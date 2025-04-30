'use client';

import { useState, useEffect } from 'react';
import type { ReplicationStatus, NodeReplicationStat } from '../../lib/types';

// クラスタステータスのコンポーネント
export default function ClusterStatus() {
  const [status, setStatus] = useState<{
    replication: ReplicationStatus;
    events: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // クラスタステータスの取得
  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cluster/status');

      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`);
      }

      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      console.error('Failed to fetch cluster status:', err);
    } finally {
      setLoading(false);
    }
  };

  // ノードの色を状態に基づいて決定
  const getNodeStatusColor = (status: string): string => {
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

  // イベントタイプに基づいて色を決定
  const getEventTypeColor = (type: string): string => {
    switch (type) {
      case 'node_added':
        return 'bg-green-100 text-green-800';
      case 'node_removed':
        return 'bg-red-100 text-red-800';
      case 'node_down':
        return 'bg-yellow-100 text-yellow-800';
      case 'node_recovered':
        return 'bg-blue-100 text-blue-800';
      case 'rebalance_started':
        return 'bg-purple-100 text-purple-800';
      case 'rebalance_completed':
        return 'bg-indigo-100 text-indigo-800';
      case 'cache_updated':
        return 'bg-teal-100 text-teal-800';
      case 'cache_deleted':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // リバランス操作の実行
  const handleRebalance = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cluster/rebalance', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`Failed to start rebalance: ${response.status}`);
      }

      alert('Rebalance operation started. Check events for progress.');
      fetchStatus();
    } catch (err) {
      alert(`Error: ${(err as Error).message}`);
      console.error('Failed to start rebalance:', err);
    } finally {
      setLoading(false);
    }
  };

  // 初回ロード時とポーリング
  useEffect(() => {
    fetchStatus();

    // 5秒ごとに更新
    const intervalId = setInterval(fetchStatus, 5000);

    return () => clearInterval(intervalId);
  }, []);

  if (loading && !status) {
    return <div className="p-4 text-center">Loading cluster status...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
        Error: {error}
        <button
          onClick={fetchStatus}
          className="ml-4 px-2 py-1 bg-red-100 hover:bg-red-200 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700">
        No cluster status available.
      </div>
    );
  }

  // クラスタの全体統計表示
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Cluster Status</h2>
        <button
          onClick={handleRebalance}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md"
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Rebalance Cluster'}
        </button>
      </div>

      {/* ノード別統計 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg font-medium text-gray-900">Node Statistics</h3>
        </div>
        <div className="border-t border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Node
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Primary Items
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Replica Items
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {status.replication.nodeStats.map((node: NodeReplicationStat) => (
                <tr key={node.nodeId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {node.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getNodeStatusColor(node.status)}`}>
                      {node.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {node.primaryItems}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {node.replicaItems}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* クラスタイベント */}
      {/* <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg font-medium text-gray-900">Recent Cluster Events</h3>
        </div>
        <div className="border-t border-gray-200 overflow-auto max-h-64">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Event
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {status.events.map((event) => (
                <tr key={event.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getEventTypeColor(event.type)}`}>
                      {event.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {Object.entries(event.payload).map(([key, value]) => (
                      <div key={key}>
                        <span className="font-medium">{key}:</span> {value as string}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div> */}
    </div>
  );
}
