// ベクタークロック型
export interface VectorClock {
  [nodeId: string]: number;
}

// ノード情報
export interface Node {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'partitioned';
  created_at: string;
  last_seen: string;
}

// ネットワーク接続状態
export interface NetworkConnection {
  id: number;
  from_node: string;
  to_node: string;
  status: 'connected' | 'disconnected' | 'delayed';
  delay_ms: number;
  packet_loss_rate: number;
  updated_at: string;
}

// CRDT操作の基本インターface
export interface CRDTOperation {
  id: string;
  type: CRDTType;
  nodeId: string;
  crdtId: string;
  vectorClock: VectorClock;
  value: any;
  timestamp: number;
}

// CRDT状態スナップショット
export interface CRDTSnapshot {
  id: string;
  node_id: string;
  crdt_type: CRDTType;
  crdt_id: string;
  state: any;
  vector_clock: VectorClock;
  updated_at: string;
}

// CRDTタイプ
export type CRDTType = 'g_counter' | 'pn_counter' | 'g_set' | 'or_set' | 'lww_register' | 'rga' | 'awormap';

// デモタイプ
export type DemoType = 'counter' | 'text_editor' | 'todo' | 'voting' | 'settings';

// デモデータ
export interface DemoData {
  id: string;
  demo_type: DemoType;
  demo_id: string;
  crdt_type: CRDTType;
  crdt_id: string;
  metadata?: any;
  created_at: string;
}

// G-Counter状態
export interface GCounterState {
  counters: { [nodeId: string]: number };
}

// PN-Counter状態
export interface PNCounterState {
  positive: { [nodeId: string]: number };
  negative: { [nodeId: string]: number };
}

// G-Set状態
export interface GSetState<T = any> {
  elements: Set<T>;
}

// OR-Set状態
export interface ORSetState<T = any> {
  elements: { [element: string]: Set<string> }; // element -> set of unique tags
  removed: { [element: string]: Set<string> }; // element -> set of removed tags
}

// LWW-Register状態
export interface LWWRegisterState<T = any> {
  value: T;
  timestamp: number;
  node_id: string;
}

// RGA操作（文字列編集用）
export interface RGAOperation {
  type: 'insert' | 'delete';
  position?: number;
  character?: string;
  id: string;
  node_id: string;
  timestamp: number;
}

// RGA要素
export interface RGAElement {
  id: string;
  value: string;
  isDeleted: boolean;
  previousElementId: string | null;
}

// RGA状態
export interface RGAState {
  elements: { [elementId: string]: RGAElement };
  order: string[];
  text: string;
}

// AWORMap状態
export interface AWORMapState<T = any> {
  entries: {
    [key: string]: {
      value: T;
      timestamp: number;
      nodeId: string;
      addedTags: Set<string>;
      removedTags: Set<string>;
    };
  };
}

// 基本CRDT抽象インターface
export interface CRDT<TState = any, TOperation = any> {
  readonly type: CRDTType;
  readonly id: string;
  readonly nodeId: string;

  // 現在の状態を取得
  getState(): TState;

  // ベクタークロックを取得
  getVectorClock(): VectorClock;

  // 操作を適用
  applyOperation(operation: TOperation): void;

  // 他のCRDTとマージ
  merge(other: CRDT<TState, TOperation>): void;

  // 状態をJSON形式でシリアライズ
  serialize(): string;

  // JSON形式から状態を復元
  deserialize(data: string): void;

  // 比較：このCRDTが他のCRDTよりも新しいかチェック
  isNewerThan(other: CRDT<TState, TOperation>): boolean;

  // ディープコピー
  clone(): CRDT<TState, TOperation>;
}

// ネットワークメッセージ
export interface NetworkMessage {
  id: string;
  from_node: string;
  to_node: string;
  message_type: 'operation' | 'sync_request' | 'sync_response' | 'heartbeat';
  payload: any;
  timestamp: number;
  vector_clock: VectorClock;
}

// システム統計
export interface SystemStats {
  total_nodes: number;
  online_nodes: number;
  total_operations: number;
  total_crdts: number;
  network_partitions: number;
  average_latency: number;
  sync_conflicts: number;
}

// UI用の可視化データ
export interface VisualizationData {
  nodes: Array<{
    id: string;
    name: string;
    status: string;
    position: { x: number; y: number };
    operations: number;
  }>;
  connections: Array<{
    from: string;
    to: string;
    status: string;
    delay: number;
    activity: number;
  }>;
  operations: Array<{
    id: string;
    type: string;
    node: string;
    timestamp: number;
    success: boolean;
  }>;
}
