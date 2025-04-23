'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
// import { RaftCluster } from '@/lib/raft/Cluster'; // パスは後で修正する可能性
// import { RaftNodeInfo, RaftMessage, SimulationEvent } from '@/lib/raft/types'; // パスは後で修正する可能性
import { RaftCluster } from '../lib/raft/Cluster'; // '@/' を使用
import { RaftNodeInfo, RaftMessage, SimulationEvent } from '../lib/raft/types'; // '@/' を使用
import { RaftNode } from '../lib/raft/Node'; // RaftNode 型をインポート

// イベントフィルターカテゴリーの型
export type EventFilterCategory = 'StateChange' | 'Voting' | 'LogReplication' | 'Timer' | 'Messaging' | 'Cluster';

// デフォルトで表示するフィルターカテゴリー
const DEFAULT_ACTIVE_FILTERS: Set<EventFilterCategory> = new Set([
  'StateChange', 'Voting', 'LogReplication', 'Cluster'
]);

interface RaftContextProps {
  cluster: RaftCluster | null;
  nodeInfos: RaftNodeInfo[];
  messages: RaftMessage[];
  events: SimulationEvent[];
  isRunning: boolean;
  simulationSpeed: number; // ステップ間の待機時間(ms)
  activeFilters: Set<EventFilterCategory>; // フィルター状態を追加
  startSimulation: () => void;
  pauseSimulation: () => void;
  stepSimulation: () => void;
  resetSimulation: (nodeCount?: number) => void;
  setSimulationSpeed: (speed: number) => void;
  addNode: () => void;
  removeNode: (nodeId: string) => void;
  stopNode: (nodeId: string) => void;
  resumeNode: (nodeId: string) => void;
  sendCommandToLeader: (command?: string) => void;
  updateNodePosition: (nodeId: string, position: { x: number, y: number }) => void;
  setActiveFilters: (updater: (prevFilters: Set<EventFilterCategory>) => Set<EventFilterCategory>) => void; // フィルター更新関数を追加
}

const RaftContext = createContext<RaftContextProps | undefined>(undefined);

const INITIAL_NODE_COUNT = 3;
const DEFAULT_SIMULATION_SPEED = 500; // ms per step when running

