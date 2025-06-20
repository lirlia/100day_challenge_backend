import { CRDT, ORSetState, VectorClock } from '@/lib/types';
import { BaseCRDT, CRDTOperationResult } from './base-crdt';

/**
 * OR-Set操作の型定義
 */
export interface ORSetOperation<T = any> {
  type: 'add' | 'remove';
  element: T;
  tag: string; // 一意識別子（ノードID + タイムスタンプ）
  nodeId: string;
  timestamp: number;
}

/**
 * OR-Set - 削除可能分散セット (Observed-Removed Set)
 *
 * 特徴:
 * - 要素の追加と削除が可能
 * - 各要素に一意のタグを付与して追跡
 * - 要素は追加タグが削除タグより多い場合のみ存在
 * - 競合解決：削除が追加より優先（bias towards removal）
 */
export class ORSet<T = any> extends BaseCRDT<ORSetState<T>, ORSetOperation<T>> {
  private addedTags: Map<string, Set<string>>; // element -> set of add tags
  private removedTags: Map<string, Set<string>>; // element -> set of remove tags

  constructor(id: string, nodeId: string, initialClock?: VectorClock) {
    super('or_set', id, nodeId, initialClock);
    this.addedTags = new Map();
    this.removedTags = new Map();

    console.log(`🔄 OR-Set初期化完了: ${this.getLogId()}`);
  }

  /**
   * 現在の状態を取得
   */
  getState(): ORSetState<T> {
    const elements: { [element: string]: Set<string> } = {};
    const removed: { [element: string]: Set<string> } = {};

    // addedTagsを変換
    for (const [element, tags] of this.addedTags) {
      elements[element] = new Set(tags);
    }

    // removedTagsを変換
    for (const [element, tags] of this.removedTags) {
      removed[element] = new Set(tags);
    }

    return { elements, removed };
  }

