/**
 * キャッシュキー用の型
 */
export type CacheKey = string;

/**
 * キャッシュ値用の型
 */
export type CacheValue = string;

/**
 * キャッシュアイテムのメタデータ
 */
export interface CacheItemMetadata {
  /** キャッシュ有効期限 */
  expiresAt?: string;
  /** キャッシュバージョン */
  version: number;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * キャッシュ操作レスポンス
 */
export interface CacheItemResponse {
  /** キャッシュキー */
  key: CacheKey;
  /** キャッシュ値 */
  value: CacheValue;
  /** メタデータ */
  metadata: CacheItemMetadata;
}

/**
 * キャッシュノードの状態
 */
export type NodeStatus = 'active' | 'down' | 'slow' | 'partitioned';

/**
 * キャッシュノード情報
 */
export interface Node {
  /** ノードID */
  id: string;
  /** ノード名 */
  name: string;
  /** ノードの状態 */
  status: NodeStatus;
  /** ハッシュリングでのウェイト */
  weight: number;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * キャッシュ設定オプション
 */
export interface CacheSetOptions {
  /** 有効期限（秒） */
  ttl?: number;
  /** バージョン */
  version?: number;
}

/**
 * クラスタイベント種別
 */
export type ClusterEventType =
  | 'cluster_created'
  | 'node_added'
  | 'node_removed'
  | 'node_updated'
  | 'rebalance_started'
  | 'rebalance_completed'
  | 'node_down'
  | 'node_recovered';

/**
 * クラスタイベント
 */
export interface ClusterEvent {
  /** イベントID */
  id: string;
  /** イベント種別 */
  type: ClusterEventType;
  /** イベントペイロード */
  payload: string;
  /** 作成日時 */
  createdAt: string;
}

/**
 * シミュレーション障害種別
 */
export type FailureType = 'down' | 'slow' | 'partition';

/**
 * キャッシュノード間の一貫性レベル
 */
export type ConsistencyLevel = 'strong' | 'eventual';