export const RaftProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cluster, setCluster] = useState<RaftCluster | null>(null);
  const [nodeInfos, setNodeInfos] = useState<RaftNodeInfo[]>([]);
  const [messages, setMessages] = useState<RaftMessage[]>([]);
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [simulationSpeed, setSimulationSpeed] = useState<number>(DEFAULT_SIMULATION_SPEED);
  const [activeFilters, setActiveFiltersState] = useState<Set<EventFilterCategory>>(DEFAULT_ACTIVE_FILTERS); // フィルター状態
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // setActiveFilters を安全に更新するためのラッパー
  const setActiveFilters = useCallback((updater: (prevFilters: Set<EventFilterCategory>) => Set<EventFilterCategory>) => {
    setActiveFiltersState(prev => updater(new Set(prev))); // 常に新しいSetインスタンスを作成
  }, []);

  // 初期化
  useEffect(() => {
    const newCluster = new RaftCluster(INITIAL_NODE_COUNT);
    setCluster(newCluster);
    setNodeInfos(newCluster.getAllNodeInfo());
    setEvents([...newCluster.eventLog]); // 初期イベントを取得
  }, []);

  const runStep = useCallback(() => {
    if (!cluster) return;
    const { nodeInfos: updatedNodeInfos, messages: currentMessages, events: currentLog } = cluster.step();
    setNodeInfos([...updatedNodeInfos]);
    setMessages(currentMessages);
    setEvents([...currentLog]);
  }, [cluster]);


  const startSimulation = useCallback(() => {
    if (isRunning || !cluster) return;
    setIsRunning(true);

    // タイマーを開始する必要があるノードを起動
    cluster.nodes.forEach(node => {
      if (node.state !== 'Stopped' && node.electionTimeoutId === null && node.state !== 'Leader') {
        node.resetElectionTimeout();
      }
      // Leaderのハートビートも再開する必要があればここで行うが、
      // Leaderへの遷移時にstartHeartbeatが呼ばれるので通常は不要かもしれない
      // if (node.state === 'Leader' && node.heartbeatTimeoutId === null) {
      //     node.startHeartbeat();
      // }
    });

    // 既存のインターバルがあればクリア (念のため)
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    // 新しいインターバルを開始
    intervalRef.current = setInterval(runStep, simulationSpeed);
    // 即座に1ステップ実行して開始をわかりやすくする
    runStep();
  }, [isRunning, cluster, runStep, simulationSpeed]);

  const pauseSimulation = useCallback(() => {
    if (!isRunning) return;
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // 全ノードのタイマーを停止
    cluster?.nodes.forEach(node => node.clearTimeouts());
    console.log('Simulation paused, timers cleared.');
  }, [isRunning, cluster]);

  const stepSimulation = useCallback(() => {
    if (isRunning || !cluster) return; // 実行中はステップ実行しない

    // タイマーを開始する必要があるノードを起動 (ステップ実行の場合も必要)
    cluster.nodes.forEach(node => {
      if (node.state !== 'Stopped' && node.electionTimeoutId === null && node.state !== 'Leader') {
        node.resetElectionTimeout();
      }
    });

    runStep();
  }, [isRunning, cluster, runStep]);

  const resetSimulation = useCallback((nodeCount: number = INITIAL_NODE_COUNT) => {
    pauseSimulation(); // 実行中なら停止 (ここでタイマーもクリアされる)
    if (cluster) {
      cluster.reset(nodeCount);
      setNodeInfos(cluster.getAllNodeInfo());
      setMessages([]);
      setEvents([...cluster.eventLog]);
    } else {
      const newCluster = new RaftCluster(nodeCount);
      setCluster(newCluster);
      setNodeInfos(newCluster.getAllNodeInfo());
      setMessages([]);
      setEvents([...newCluster.eventLog]);
    }
  }, [cluster, pauseSimulation]);

  // シミュレーション速度の変更
  const handleSetSimulationSpeed = useCallback((speed: number) => {
    const newSpeed = Math.max(50, speed); // 最低速度制限
    setSimulationSpeed(newSpeed);
    // 実行中ならインターバルを再設定
    if (isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(runStep, newSpeed);
    }
  }, [isRunning, runStep]);

  // ノード追加
  const addNode = useCallback(() => {
    if (!cluster) return;
    cluster.addNode();
    setNodeInfos(cluster.getAllNodeInfo());
  }, [cluster]);

  // ノード削除
  const removeNode = useCallback((nodeId: string) => {
    if (!cluster) return;
    cluster.removeNode(nodeId);
    setNodeInfos(cluster.getAllNodeInfo());
    setMessages([]); // 削除されたノード関連のメッセージが残らないようにクリア
  }, [cluster]);

  // ノード停止
  const stopNode = useCallback((nodeId: string) => {
    if (!cluster) return;
    cluster.stopNode(nodeId);
    setNodeInfos(cluster.getAllNodeInfo());
    setMessages([]); // 停止したノード関連のメッセージが残らないようにクリア
  }, [cluster]);

  // ノード再開
  const resumeNode = useCallback((nodeId: string) => {
    if (!cluster) return;
    cluster.resumeNode(nodeId);
    setNodeInfos(cluster.getAllNodeInfo());
  }, [cluster]);

  // コマンド送信
  const sendCommandToLeader = useCallback((command?: string) => {
    if (!cluster) return;
    const success = cluster.sendCommandToLeader(command);
    if (success) {
      // コマンド送信が成功したら即座に状態を更新（特にログ）
      setNodeInfos(cluster.getAllNodeInfo());
      // イベントログも更新されるはずなので取得
      setEvents([...cluster.eventLog]);
    }
  }, [cluster]);

  // ノードの位置更新 (D&D用)
  const updateNodePosition = useCallback((nodeId: string, position: { x: number, y: number }) => {
    if (!cluster) return;
    const node = cluster.getNodeById(nodeId);
    if (node) {
      node.updatePosition(position);
      // UI表示のためにnodeInfosを更新
      setNodeInfos(prevInfos => prevInfos.map(info =>
        info.id === nodeId ? { ...info, position } : info
      ));
    }
  }, [cluster]);


  // コンポーネントのアンマウント時にインターバルをクリア
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // クラスター内のタイマーもクリア (nodeの型を追加)
      cluster?.nodes.forEach((node: RaftNode) => node.stop()); // stop内でタイマークリアされる想定
    };
  }, [cluster]);

  const value: RaftContextProps = {
    cluster,
    nodeInfos,
    messages,
    events,
    isRunning,
    simulationSpeed,
    activeFilters,
    startSimulation,
    pauseSimulation,
    stepSimulation,
    resetSimulation,
    setSimulationSpeed: handleSetSimulationSpeed,
    addNode,
    removeNode,
    stopNode,
    resumeNode,
    sendCommandToLeader,
    updateNodePosition,
    setActiveFilters,
  };

  return <RaftContext.Provider value={value}>{children}</RaftContext.Provider>;
};

// Contextを使用するためのカスタムフック
export const useRaft = (): RaftContextProps => {
  const context = useContext(RaftContext);
  if (context === undefined) {
    throw new Error('useRaft must be used within a RaftProvider');
  }
  return context;
};
