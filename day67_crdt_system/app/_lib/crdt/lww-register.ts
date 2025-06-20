import { CRDT, LWWRegisterState, VectorClock } from '@/lib/types';
import { BaseCRDT, CRDTOperationResult } from './base-crdt';

/**
 * LWW-Register操作の型定義
 */
export interface LWWRegisterOperation<T = any> {
  type: 'assign';
  value: T;
  timestamp: number;
  nodeId: string;
}

/**
 * LWW-Register - 最後書き込み勝利レジスタ (Last-Writer-Wins Register)
 *
 * 特徴:
 * - 単一の値を格納する分散レジスタ
 * - タイムスタンプベースの競合解決
 * - 最新のタイムスタンプを持つ値が勝利
 * - タイムスタンプが同じ場合はノードIDで決定論的に解決
 */
export class LWWRegister<T = any> extends BaseCRDT<LWWRegisterState<T>, LWWRegisterOperation<T>> {
  private value: T;
  private timestamp: number;
  private writerNodeId: string;

  constructor(id: string, nodeId: string, initialValue?: T, initialClock?: VectorClock) {
    super('lww_register', id, nodeId, initialClock);
    this.value = initialValue as T;
    this.timestamp = 0;
    this.writerNodeId = nodeId;

    console.log(`📝 LWW-Register初期化完了: ${this.getLogId()}`);
  }

  /**
   * 現在の状態を取得
   */
  getState(): LWWRegisterState<T> {
    return {
      value: this.value,
      timestamp: this.timestamp,
      node_id: this.writerNodeId
    };
  }

