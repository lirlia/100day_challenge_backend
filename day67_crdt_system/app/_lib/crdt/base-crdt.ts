import { CRDT, CRDTType, VectorClock } from '@/lib/types';
import { VectorClockManager } from './vector-clock';
import { nanoid } from 'nanoid';

/**
 * CRDT基底クラス - 全てのCRDTの共通機能を提供
 */
export abstract class BaseCRDT<TState = any, TOperation = any> implements CRDT<TState, TOperation> {
  public readonly type: CRDTType;
  public readonly id: string;
  public readonly nodeId: string;
  protected vectorClock: VectorClockManager;
  protected lastModified: number;

  constructor(type: CRDTType, id: string, nodeId: string, initialClock?: VectorClock) {
    this.type = type;
    this.id = id;
    this.nodeId = nodeId;
    this.vectorClock = new VectorClockManager(nodeId, initialClock);
    this.lastModified = Date.now();

    console.log(`🔧 [${this.nodeId}] ${this.type} CRDT作成: ${this.id}`);
  }

  /**
   * 現在の状態を取得（抽象メソッド）
   */
  abstract getState(): TState;

  /**
   * 操作を適用（抽象メソッド）
   */
  abstract applyOperation(operation: TOperation): void;

  /**
   * 他のCRDTとマージ（抽象メソッド）
   */
  abstract merge(other: CRDT<TState, TOperation>): void;

  /**
   * 状態の比較（抽象メソッド）
   */
  abstract equals(other: CRDT<TState, TOperation>): boolean;

  /**
   * 現在のベクタークロックを取得
   */
  getVectorClock(): VectorClock {
    return this.vectorClock.getClock();
  }

  /**
   * 操作時のベクタークロック更新
   */
  protected incrementClock(): VectorClock {
    this.lastModified = Date.now();
    return this.vectorClock.increment();
  }

  /**
   * 他ノードとのクロック同期
   */
  protected syncClock(otherClock: VectorClock): VectorClock {
    this.lastModified = Date.now();
    return this.vectorClock.sync(otherClock);
  }

  /**
   * このCRDTが他のCRDTよりも新しいかチェック
   */
  isNewerThan(other: CRDT<TState, TOperation>): boolean {
    return this.vectorClock.isAfter(other.getVectorClock());
  }

  /**
   * このCRDTが他のCRDTよりも古いかチェック
   */
  isOlderThan(other: CRDT<TState, TOperation>): boolean {
    return this.vectorClock.isBefore(other.getVectorClock());
  }

  /**
   * 同時発生（concurrent）の判定
   */
  isConcurrentWith(other: CRDT<TState, TOperation>): boolean {
    return this.vectorClock.isConcurrent(other.getVectorClock());
  }

  /**
   * 状態をJSON形式でシリアライズ（抽象メソッド）
   */
  abstract serialize(): string;

  /**
   * JSON形式から状態を復元（抽象メソッド）
   */
  abstract deserialize(data: string): void;

  /**
   * ディープコピー（抽象メソッド）
   */
  abstract clone(): CRDT<TState, TOperation>;

  /**
   * デバッグ情報を取得
   */
  getDebugInfo() {
    return {
      type: this.type,
      id: this.id,
      nodeId: this.nodeId,
      vectorClock: this.vectorClock.getClock(),
      lastModified: this.lastModified,
      state: this.getState()
    };
  }

  /**
   * 操作履歴の記録用データ生成
   */
  protected createOperationRecord(operationType: string, operationData: any) {
    return {
      id: nanoid(),
      node_id: this.nodeId,
      crdt_type: this.type,
      crdt_id: this.id,
      operation_type: operationType,
      operation_data: JSON.stringify(operationData),
      vector_clock: this.vectorClock.serialize(),
      timestamp: new Date().toISOString(),
      applied: false
    };
  }

  /**
   * 状態変更の記録用データ生成
   */
  protected createStateSnapshot() {
    return {
      id: nanoid(),
      node_id: this.nodeId,
      crdt_type: this.type,
      crdt_id: this.id,
      state: this.serialize(),
      vector_clock: this.vectorClock.serialize(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * 可視化用のデータ生成
   */
  getVisualizationData() {
    return {
      id: this.id,
      type: this.type,
      nodeId: this.nodeId,
      vectorClock: this.vectorClock.getClock(),
      state: this.getState(),
      lastModified: this.lastModified,
      causalityLevel: this.vectorClock.generateVisualizationData().causalityLevel
    };
  }

  /**
   * 検証：CRDTの不変条件をチェック
   */
  protected validate(): boolean {
    try {
      // 基本的な検証
      if (!this.id || !this.nodeId || !this.type) {
        console.error('CRDT基本情報が不正です', {
          id: this.id,
          nodeId: this.nodeId,
          type: this.type
        });
        return false;
      }

      // ベクタークロックの検証
      const clock = this.vectorClock.getClock();
      if (!(this.nodeId in clock) || clock[this.nodeId] < 0) {
        console.error('ベクタークロックが不正です', clock);
        return false;
      }

      return true;
    } catch (error) {
      console.error('CRDT検証エラー:', error);
      return false;
    }
  }

  /**
   * ログ出力用の識別子
   */
  protected getLogId(): string {
    return `[${this.nodeId}:${this.type}:${this.id}]`;
  }

  /**
   * 操作前の共通処理
   */
  protected beforeOperation(operationType: string, data?: any) {
    console.log(`🔄 ${this.getLogId()} 操作開始: ${operationType}`, data);

    if (!this.validate()) {
      throw new Error(`CRDT状態が不正です: ${this.getLogId()}`);
    }
  }

  /**
   * 操作後の共通処理
   */
  protected afterOperation(operationType: string, success: boolean = true) {
    if (success) {
      this.incrementClock();
      console.log(`✅ ${this.getLogId()} 操作完了: ${operationType}`, {
        vectorClock: this.vectorClock.getClock(),
        state: this.getState()
      });
    } else {
      console.error(`❌ ${this.getLogId()} 操作失敗: ${operationType}`);
    }
  }
}

/**
 * CRDT操作の結果を表す型
 */
export interface CRDTOperationResult<T = any> {
  success: boolean;
  error?: string;
  oldState?: T;
  newState?: T;
  vectorClock?: VectorClock;
}

/**
 * CRDTファクトリー
 */
export abstract class CRDTFactory {
  /**
   * CRDTタイプから適切なインスタンスを作成
   */
  static create<T extends BaseCRDT>(
    type: CRDTType,
    id: string,
    nodeId: string,
    initialData?: any
  ): T {
    // 各CRDTの実装クラスをインポートして作成
    // 実装は各CRDTクラスで行う
    throw new Error(`未実装のCRDTタイプ: ${type}`);
  }
}