  /**
   * 要素を追加
   */
  add(element: T): CRDTOperationResult<Set<T>> {
    try {
      this.beforeOperation('add', { element });

      const oldElements = this.getElements();
      const tag = this.generateUniqueTag();
      const elementKey = JSON.stringify(element);

      // 追加タグを記録
      if (!this.addedTags.has(elementKey)) {
        this.addedTags.set(elementKey, new Set());
      }
      this.addedTags.get(elementKey)!.add(tag);

      const newElements = this.getElements();

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
   * 要素を削除
   */
  remove(element: T): CRDTOperationResult<Set<T>> {
    try {
      this.beforeOperation('remove', { element });

      const oldElements = this.getElements();
      const elementKey = JSON.stringify(element);

      // 要素が存在しない場合は何もしない
      if (!this.hasElement(element)) {
        return {
          success: true,
          oldState: oldElements,
          newState: oldElements,
          vectorClock: this.getVectorClock()
        };
      }

      // 現在の全ての追加タグを削除タグとして記録
      const addTags = this.addedTags.get(elementKey);
      if (addTags) {
        if (!this.removedTags.has(elementKey)) {
          this.removedTags.set(elementKey, new Set());
        }
        const removeTags = this.removedTags.get(elementKey)!;
        addTags.forEach(tag => removeTags.add(tag));
      }

      const newElements = this.getElements();

      this.afterOperation('remove', true);

      return {
        success: true,
        oldState: oldElements,
        newState: newElements,
        vectorClock: this.getVectorClock()
      };

    } catch (error) {
      this.afterOperation('remove', false);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラー'
      };
    }
  }

  /**
   * 操作を適用
   */
  applyOperation(operation: ORSetOperation<T>): void {
    try {
      this.beforeOperation('applyOperation', operation);

      const elementKey = JSON.stringify(operation.element);

      if (operation.type === 'add') {
        if (!this.addedTags.has(elementKey)) {
          this.addedTags.set(elementKey, new Set());
        }
        this.addedTags.get(elementKey)!.add(operation.tag);

      } else if (operation.type === 'remove') {
        if (!this.removedTags.has(elementKey)) {
          this.removedTags.set(elementKey, new Set());
        }
        this.removedTags.get(elementKey)!.add(operation.tag);
      }

      this.afterOperation('applyOperation', true);

    } catch (error) {
      this.afterOperation('applyOperation', false);
      throw error;
    }
  }

  /**
   * 他のOR-Setとマージ
   */
  merge(other: CRDT<ORSetState<T>, ORSetOperation<T>>): void {
    try {
      if (other.type !== 'or_set') {
        throw new Error(`互換性のない CRDT タイプ: ${other.type}`);
      }

      this.beforeOperation('merge', { otherId: other.id });

      const otherState = other.getState();

      // 追加タグをマージ
      for (const [element, tags] of Object.entries(otherState.elements)) {
        if (!this.addedTags.has(element)) {
          this.addedTags.set(element, new Set());
        }
        const myTags = this.addedTags.get(element)!;
        tags.forEach(tag => myTags.add(tag));
      }

      // 削除タグをマージ
      for (const [element, tags] of Object.entries(otherState.removed)) {
        if (!this.removedTags.has(element)) {
          this.removedTags.set(element, new Set());
        }
        const myRemovedTags = this.removedTags.get(element)!;
        tags.forEach(tag => myRemovedTags.add(tag));
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
    return this.hasElement(element);
  }

  /**
   * 要素の存在確認（内部実装）
   */
  private hasElement(element: T): boolean {
    const elementKey = JSON.stringify(element);
    const addTags = this.addedTags.get(elementKey) || new Set();
    const removeTags = this.removedTags.get(elementKey) || new Set();

    // 削除されていない追加タグがあるかチェック
    for (const addTag of addTags) {
      if (!removeTags.has(addTag)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 現在の要素セットを取得
   */
  getElements(): Set<T> {
    const elements = new Set<T>();

    for (const [elementKey, addTags] of this.addedTags) {
      const removeTags = this.removedTags.get(elementKey) || new Set();

      // 削除されていない追加タグがあるかチェック
      const hasUnremovedTag = Array.from(addTags).some(tag => !removeTags.has(tag));
      if (hasUnremovedTag) {
        try {
          const element = JSON.parse(elementKey);
          elements.add(element);
        } catch {
          // JSON解析エラーは無視
        }
      }
    }

    return elements;
  }

  /**
   * セットのサイズを取得
   */
  size(): number {
    return this.getElements().size;
  }

  /**
   * 空かどうか確認
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * すべての要素を配列として取得
   */
  toArray(): T[] {
    return Array.from(this.getElements());
  }

  /**
   * 一意タグを生成
   */
  private generateUniqueTag(): string {
    return `${this.nodeId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 状態の比較
   */
  equals(other: CRDT<ORSetState<T>, ORSetOperation<T>>): boolean {
    if (other.type !== 'or_set') {
      return false;
    }

    const myElements = this.getElements();
    const otherElements = (other as ORSet<T>).getElements();

    if (myElements.size !== otherElements.size) {
      return false;
    }

    for (const element of myElements) {
      if (!otherElements.has(element)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 状態をシリアライズ
   */
  serialize(): string {
    const addedTagsObj: { [key: string]: string[] } = {};
    const removedTagsObj: { [key: string]: string[] } = {};

    for (const [element, tags] of this.addedTags) {
      addedTagsObj[element] = Array.from(tags);
    }

    for (const [element, tags] of this.removedTags) {
      removedTagsObj[element] = Array.from(tags);
    }

    return JSON.stringify({
      type: this.type,
      id: this.id,
      nodeId: this.nodeId,
      addedTags: addedTagsObj,
      removedTags: removedTagsObj,
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

      if (parsed.type !== 'or_set') {
        throw new Error(`不正なCRDTタイプ: ${parsed.type}`);
      }

      // 追加タグを復元
      this.addedTags.clear();
      for (const [element, tags] of Object.entries(parsed.addedTags || {})) {
        this.addedTags.set(element, new Set(tags as string[]));
      }

      // 削除タグを復元
      this.removedTags.clear();
      for (const [element, tags] of Object.entries(parsed.removedTags || {})) {
        this.removedTags.set(element, new Set(tags as string[]));
      }

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
  clone(): ORSet<T> {
    const cloned = new ORSet<T>(this.id, this.nodeId, this.getVectorClock());

    // 追加タグをコピー
    for (const [element, tags] of this.addedTags) {
      cloned.addedTags.set(element, new Set(tags));
    }

    // 削除タグをコピー
    for (const [element, tags] of this.removedTags) {
      cloned.removedTags.set(element, new Set(tags));
    }

    cloned.lastModified = this.lastModified;
    return cloned;
  }

  /**
   * セットの詳細情報を取得
   */
  getElementDetails(): Array<{
    element: T;
    addTags: string[];
    removeTags: string[];
    isPresent: boolean;
  }> {
    const details: Array<{
      element: T;
      addTags: string[];
      removeTags: string[];
      isPresent: boolean;
    }> = [];

    const allElements = new Set([
      ...this.addedTags.keys(),
      ...this.removedTags.keys()
    ]);

    for (const elementKey of allElements) {
      try {
        const element = JSON.parse(elementKey);
        const addTags = Array.from(this.addedTags.get(elementKey) || []);
        const removeTags = Array.from(this.removedTags.get(elementKey) || []);
        const isPresent = this.hasElement(element);

        details.push({
          element,
          addTags,
          removeTags,
          isPresent
        });
      } catch {
        // JSON解析エラーは無視
      }
    }

    return details;
  }

  /**
   * 可視化用データを生成
   */
  getVisualizationData() {
    const elementDetails = this.getElementDetails();
    const stats = {
      totalElements: this.size(),
      totalAddTags: Array.from(this.addedTags.values()).reduce((sum, tags) => sum + tags.size, 0),
      totalRemoveTags: Array.from(this.removedTags.values()).reduce((sum, tags) => sum + tags.size, 0),
      removedElements: elementDetails.filter(d => !d.isPresent).length
    };

    return {
      id: this.id,
      type: this.type,
      nodeId: this.nodeId,
      vectorClock: this.getVectorClock(),
      state: this.getState(),
      lastModified: this.lastModified,
      causalityLevel: Object.keys(this.getVectorClock()).length,
      // 追加のOR-Set固有データ
      elements: this.toArray(),
      elementDetails,
      stats,
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
      addedTagsCount: this.addedTags.size,
      removedTagsCount: this.removedTags.size,
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
 * OR-Set のユーティリティクラス
 */
export class ORSetUtils {
  /**
   * 複数のOR-Setをマージ
   */
  static mergeMultiple<T>(sets: ORSet<T>[]): ORSet<T> {
    if (sets.length === 0) {
      throw new Error('マージするセットが指定されていません');
    }

    const [first, ...rest] = sets;
    const merged = first.clone();

    rest.forEach(set => merged.merge(set));

    return merged;
  }

  /**
   * OR-Set の統計情報を取得
   */
  static getStatistics<T>(set: ORSet<T>) {
    const elementDetails = set.getElementDetails();
    const activeElements = elementDetails.filter(d => d.isPresent);
    const removedElements = elementDetails.filter(d => !d.isPresent);

    return {
      totalElements: set.size(),
      activeElements: activeElements.length,
      removedElements: removedElements.length,
      totalAddTags: elementDetails.reduce((sum, d) => sum + d.addTags.length, 0),
      totalRemoveTags: elementDetails.reduce((sum, d) => sum + d.removeTags.length, 0),
      isEmpty: set.isEmpty(),
      memoryEstimate: JSON.stringify(set.toArray()).length
    };
  }

  /**
   * OR-Set の妥当性をチェック
   */
  static validate<T>(set: ORSet<T>): boolean {
    try {
      // 基本的な整合性チェック
      const elements = set.toArray();
      const uniqueElements = new Set(elements.map(e => JSON.stringify(e)));

      return elements.length === uniqueElements.size;
    } catch {
      return false;
    }
  }
}