  /**
   * 値を設定
   */
  assign(value: T): CRDTOperationResult<T> {
    try {
      this.beforeOperation('assign', { value });

      const oldValue = this.value;
      const timestamp = Date.now();

      // 新しい値を設定
      this.value = value;
      this.timestamp = timestamp;
      this.writerNodeId = this.nodeId;

      this.afterOperation('assign', true);

      return {
        success: true,
        oldState: oldValue,
        newState: this.value,
        vectorClock: this.getVectorClock()
      };

    } catch (error) {
      this.afterOperation('assign', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * 操作を適用
   */
  applyOperation(operation: LWWRegisterOperation<T>): void {
    try {
      this.beforeOperation('applyOperation', operation);

      if (operation.type !== 'assign') {
        throw new Error(`不正な操作タイプ: ${operation.type}`);
      }

      // タイムスタンプで競合解決
      if (this.shouldAcceptOperation(operation)) {
        this.value = operation.value;
        this.timestamp = operation.timestamp;
        this.writerNodeId = operation.nodeId;
      }

      this.afterOperation('applyOperation', true);

    } catch (error) {
      this.afterOperation('applyOperation', false);
      throw error;
    }
  }

  /**
   * 操作を受け入れるかどうか判定
   */
  private shouldAcceptOperation(operation: LWWRegisterOperation<T>): boolean {
    // より新しいタイムスタンプは常に勝利
    if (operation.timestamp > this.timestamp) {
      return true;
    }

    // 同じタイムスタンプの場合はノードIDで決定論的に解決
    if (operation.timestamp === this.timestamp) {
      return operation.nodeId > this.writerNodeId;
    }

    // より古いタイムスタンプは拒否
    return false;
  }

  /**
   * 他のLWW-Registerとマージ
   */
  merge(other: CRDT<LWWRegisterState<T>, LWWRegisterOperation<T>>): void {
    try {
      if (other.type !== 'lww_register') {
        throw new Error(`互換性のない CRDT タイプ: ${other.type}`);
      }

      this.beforeOperation('merge', { otherId: other.id });

      const otherState = other.getState();

      // 他の状態を操作として適用
      const operation: LWWRegisterOperation<T> = {
        type: 'assign',
        value: otherState.value,
        timestamp: otherState.timestamp,
        nodeId: otherState.node_id
      };

      if (this.shouldAcceptOperation(operation)) {
        this.value = operation.value;
        this.timestamp = operation.timestamp;
        this.writerNodeId = operation.nodeId;
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
   * 現在の値を取得
   */
  getValue(): T {
    return this.value;
  }

  /**
   * 最後の書き込み時刻を取得
   */
  getLastWriteTime(): number {
    return this.timestamp;
  }

  /**
   * 最後の書き込み者を取得
   */
  getLastWriter(): string {
    return this.writerNodeId;
  }

  /**
   * 値が設定されているかチェック
   */
  hasValue(): boolean {
    return this.value !== undefined && this.value !== null;
  }

  /**
   * 状態の比較
   */
  equals(other: CRDT<LWWRegisterState<T>, LWWRegisterOperation<T>>): boolean {
    if (other.type !== 'lww_register') {
      return false;
    }

    const otherState = other.getState();

    return (
      JSON.stringify(this.value) === JSON.stringify(otherState.value) &&
      this.timestamp === otherState.timestamp &&
      this.writerNodeId === otherState.node_id
    );
  }

  /**
   * 状態をシリアライズ
   */
  serialize(): string {
    return JSON.stringify({
      type: this.type,
      id: this.id,
      nodeId: this.nodeId,
      value: this.value,
      timestamp: this.timestamp,
      writerNodeId: this.writerNodeId,
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

      if (parsed.type !== 'lww_register') {
        throw new Error(`不正なCRDTタイプ: ${parsed.type}`);
      }

      this.value = parsed.value;
      this.timestamp = parsed.timestamp || 0;
      this.writerNodeId = parsed.writerNodeId || this.nodeId;
      this.lastModified = parsed.lastModified || Date.now();

      // ベクタークロックを復元
      if (parsed.vectorClock) {
        this.syncClock(parsed.vectorClock);
      }

    } catch (error) {
      throw new Error(`デシリアライズに失敗: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }

  /**
   * ディープコピーを作成
   */
  clone(): LWWRegister<T> {
    const cloned = new LWWRegister<T>(this.id, this.nodeId, this.value, this.getVectorClock());
    cloned.timestamp = this.timestamp;
    cloned.writerNodeId = this.writerNodeId;
    cloned.lastModified = this.lastModified;
    return cloned;
  }

  /**
   * レジスタの詳細情報を取得
   */
  getRegisterDetails() {
    return {
      value: this.value,
      timestamp: this.timestamp,
      lastWriter: this.writerNodeId,
      age: Date.now() - this.timestamp,
      hasValue: this.hasValue(),
      valueType: typeof this.value,
      valueSize: JSON.stringify(this.value).length
    };
  }

  /**
   * 可視化用データを生成
   */
  getVisualizationData() {
    const details = this.getRegisterDetails();

    return {
      id: this.id,
      type: this.type,
      nodeId: this.nodeId,
      vectorClock: this.getVectorClock(),
      state: this.getState(),
      lastModified: this.lastModified,
      causalityLevel: Object.keys(this.getVectorClock()).length,
      // 追加のLWW-Register固有データ
      value: this.value,
      details,
      timeline: [{
        timestamp: this.timestamp,
        writer: this.writerNodeId,
        value: this.value,
        age: details.age
      }]
    };
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      value: this.value,
      timestamp: this.timestamp,
      lastWriter: this.writerNodeId,
      hasValue: this.hasValue(),
      age: Date.now() - this.timestamp
    };
  }

  /**
   * 値を文字列として表現
   */
  toString(): string {
    if (!this.hasValue()) {
      return '(未設定)';
    }
    return `${JSON.stringify(this.value)} (by ${this.writerNodeId} at ${new Date(this.timestamp).toISOString()})`;
  }
}

/**
 * LWW-Register のユーティリティクラス
 */
export class LWWRegisterUtils {
  /**
   * 複数のLWW-Registerをマージ
   */
  static mergeMultiple<T>(registers: LWWRegister<T>[]): LWWRegister<T> {
    if (registers.length === 0) {
      throw new Error('マージするレジスタが指定されていません');
    }

    const [first, ...rest] = registers;
    const merged = first.clone();

    rest.forEach(register => merged.merge(register));

    return merged;
  }

  /**
   * LWW-Register の統計情報を取得
   */
  static getStatistics<T>(register: LWWRegister<T>) {
    const details = register.getRegisterDetails();

    return {
      hasValue: details.hasValue,
      valueType: details.valueType,
      valueSize: details.valueSize,
      lastWriter: details.lastWriter,
      age: details.age,
      timestamp: details.timestamp,
      isRecent: details.age < 60000 // 1分以内
    };
  }

  /**
   * タイムスタンプの競合解決ルールを検証
   */
  static validateConflictResolution<T>(
    operation1: LWWRegisterOperation<T>,
    operation2: LWWRegisterOperation<T>
  ): LWWRegisterOperation<T> {
    // より新しいタイムスタンプが勝利
    if (operation1.timestamp > operation2.timestamp) {
      return operation1;
    }
    if (operation2.timestamp > operation1.timestamp) {
      return operation2;
    }

    // 同じタイムスタンプの場合はノードIDで決定
    return operation1.nodeId > operation2.nodeId ? operation1 : operation2;
  }

  /**
   * LWW-Register の妥当性をチェック
   */
  static validate<T>(register: LWWRegister<T>): boolean {
    try {
      // 基本的な整合性チェック
      const state = register.getState();
      return (
        state.timestamp >= 0 &&
        state.node_id.length > 0 &&
        typeof state.value !== 'undefined'
      );
    } catch {
      return false;
    }
  }
}
