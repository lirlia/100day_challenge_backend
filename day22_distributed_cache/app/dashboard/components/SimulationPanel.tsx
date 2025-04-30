'use client';

import { useState, useEffect } from 'react';
import { Node, FailureType } from '../../lib/types';

export default function SimulationPanel() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedFailureType, setSelectedFailureType] = useState<FailureType>('down');
  const [simulationLog, setSimulationLog] = useState<Array<{ time: Date; message: string }>>([]);

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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 障害シミュレーションの実行
  const simulateFailure = async () => {
    if (!selectedNode) {
      setError('ノードを選択してください');
      return;
    }

    setSimulating(true);
    setError(null);

    try {
      const response = await fetch('/api/simulation/failure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeId: selectedNode,
          type: selectedFailureType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'シミュレーションの実行に失敗しました');
      }

      // 選択されたノードの名前を取得
      const selectedNodeName = nodes.find(node => node.id === selectedNode)?.name || selectedNode;

      // 障害種別に応じたメッセージ
      const failureMessage =
        selectedFailureType === 'down' ? '停止' :
          selectedFailureType === 'slow' ? '低速応答' : 'ネットワーク分断';

      // ログにイベントを追加
      addToLog(`ノード「${selectedNodeName}」で ${failureMessage} 障害が発生しました`);

      // ノード一覧を更新 (SimulationPanel内のドロップダウン用)
      fetchNodes();
      window.dispatchEvent(new CustomEvent('nodes-updated')); // イベント発行
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSimulating(false);
    }
  };

  // 復旧シミュレーションの実行
  const simulateRecovery = async () => {
    if (!selectedNode) {
      setError('ノードを選択してください');
      return;
    }

    setSimulating(true);
    setError(null);

    try {
      const response = await fetch('/api/simulation/recover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeId: selectedNode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'シミュレーションの実行に失敗しました');
      }

      // 選択されたノードの名前を取得
      const selectedNodeName = nodes.find(node => node.id === selectedNode)?.name || selectedNode;

      // ログにイベントを追加
      addToLog(`ノード「${selectedNodeName}」が復旧しました`);

      // ノード一覧を更新 (SimulationPanel内のドロップダウン用)
      fetchNodes();
      window.dispatchEvent(new CustomEvent('nodes-updated')); // イベント発行
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSimulating(false);
    }
  };

  // シミュレーションログに追加
  const addToLog = (message: string) => {
    setSimulationLog(prev => [
      { time: new Date(), message },
      ...prev.slice(0, 9), // 最新の10件だけを保持
    ]);
  };

  // 初期データの取得
  useEffect(() => {
    fetchNodes();
  }, []);

  // ノードの状態に応じた選択肢リストを作成
  const getNodeOptions = () => {
    const activeNodes = nodes.filter(node => node.status === 'active');
    const nonActiveNodes = nodes.filter(node => node.status !== 'active');

    return (
      <>
        {activeNodes.length > 0 && (
          <optgroup label="アクティブなノード">
            {activeNodes.map(node => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </optgroup>
        )}
        {nonActiveNodes.length > 0 && (
          <optgroup label="障害状態のノード">
            {nonActiveNodes.map(node => (
              <option key={node.id} value={node.id}>
                {node.name} ({node.status === 'down' ? '停止中' : node.status === 'slow' ? '低速' : 'ネットワーク分断'})
              </option>
            ))}
          </optgroup>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="text-center py-4 text-gray-500">読み込み中...</div>
      ) : error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ノードを選択</label>
            <select
              value={selectedNode || ''}
              onChange={(e) => setSelectedNode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">-- ノードを選択 --</option>
              {getNodeOptions()}
            </select>
          </div>

          {selectedNode && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">障害種別</label>
                <div className="flex space-x-2">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="failureType"
                      value="down"
                      checked={selectedFailureType === 'down'}
                      onChange={() => setSelectedFailureType('down')}
                      className="mr-1"
                    />
                    <span className="text-sm">停止</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="failureType"
                      value="slow"
                      checked={selectedFailureType === 'slow'}
                      onChange={() => setSelectedFailureType('slow')}
                      className="mr-1"
                    />
                    <span className="text-sm">低速応答</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="failureType"
                      value="partition"
                      checked={selectedFailureType === 'partition'}
                      onChange={() => setSelectedFailureType('partition')}
                      className="mr-1"
                    />
                    <span className="text-sm">ネットワーク分断</span>
                  </label>
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={simulateFailure}
                  disabled={simulating || !selectedNode || nodes.find(n => n.id === selectedNode)?.status !== 'active'}
                  className={`flex-1 px-4 py-2 text-white rounded ${simulating || !selectedNode || nodes.find(n => n.id === selectedNode)?.status !== 'active'
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-700'
                    }`}
                >
                  障害発生
                </button>
                <button
                  onClick={simulateRecovery}
                  disabled={simulating || !selectedNode || nodes.find(n => n.id === selectedNode)?.status === 'active'}
                  className={`flex-1 px-4 py-2 text-white rounded ${simulating || !selectedNode || nodes.find(n => n.id === selectedNode)?.status === 'active'
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                    }`}
                >
                  復旧
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-base font-medium mb-2">シミュレーションログ</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 h-64 overflow-y-auto">
          {simulationLog.length === 0 ? (
            <div className="text-center text-gray-500 py-4">まだログはありません</div>
          ) : (
            <div className="space-y-2">
              {simulationLog.map((log, index) => (
                <div key={index} className="text-sm">
                  <span className="font-mono text-gray-500">
                    {log.time.toLocaleTimeString()}
                  </span>
                  <span className="mx-2">-</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
