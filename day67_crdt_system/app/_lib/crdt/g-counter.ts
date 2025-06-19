import { CRDT, GCounterState, VectorClock } from '@/lib/types';
import { BaseCRDT, CRDTOperationResult } from './base-crdt';

/**
 * G-Counter操作の型定義
 */
export interface GCounterOperation {
  type: 'increment';
  amount: number;
  nodeId: string;
  timestamp: number;
}

/**
 * G-Counter - 増加専用分散カウンター
 *
 * 特徴:
 * - 各ノードが独自のカウンターを持つ
 * - 増加操作のみ可能（減少不可）
 * - 全ノードの合計値が最終値
 * - 競合が発生しない（Conflict-free）
 */
export class GCounter extends BaseCRDT<GCounterState, GCounterOperation> {
  private counters: { [nodeId: string]: number };

  constructor(id: string, nodeId: string, initialClock?: VectorClock) {
    super('g_counter', id, nodeId, initialClock);
    this.counters = {};

    // 自ノードのカウンターを初期化
    this.counters[nodeId] = 0;

    console.log(`🔢 G-Counter初期化完了: ${this.getLogId()}`);
  }

  /**
   * 現在の状態を取得
   */
  getState(): GCounterState {
    return {
      counters: { ...this.counters }
    };
  }

  /**
   * 現在の合計値を取得
   */
  getValue(): number {
    return Object.values(this.counters).reduce((sum, count) => sum + count, 0);
  }

