'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
// import { NodeView } from '../../../components/raft/NodeView'; // あとで復活させる
import { RpcArrow, RpcArrowProps } from '../../../components/raft/RpcArrow';
// import { SimulationState, QueuedMessage, createInitialSimulationState, simulationTick, startSimulation, pauseSimulation, resetSimulation, addClientRequestToSimulation, stopNodeInSimulation, resumeNodeInSimulation } from '../../../lib/raft/simulation'; // ← 削除
import { NodeId, NodeState, RaftNodeData, RpcData } from '../../../lib/types/raft'; // RpcData をインポート、他は整理

// APIから返されるシミュレーション状態の型 (仮)
interface ApiSimulationState {
  nodes: RaftNodeData[];
  rpcs: RpcData[];
  currentTime: number;
  isRunning: boolean;
}

const TICK_INTERVAL_MS = 500; // シミュレーションの速度 (ms) - API ポーリング間隔に
const NODE_DIAMETER_PX = 112; // Corresponds to w-28 h-28

// 仮のNodeView (あとで正式なものを復活させる)
const NodeViewPlaceholder: React.FC<{ node: RaftNodeData, onClick: (id: NodeId) => void, onDragStart: any, onDrag: any, onDragEnd: any, isSelected: boolean }> = ({ node, onClick, onDragStart, onDrag, onDragEnd, isSelected }) => (
  <div
    id={String(node.id)}
    onClick={() => onClick(node.id)}
    onDragStart={onDragStart}
    onDrag={onDrag}
    onDragEnd={onDragEnd}
    draggable="true"
    className={`absolute p-4 border rounded-lg shadow-md cursor-grab flex flex-col items-center justify-center text-white select-none ${isSelected ? 'ring-4 ring-offset-2 ring-indigo-500' : ''}
      ${node.state === NodeState.Leader ? 'bg-yellow-500' :
      node.state === NodeState.Candidate ? 'bg-blue-500' :
      node.state === NodeState.Follower ? 'bg-green-500' :
      'bg-gray-500' // Stopped
      }`}
    style={{ left: `${node.position.x}px`, top: `${node.position.y}px`, width: '100px', height: '100px' }}
    title={`ID: ${node.id}\nState: ${node.state}\nTerm: ${node.currentTerm}`}
  >
    <span className="font-bold text-lg">{node.id}</span>
    <span className="text-sm capitalize">{node.state}</span>
    <span className="text-xs">T: {node.currentTerm}</span>
  </div>
);


