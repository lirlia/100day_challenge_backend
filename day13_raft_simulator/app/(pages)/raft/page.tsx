'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeView } from '../../../components/raft/NodeView';
import { RpcArrow, RpcArrowProps } from '../../../components/raft/RpcArrow'; // Import RpcArrowProps
import { SimulationState, QueuedMessage, createInitialSimulationState, simulationTick, startSimulation, pauseSimulation, resetSimulation, addClientRequestToSimulation, stopNodeInSimulation, resumeNodeInSimulation } from '../../../lib/raft/simulation';
import { NodeId, NodeState, SimulationEvent, RPCMessage, RequestVoteArgs, AppendEntriesArgs, RequestVoteReply, AppendEntriesReply, RaftNodeData } from '../../../lib/types/raft'; // Import RaftNodeData

const TICK_INTERVAL_MS = 100; // シミュレーションの速度 (ms)
const INITIAL_NODE_COUNT = 3;
const NODE_DIAMETER_PX = 112; // Corresponds to w-28 h-28 in NodeView

// イベントログ表示コンポーネント (仮)
const EventLogView: React.FC<{ events: SimulationEvent[] }> = ({ events }) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  // 自動スクロール
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div ref={logContainerRef} className="flex-1 bg-white border border-gray-300 rounded p-2 overflow-y-auto text-sm font-mono">
      {events.slice().reverse().map((event: SimulationEvent, index: number) => ( // Added types
         (<p key={events.length - 1 - index} className="text-xs mb-1 whitespace-pre-wrap break-words"> {/* 改行と折り返し */}
           <span className="text-gray-500 mr-1">[{event.timestamp.toString().padStart(4, '0')}]</span> {/* タイムスタンプ表示 */}
           {event.description}
         </p>)
      ))}
      {events.length === 0 && <p className="text-gray-400">No events yet...</p>}
    </div>
  );
};