  /**
   * カウンターを増加
   */
  increment(amount: number = 1): CRDTOperationResult<number> {
    try {
      this.beforeOperation('increment', { amount });

      if (amount <= 0) {
        throw new Error('G-Counterは正の値のみ増加可能です');
      }

      const oldValue = this.getValue();

      // 自ノードのカウンターを増加
      this.counters[this.nodeId] = (this.counters[this.nodeId] || 0) + amount;

      const newValue = this.getValue();

      this.afterOperation('increment', true);

      return {
        success: true,
        oldState: oldValue,
        newState: newValue,
        vectorClock: this.getVectorClock()
      };

    } catch (error) {
      this.afterOperation('increment', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * 操作を適用
   */
  applyOperation(operation: GCounterOperation): void {
    try {
      this.beforeOperation('applyOperation', operation);

      if (operation.type !== 'increment') {
        throw new Error(`不正な操作タイプ: ${operation.type}`);
      }

      if (operation.amount <= 0) {
        throw new Error('増加量は正の値である必要があります');
      }

      // 操作元ノードのカウンターを更新
      const currentValue = this.counters[operation.nodeId] || 0;
      this.counters[operation.nodeId] = Math.max(currentValue, currentValue + operation.amount);

      this.afterOperation('applyOperation', true);

    } catch (error) {
      this.afterOperation('applyOperation', false);
      throw error;
    }
  }

  /**
   * 他のG-Counterとマージ
   */
  merge(other: CRDT<GCounterState, GCounterOperation>): void {
    try {
      if (other.type !== 'g_counter') {
        throw new Error(`互換性のない CRDT タイプ: ${other.type}`);
      }

      this.beforeOperation('merge', { otherId: other.id });

      const otherState = other.getState();

      // 各ノードのカウンターの最大値を取る
      for (const nodeId in otherState.counters) {
        this.counters[nodeId] = Math.max(
          this.counters[nodeId] || 0,
          otherState.counters[nodeId] || 0
        );
      }

      // ベクタークロックを同期
      this.syncClock(other.getVectorClock());

      this.afterOperation('merge', true);

    } catch (error) {
      this.afterOperation('merge', false);
      throw error;
    }
  }

  /**
   * 状態の比較
   */
  equals(other: CRDT<GCounterState, GCounterOperation>): boolean {
    if (other.type !== 'g_counter') {
      return false;
    }

    const otherState = other.getState();
    const allNodes = new Set([
      ...Object.keys(this.counters),
      ...Object.keys(otherState.counters)
    ]);

    for (const nodeId of allNodes) {
      if ((this.counters[nodeId] || 0) !== (otherState.counters[nodeId] || 0)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 状態をシリアライズ
   */
  serialize(): string {
    return JSON.stringify({
      type: this.type,
      id: this.id,
      nodeId: this.nodeId,
      counters: this.counters,
      vectorClock: this.getVectorClock(),
      lastModified: this.lastModified
    });
  }

  /**
   * 状態をデシリアライズ
   */
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);

      if (parsed.type !== 'g_counter') {
        throw new Error(`不正なCRDTタイプ: ${parsed.type}`);
      }

      this.counters = parsed.counters || {};
      this.lastModified = parsed.lastModified || Date.now();

      // ベクタークロックを復元
      if (parsed.vectorClock) {
        this.syncClock(parsed.vectorClock);
      }

      console.log(`📥 ${this.getLogId()} デシリアライズ完了`, this.counters);

    } catch (error) {
      console.error(`❌ ${this.getLogId()} デシリアライズ失敗:`, error);
      throw error;
    }
  }

  /**
   * クローンを作成
   */
  clone(): GCounter {
    const cloned = new GCounter(this.id, this.nodeId, this.getVectorClock());
    cloned.counters = { ...this.counters };
    cloned.lastModified = this.lastModified;
    return cloned;
  }

  /**
   * 各ノードの詳細情報を取得
   */
  getNodeDetails(): Array<{ nodeId: string; count: number; percentage: number }> {
    const total = this.getValue();

    return Object.entries(this.counters).map(([nodeId, count]) => ({
      nodeId,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));
  }

  /**
   * 可視化用の詳細データ
   */
  getVisualizationData() {
    const baseData = super.getVisualizationData();

    return {
      ...baseData,
      totalValue: this.getValue(),
      nodeDetails: this.getNodeDetails(),
      operationType: 'increment-only',
      conflictPossible: false
    };
  }

  /**
   * デバッグ用の詳細情報
   */
  getDebugInfo() {
    const baseInfo = super.getDebugInfo();

    return {
      ...baseInfo,
      totalValue: this.getValue(),
      nodeCounters: this.counters,
      nodeDetails: this.getNodeDetails()
    };
  }

  /**
   * 操作履歴用のレコード作成
   */
  createIncrementRecord(amount: number) {
    return this.createOperationRecord('increment', {
      amount,
      nodeId: this.nodeId,
      newValue: this.getValue()
    });
  }
}

/**
 * G-Counter ユーティリティ関数
 */
export class GCounterUtils {
  /**
   * 複数のG-Counterをマージ
   */
  static mergeMultiple(counters: GCounter[]): GCounter {
    if (counters.length === 0) {
      throw new Error('マージするカウンターが指定されていません');
    }

    const result = counters[0].clone();

    for (let i = 1; i < counters.length; i++) {
      result.merge(counters[i]);
    }

    return result;
  }

  /**
   * G-Counterの状態から統計情報を計算
   */
  static getStatistics(counter: GCounter) {
    const nodeDetails = counter.getNodeDetails();
    const total = counter.getValue();

    return {
      totalValue: total,
      nodeCount: nodeDetails.length,
      averagePerNode: nodeDetails.length > 0 ? total / nodeDetails.length : 0,
      maxNodeValue: Math.max(...nodeDetails.map(n => n.count), 0),
      minNodeValue: Math.min(...nodeDetails.map(n => n.count), 0),
      nodeDistribution: nodeDetails
    };
  }

  /**
   * G-Counterの整合性チェック
   */
  static validate(counter: GCounter): boolean {
    try {
      const state = counter.getState();

      // 全てのカウンターが非負値かチェック
      for (const count of Object.values(state.counters)) {
        if (count < 0) {
          console.error('負の値が検出されました:', count);
          return false;
        }
      }

      // 自ノードのカウンターが存在するかチェック
      if (!(counter.nodeId in state.counters)) {
        console.error('自ノードのカウンターが存在しません');
        return false;
      }

      return true;
    } catch (error) {
      console.error('G-Counter検証エラー:', error);
      return false;
    }
  }
}