export default function RaftSimulatorPage() {
  const [simulationState, setSimulationState] = useState<ApiSimulationState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [isSimRunning, setIsSimRunning] = useState(false); // UI制御用の実行状態
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // APIから状態を取得する関数
  const fetchSimulationState = useCallback(async () => {
    try {
      const response = await fetch('/api/raft/simulation');
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      const data: ApiSimulationState = await response.json();
      setSimulationState(data);
      // APIから取得した isRunning 状態を UI 制御用ステートに反映 (初回ロード時など)
      if (simulationState === null) {
        setIsSimRunning(data.isRunning);
      }
    } catch (error) {
      console.error("Failed to fetch simulation state:", error);
      // ここでエラー表示などの処理を追加
    }
  }, [simulationState]); // simulationState を依存配列に追加して初回ロード時以外も対応

  // 初期状態の取得
  useEffect(() => {
    fetchSimulationState();
  }, []); // 初回のみ実行

  // シミュレーションの自動 Tick (isSimRunning が true の場合)
  useEffect(() => {
    if (isSimRunning) {
      intervalRef.current = setInterval(async () => {
        try {
          const response = await fetch('/api/raft/simulation', { method: 'POST' });
          if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
          }
          const data: ApiSimulationState = await response.json();
          setSimulationState(data);
        } catch (error) {
          console.error("Failed to tick simulation:", error);
          setIsSimRunning(false); // エラー発生時は停止
        }
      }, TICK_INTERVAL_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    // クリーンアップ関数
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isSimRunning]);

  // --- コントロールハンドラー (APIコールに変更) ---
  const handleStartPause = async () => {
      const newState = !isSimRunning;
      setIsSimRunning(newState);
      // API 側の isRunning は tick や reset API が制御するため、ここではUI状態のみ変更
  };

  const handleReset = async () => {
    setIsSimRunning(false); // UI 上はまず停止
    try {
        const response = await fetch('/api/raft/simulation', { method: 'DELETE' });
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        const data: ApiSimulationState = await response.json();
        setSimulationState(data);
        setIsSimRunning(data.isRunning); // APIからの状態で更新
        setSelectedNodeId(null);
    } catch (error) {
        console.error("Failed to reset simulation:", error);
    }
  };

  const handleStep = async () => {
    if (isSimRunning) return; // 実行中はステップ実行不可
    try {
        const response = await fetch('/api/raft/simulation', { method: 'POST' });
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        const data: ApiSimulationState = await response.json();
        setSimulationState(data);
    } catch (error) {
        console.error("Failed to step simulation:", error);
    }
  };

  // const handleSendClientRequest = () => {}; // TODO: 必要ならAPI実装

  // --- ノード操作ハンドラ (APIコールに変更) ---
  const handleNodeClick = (nodeId: NodeId) => {
      setSelectedNodeId((prevId) => prevId === nodeId ? null : nodeId);
  };

  const handleToggleNodeState = async () => {
      if (!selectedNodeId) return;
      try {
          const response = await fetch(`/api/raft/nodes/${selectedNodeId}`, { method: 'POST' });
          if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
          const data: ApiSimulationState = await response.json();
          setSimulationState(data);
      } catch (error) {
          console.error(`Failed to toggle node ${selectedNodeId} state:`, error);
      }
      setSelectedNodeId(null);
  };

  // --- ドラッグ＆ドロップ処理 ---
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, nodeId: NodeId) => {
    const nodeElement = e.currentTarget;
    const style = window.getComputedStyle(nodeElement);
    const left = parseInt(style.left, 10);
    const top = parseInt(style.top, 10);

    // マウスポインタと要素左上隅のオフセットを計算
    dragOffsetRef.current = {
        x: e.clientX - left,
        y: e.clientY - top,
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(nodeId)); // ドラッグ中のノードIDを保持
    // 透明なゴースト要素を設定 (ブラウザデフォルトのを使う場合は不要)
    // const ghost = e.currentTarget.cloneNode(true) as HTMLElement;
    // ghost.style.opacity = '0.5';
    // document.body.appendChild(ghost);
    // e.dataTransfer.setDragImage(ghost, dragOffsetRef.current.x, dragOffsetRef.current.y);
    // setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // これがないと onDrop が発火しない
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const nodeId = e.dataTransfer.getData('text/plain');
    if (!nodeId || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();

    // コンテナ内の相対座標を計算
    let newX = e.clientX - containerRect.left - dragOffsetRef.current.x;
    let newY = e.clientY - containerRect.top - dragOffsetRef.current.y;

    // 境界チェック (コンテナ内に収める)
    newX = Math.max(0, Math.min(newX, containerRect.width - NODE_DIAMETER_PX));
    newY = Math.max(0, Math.min(newY, containerRect.height - NODE_DIAMETER_PX));

    // UIを即時更新 (オプティミスティックアップデート)
    setSimulationState(prevState => {
        if (!prevState) return null;
        return {
            ...prevState,
            nodes: prevState.nodes.map(n =>
                n.id === nodeId ? { ...n, position: { x: newX, y: newY } } : n
            ),
        };
    });

    // API に位置情報を送信
    try {
        const response = await fetch(`/api/raft/nodes/${nodeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: newX, y: newY }),
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
            // TODO: エラー発生時はUIを元に戻す処理
        }
        // const data = await response.json(); // 成功時は状態を再同期しても良いが、必須ではない
        // setSimulationState(data);
    } catch (error) {
        console.error(`Failed to update node ${nodeId} position:`, error);
        // TODO: エラー発生時はUIを元に戻す処理 (fetchSimulationState()を呼ぶなど)
        fetchSimulationState(); // エラー時は状態を再同期
    }

  };


  if (!simulationState) {
    return <div>Loading simulation...</div>; // ローディング表示
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold">Day 13: Raft Simulator</h1>
        <span className="font-mono text-sm">Time: {simulationState.currentTime}</span>
      </header>
      <main className="flex flex-1 overflow-hidden">
        {/* Simulation Area (Board) */}
        <section
          ref={containerRef}
          className="flex-1 bg-gray-50 m-4 border border-gray-300 rounded shadow-inner relative overflow-auto"
          onDragOver={handleDragOver} // DragOver をコンテナに設定
          onDrop={handleDrop}         // Drop をコンテナに設定
        >
          {/* Render RPC Arrows (APIから取得した rpcs を使用) */}
          {simulationState.rpcs.map((rpc: RpcData) => {
            const senderNode = simulationState.nodes.find((n) => n.id === rpc.from);
            const receiverNode = simulationState.nodes.find((n) => n.id === rpc.to);

            if (!senderNode || !receiverNode || rpc.to === 'broadcast' || senderNode.state === NodeState.Stopped || receiverNode.state === NodeState.Stopped) {
              return null;
            }

            // 型ガードやアサーションで messageType を特定
            let messageType: RpcArrowProps['messageType'] | null = null;
            let voteGranted: boolean | undefined = undefined;
            let success: boolean | undefined = undefined;
            if (rpc.type === 'RequestVote') messageType = 'RequestVote';
            else if (rpc.type === 'AppendEntries') messageType = 'AppendEntries'; // TODO: Heartbeat区別
            else if (rpc.type === 'RequestVoteReply') {
                messageType = 'RequestVoteReply';
                // voteGranted = rpc.voteGranted; // RpcData に voteGranted がない -> API側で含める必要あり
            } else if (rpc.type === 'AppendEntriesReply') {
                messageType = 'AppendEntriesReply';
                // success = rpc.success; // RpcData に success がない -> API側で含める必要あり
            }

            if (!messageType) return null;

            return (
              <RpcArrow
                key={rpc.id}
                startX={senderNode.position.x}
                startY={senderNode.position.y}
                endX={receiverNode.position.x}
                endY={receiverNode.position.y}
                messageType={messageType}
                voteGranted={voteGranted} // 将来的にAPIから取得
                success={success}         // 将来的にAPIから取得
                nodeSize={NODE_DIAMETER_PX}
              />
            );
          })}

          {/* Nodes (Placeholder を使用) */}
          {simulationState.nodes.map((node) => (
             <NodeViewPlaceholder
               key={node.id}
               node={node}
               onClick={handleNodeClick}
               onDragStart={(e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, node.id)}
               onDrag={() => {}} // onDrag はここでは不要
               onDragEnd={() => {}} // onDragEnd はコンテナの onDrop で処理
               isSelected={selectedNodeId === node.id}
             />
          ))}

        </section>

        {/* Control & Log Area */}
        <aside className="w-1/3 lg:w-1/4 bg-gray-100 p-4 border-l border-gray-300 flex flex-col space-y-4 overflow-y-auto">
          {/* Simulation Controls */}
          <div className="border-b pb-4">
            <h2 className="text-lg font-semibold mb-2">Simulation Controls</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleStartPause}
                className={`text-white font-bold py-2 px-4 rounded transition-colors ${isSimRunning ? 'bg-red-500 hover:bg-red-700' : 'bg-blue-500 hover:bg-blue-700'}`}>
                {isSimRunning ? 'Pause' : 'Start'}
              </button>
              <button onClick={handleReset} className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors">
                Reset
              </button>
              <button onClick={handleStep} disabled={isSimRunning} className={`font-bold py-2 px-4 rounded transition-colors ${isSimRunning ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-green-500 hover:bg-green-700 text-white'}`}>
                Step
              </button>
               {/* <button onClick={handleSendClientRequest} className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded transition-colors col-span-2">
                Send Command
              </button> */}
            </div>
          </div>

          {/* Node Actions (conditional) */}
          {selectedNodeId && (
            <div className="border-b pb-4">
                <h2 className="text-lg font-semibold mb-2">Node Actions ({selectedNodeId})</h2>
                 <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleToggleNodeState} className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded transition-colors">
                        {simulationState.nodes.find((n: RaftNodeData)=>n.id===selectedNodeId)?.state === NodeState.Stopped ? 'Resume' : 'Stop'}
                    </button>
                     <button onClick={() => {/* TODO: Implement Delete */ setSelectedNodeId(null);}} className="bg-pink-500 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded transition-colors" disabled>
                        Delete Node
                    </button>
                    {/* 将来的に他のアクションも追加 */}
                 </div>
            </div>
          )}

          {/* Global Actions */}
           <div className="border-b pb-4">
                <h2 className="text-lg font-semibold mb-2">Global Actions</h2>
                {/* <button onClick={handleAddNode} className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors w-full" disabled>
                    Add Node (NYI)
                </button> */}
           </div>


          {/* Event Log */}
          <div className="flex-1 flex flex-col min-h-0">
            <h2 className="text-lg font-semibold mb-2">Event Log</h2>
            {/* <EventLogView events={simulationState.events} /> */}
          </div>
        </aside>
      </main>
    </div>
  );
}