export default function RaftSimulatorPage() {
  const [simulationState, setSimulationState] = useState<SimulationState>(() => createInitialSimulationState(INITIAL_NODE_COUNT));
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // シミュレーションを進める関数
  const advanceSimulation = useCallback(() => {
    setSimulationState((prevState: SimulationState) => simulationTick(prevState));
  }, []);

  // シミュレーションの自動実行
  useEffect(() => {
    if (simulationState.isRunning) {
      intervalRef.current = setInterval(advanceSimulation, TICK_INTERVAL_MS);
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
  }, [simulationState.isRunning, advanceSimulation]);

  // --- コントロールハンドラー ---
  const handleStartPause = () => {
    setSimulationState((prevState: SimulationState) => prevState.isRunning ? pauseSimulation(prevState) : startSimulation(prevState));
  };

  const handleReset = () => {
    setSimulationState(resetSimulation(simulationState));
    setSelectedNodeId(null); // 選択解除
  };

  const handleStep = () => {
    if (!simulationState.isRunning) {
      advanceSimulation();
    }
  };

  const handleAddNode = () => {
    // TODO: Implement addNode simulation logic & UI
    console.log("Add Node clicked - Not implemented yet");
    // setSimulationState(prevState => addNodeToSimulation(prevState));
  };

  const handleSendClientRequest = () => {
    setSimulationState((prevState: SimulationState) => addClientRequestToSimulation(prevState));
  };

  // --- ノード操作ハンドラ ---
  const handleNodeClick = (nodeId: NodeId) => {
      setSelectedNodeId((prevId: NodeId | null) => prevId === nodeId ? null : nodeId); // クリックで選択/選択解除
  };

  const handleToggleNodeState = () => {
      if (!selectedNodeId) return;
      const node = simulationState.nodes.find((n: RaftNodeData) => n.id === selectedNodeId);
      if (node) {
          if (node.state === NodeState.Stopped) {
              setSimulationState((prevState: SimulationState) => resumeNodeInSimulation(prevState, selectedNodeId));
          } else {
              setSimulationState((prevState: SimulationState) => stopNodeInSimulation(prevState, selectedNodeId));
          }
      }
      setSelectedNodeId(null); // 操作後は選択解除
  };

  // TODO: handleNodeDrag, handleNodeDelete


  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold">Day 13: Raft Simulator</h1>
        <span className="font-mono text-sm">Time: {simulationState.currentTime}</span>
      </header>
      <main className="flex flex-1 overflow-hidden">
        {/* Simulation Area (Board) */}
        <section className="flex-1 bg-gray-50 m-4 border border-gray-300 rounded shadow-inner relative overflow-auto cursor-grab active:cursor-grabbing">
          {/* Render RPC Arrows */}
          {simulationState.messageQueue.map((queuedMsg: QueuedMessage, index: number) => {
            if (queuedMsg.to === 'broadcast') return null; // Broadcast not visualized yet

            const msg = queuedMsg.message;
            let senderId: NodeId | null = null;
            let receiverId: NodeId = queuedMsg.to;
            let messageType: RpcArrowProps['messageType'] | null = null;
            let voteGranted: boolean | undefined = undefined;
            let success: boolean | undefined = undefined;

            // Determine sender and message type
            if (msg.type === 'RequestVote') {
                senderId = (msg as RequestVoteArgs).candidateId;
                messageType = 'RequestVote';
            } else if (msg.type === 'AppendEntries') {
                senderId = (msg as AppendEntriesArgs).leaderId;
                // Distinguish between heartbeat and actual entries
                messageType = (msg as AppendEntriesArgs).entries.length === 0 ? 'Heartbeat' : 'AppendEntries';
            } else if (msg.type === 'RequestVoteReply') {
                senderId = (msg as RequestVoteReply).from;
                messageType = 'RequestVoteReply';
                voteGranted = (msg as RequestVoteReply).voteGranted;
            } else if (msg.type === 'AppendEntriesReply') {
                senderId = (msg as AppendEntriesReply).from;
                messageType = 'AppendEntriesReply';
                success = (msg as AppendEntriesReply).success;
            }

            if (!senderId || !messageType) return null;

            const senderNode = simulationState.nodes.find((n: RaftNodeData) => n.id === senderId);
            const receiverNode = simulationState.nodes.find((n: RaftNodeData) => n.id === receiverId);

            if (!senderNode || !receiverNode || senderNode.state === NodeState.Stopped || receiverNode.state === NodeState.Stopped) {
                return null; // Don't draw arrows for stopped nodes or if node not found
            }

            return (
                <RpcArrow
                    key={`arrow-${index}`}
                    startX={senderNode.position.x}
                    startY={senderNode.position.y}
                    endX={receiverNode.position.x}
                    endY={receiverNode.position.y}
                    messageType={messageType}
                    voteGranted={voteGranted}
                    success={success}
                    nodeSize={NODE_DIAMETER_PX}
                />
            );
          })}

          {/* Nodes */}
          {simulationState.nodes.map((node: RaftNodeData) => (
            // 外側の div でクリックイベントを処理し、NodeView に isSelected を渡す
            (<div key={node.id} onClick={() => handleNodeClick(node.id)} style={{ zIndex: 5 }} >
              <NodeView node={node} isSelected={selectedNodeId === node.id} />
            </div>)
          ))}
          {/* TODO: Render RPC Arrows */}
          {/* TODO: Implement Drag and Drop for Nodes */}
           {/* TODO: Implement adding node on background click */}
        </section>

        {/* Control & Log Area */}
        <aside className="w-1/3 lg:w-1/4 bg-gray-100 p-4 border-l border-gray-300 flex flex-col space-y-4 overflow-y-auto">
          {/* Simulation Controls */}
          <div className="border-b pb-4">
            <h2 className="text-lg font-semibold mb-2">Simulation Controls</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleStartPause}
                className={`text-white font-bold py-2 px-4 rounded transition-colors ${simulationState.isRunning ? 'bg-red-500 hover:bg-red-700' : 'bg-blue-500 hover:bg-blue-700'}`}>
                {simulationState.isRunning ? 'Pause' : 'Start'}
              </button>
              <button onClick={handleReset} className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-colors">
                Reset
              </button>
              <button onClick={handleStep} disabled={simulationState.isRunning} className={`font-bold py-2 px-4 rounded transition-colors ${simulationState.isRunning ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-green-500 hover:bg-green-700 text-white'}`}>
                Step
              </button>
               <button onClick={handleSendClientRequest} className="bg-orange-500 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded transition-colors col-span-2">
                Send Command
              </button>
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
                <button onClick={handleAddNode} className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors w-full" disabled>
                    Add Node (NYI)
                </button>
           </div>


          {/* Event Log */}
          <div className="flex-1 flex flex-col min-h-0">
            <h2 className="text-lg font-semibold mb-2">Event Log</h2>
            <EventLogView events={simulationState.events} />
          </div>
        </aside>
      </main>
    </div>
  );
}
