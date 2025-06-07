// ガベージコレクタの基本型定義

// オブジェクトの基本ヘッダー
export interface ObjectHeader {
  id: string;
  type: ObjectType;
  size: number;
  marked: boolean;
  generation: Generation;
  refs: string[]; // 参照しているオブジェクトのID配列
  refCount: number; // 参照カウント（デバッグ用）
  allocatedAt: number; // 割り当て時刻（ミリ秒）
  lastAccessed: number; // 最後のアクセス時刻
}

// オブジェクトタイプ
export type ObjectType =
  | 'string'
  | 'array'
  | 'object'
  | 'function'
  | 'number'
  | 'boolean'
  | 'root';

// 世代
export type Generation = 'young' | 'old';

// GCアルゴリズムタイプ
export type GCType = 'mark-sweep' | 'young-gen' | 'old-gen' | 'concurrent';

// ガベージコレクタで管理するオブジェクト
export interface GCObject {
  header: ObjectHeader;
  data: any; // 実際のデータ
}

// ヒープ世代の定義
export interface HeapGeneration {
  name: Generation;
  objects: Map<string, GCObject>;
  size: number; // 現在のメモリ使用量（バイト）
  limit: number; // 制限サイズ（バイト）
  gcCount: number; // GC実行回数
  promotionThreshold: number; // 昇格閾値
}

// マーキングコンテキスト
export interface MarkingContext {
  phase: 'idle' | 'marking' | 'sweeping' | 'promoting';
  visitedObjects: Set<string>;
  grayObjects: Set<string>; // tri-color marking用
  blackObjects: Set<string>; // tri-color marking用
  rootSet: Set<string>;
}

// GC統計情報
export interface GCStats {
  sessionId: string;
  gcType: GCType;
  startTime: number;
  endTime: number;
  duration: number;
  objectsBefore: number;
  objectsAfter: number;
  memoryBefore: number;
  memoryAfter: number;
  memoryFreed: number;
  collectionEfficiency: number;
}

// ヒープの状態スナップショット
export interface HeapSnapshot {
  sessionId: string;
  timestamp: number;
  youngGenSize: number;
  youngGenUsed: number;
  oldGenSize: number;
  oldGenUsed: number;
  totalObjects: number;
  rootObjects: number;
}

// GCログエントリ
export interface GCLogEntry {
  sessionId: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'debug';
  phase: string;
  message: string;
  metadata?: Record<string, any>;
}

// GCセッション
export interface GCSession {
  id: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  config: GCConfig;
  status: 'active' | 'paused' | 'stopped';
}

// GC設定
export interface GCConfig {
  youngGenSizeLimit: number; // Young世代のサイズ制限（バイト）
  oldGenSizeLimit: number; // Old世代のサイズ制限（バイト）
  promotionAge: number; // オブジェクトが昇格する世代数
  concurrentGC: boolean; // 並行GCを有効にするか
  gcTriggerThreshold: number; // GC実行トリガーの閾値（0.0-1.0）
  maxObjectSize: number; // 最大オブジェクトサイズ（バイト）
  debugMode: boolean; // デバッグモード
}

// デフォルト設定
export const DEFAULT_GC_CONFIG: GCConfig = {
  youngGenSizeLimit: 1024 * 1024, // 1MB
  oldGenSizeLimit: 4 * 1024 * 1024, // 4MB
  promotionAge: 2,
  concurrentGC: true,
  gcTriggerThreshold: 0.8,
  maxObjectSize: 64 * 1024, // 64KB
  debugMode: true,
};

// オブジェクト参照関係
export interface ObjectReference {
  sessionId: string;
  snapshotId: number;
  fromObjectId: string;
  toObjectId: string;
  referenceType: 'strong' | 'weak';
}

// GCイベント
export type GCEvent =
  | { type: 'gc-start'; gcType: GCType; timestamp: number }
  | { type: 'gc-complete'; stats: GCStats }
  | { type: 'object-allocated'; object: GCObject }
  | { type: 'object-freed'; objectId: string }
  | { type: 'object-promoted'; objectId: string; fromGen: Generation; toGen: Generation }
  | { type: 'heap-snapshot'; snapshot: HeapSnapshot }
  | { type: 'log'; entry: GCLogEntry };

// GCイベントハンドラー
export type GCEventHandler = (event: GCEvent) => void;
