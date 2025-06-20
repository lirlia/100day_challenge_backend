import { CRDT, GSetState, VectorClock } from '@/lib/types';
import { BaseCRDT, CRDTOperationResult } from './base-crdt';

/**
 * G-Set操作の型定義
 */
export interface GSetOperation<T = any> {
  type: 'add';
  element: T;
  nodeId: string;
  timestamp: number;
}

/**
 * G-Set - 追加専用分散セット
 *
 * 特徴:
 * - 要素の追加のみ可能（削除不可）
 * - 冪等性により同じ要素の重複追加は無視
 * - 全ノードの要素の和集合が最終セット
 * - 競合が発生しない（Conflict-free）
 */
export class GSet<T = any> extends BaseCRDT<GSetState<T>, GSetOperation<T>> {
  private elements: Set<T>;

  constructor(id: string, nodeId: string, initialClock?: VectorClock) {
    super('g_set', id, nodeId, initialClock);
    this.elements = new Set<T>();

    console.log(`📋 G-Set初期化完了: ${this.getLogId()}`);
  }

  /**
   * 現在の状態を取得
   */
  getState(): GSetState<T> {
    return {
      elements: new Set(this.elements)
    };
  }

  /**
   * 要素を追加
   */
  add(element: T): CRDTOperationResult<Set<T>> {
    try {
      this.beforeOperation('add', { element });

      const oldSize = this.elements.size;
      const oldElements = new Set(this.elements);

      // 要素を追加（Setなので自動的に重複は無視される）
      this.elements.add(element);

      const newElements = new Set(this.elements);

      this.afterOperation('add', true);

      return {
        success: true,
        oldState: oldElements,
        newState: newElements,
        vectorClock: this.getVectorClock()
      };

    } catch (error) {
      this.afterOperation('add', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * 複数要素を一括追加
   */
  addAll(elements: T[]): CRDTOperationResult<Set<T>> {
    try {
      this.beforeOperation('addAll', { elements });

      const oldElements = new Set(this.elements);

      // 全要素を追加
      elements.forEach(element => this.elements.add(element));

      const newElements = new Set(this.elements);

      this.afterOperation('addAll', true);

      return {
        success: true,
        oldState: oldElements,
        newState: newElements,
        vectorClock: this.getVectorClock()
      };

    } catch (error) {
      this.afterOperation('addAll', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * 操作を適用
   */
  applyOperation(operation: GSetOperation<T>): void {
    try {
      this.beforeOperation('applyOperation', operation);

      if (operation.type !== 'add') {
        throw new Error(`不正な操作タイプ: ${operation.type}`);
      }

      // 要素を追加
      this.elements.add(operation.element);

      this.afterOperation('applyOperation', true);

    } catch (error) {
      this.afterOperation('applyOperation', false);
      throw error;
    }
  }

  /**
   * 他のG-Setとマージ
   */
  merge(other: CRDT<GSetState<T>, GSetOperation<T>>): void {
    try {
      if (other.type !== 'g_set') {
        throw new Error(`互換性のない CRDT タイプ: ${other.type}`);
      }

      this.beforeOperation('merge', { otherId: other.id });

      const otherState = other.getState();

      // 要素をマージ（和集合）
      for (const element of otherState.elements) {
        this.elements.add(element);
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
   * 要素の存在確認
   */
  has(element: T): boolean {
    return this.elements.has(element);
  }

  /**
   * セットのサイズを取得
   */
  size(): number {
    return this.elements.size;
  }

  /**
   * 空かどうか確認
   */
  isEmpty(): boolean {
    return this.elements.size === 0;
  }

  /**
   * すべての要素を配列として取得
   */
  toArray(): T[] {
    return Array.from(this.elements);
  }

  /**
   * セットのイテレータを取得
   */
  values(): IterableIterator<T> {
    return this.elements.values();
  }

  /**
   * 状態の比較
   */
  equals(other: CRDT<GSetState<T>, GSetOperation<T>>): boolean {
    if (other.type !== 'g_set') {
      return false;
    }

    const otherState = other.getState();

    if (this.elements.size !== otherState.elements.size) {
      return false;
    }

    for (const element of this.elements) {
      if (!otherState.elements.has(element)) {
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
      elements: Array.from(this.elements),
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

      if (parsed.type !== 'g_set') {
        throw new Error(`不正なCRDTタイプ: ${parsed.type}`);
      }

      this.elements = new Set(parsed.elements || []);
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
  clone(): GSet<T> {
    const cloned = new GSet<T>(this.id, this.nodeId, this.getVectorClock());
    cloned.elements = new Set(this.elements);
    cloned.lastModified = this.lastModified;
    return cloned;
  }

  /**
   * セットの詳細情報を取得
   */
  getElementDetails(): Array<{ element: T; type: string }> {
    return Array.from(this.elements).map(element => ({
      element,
      type: typeof element
    }));
  }

  /**
   * 可視化用データを生成
   */
  getVisualizationData() {
    const elementDetails = this.getElementDetails();
    const typeDistribution = elementDetails.reduce((acc, { type }) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      id: this.id,
      type: this.type,
      nodeId: this.nodeId,
      vectorClock: this.getVectorClock(),
      state: this.getState(),
      lastModified: this.lastModified,
      causalityLevel: Object.keys(this.getVectorClock()).length,
      // 追加のG-Set固有データ
      size: this.size(),
      elements: this.toArray(),
      typeDistribution,
      isEmpty: this.isEmpty()
    };
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo() {
    return {
      ...super.getDebugInfo(),
      size: this.size(),
      elements: this.toArray(),
      isEmpty: this.isEmpty()
    };
  }

  /**
   * セットの内容を文字列として表現
   */
  toString(): string {
    const elements = this.toArray();
    if (elements.length === 0) {
      return '{}';
    }
    return `{${elements.map(e => JSON.stringify(e)).join(', ')}}`;
  }
}

/**
 * G-Set のユーティリティクラス
 */
export class GSetUtils {
  /**
   * 複数のG-Setをマージ
   */
  static mergeMultiple<T>(sets: GSet<T>[]): GSet<T> {
    if (sets.length === 0) {
      throw new Error('マージするセットが指定されていません');
    }

    const [first, ...rest] = sets;
    const merged = first.clone();

    rest.forEach(set => merged.merge(set));

    return merged;
  }

  /**
   * G-Set の統計情報を取得
   */
  static getStatistics<T>(set: GSet<T>) {
    const elements = set.toArray();
    const typeDistribution = elements.reduce((acc, element) => {
      const type = typeof element;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalElements: set.size(),
      isEmpty: set.isEmpty(),
      typeDistribution,
      memoryEstimate: JSON.stringify(elements).length
    };
  }

  /**
   * G-Set の妥当性をチェック
   */
  static validate<T>(set: GSet<T>): boolean {
    try {
      // 基本的な整合性チェック
      const elements = set.toArray();
      const uniqueElements = new Set(elements);

      return elements.length === uniqueElements.size;
    } catch {
      return false;
    }
  }
}
