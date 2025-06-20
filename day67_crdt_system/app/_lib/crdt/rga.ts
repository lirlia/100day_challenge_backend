/**
 * RGA (Replicated Growable Array) CRDT実装
 *
 * RGAは文字列や配列の協調編集のためのCRDT。
 * 各要素は一意のIDを持ち、因果順序を維持しながらマージが可能。
 * Google Docsなどの協調テキストエディタで使用される技術。
 */

import { BaseCRDT } from './base-crdt';
import type { VectorClock, CRDTOperation, RGAState, RGAElement, CRDT } from '../../../lib/types';
import { nanoid } from 'nanoid';

interface RGAInsertOperation {
  type: 'insert';
  elementId: string;
  value: string;
  previousElementId: string | null;  // null = 先頭に挿入
}

interface RGADeleteOperation {
  type: 'delete';
  elementId: string;
}

type RGAOperationValue = RGAInsertOperation | RGADeleteOperation;

export class RGA extends BaseCRDT<RGAState, CRDTOperation> {
  private elements: Map<string, RGAElement> = new Map();
  private order: string[] = [];

  constructor(nodeId: string, crdtId: string) {
    super('rga', crdtId, nodeId);
  }

  /**
   * 指定位置に文字を挿入
   */
  insert(position: number, value: string): CRDTOperation {
    const elementId = nanoid();
    const vectorClock = this.incrementClock();

    // 挿入位置の前の要素IDを取得
    const previousElementId = position > 0 ? this.order[position - 1] : null;

    const operation: CRDTOperation = {
      id: nanoid(),
      type: 'rga',
      nodeId: this.nodeId,
      crdtId: this.id,
      vectorClock,
      value: {
        type: 'insert',
        elementId,
        value,
        previousElementId
      } as RGAInsertOperation,
      timestamp: Date.now()
    };

    this.applyOperation(operation);
    return operation;
  }

  /**
   * 指定位置の文字を削除
   */
  delete(position: number): CRDTOperation | null {
    if (position < 0 || position >= this.order.length) {
      return null;
    }

    const elementId = this.order[position];
    const vectorClock = this.incrementClock();

    const operation: CRDTOperation = {
      id: nanoid(),
      type: 'rga',
      nodeId: this.nodeId,
      crdtId: this.id,
      vectorClock,
      value: {
        type: 'delete',
        elementId
      } as RGADeleteOperation,
      timestamp: Date.now()
    };

    this.applyOperation(operation);
    return operation;
  }

  /**
   * 操作を適用
   */
  applyOperation(operation: CRDTOperation): void {
    const op = operation.value as RGAOperationValue;

    switch (op.type) {
      case 'insert':
        this.applyInsert(op);
        break;
      case 'delete':
        this.applyDelete(op);
        break;
    }

    this.rebuildOrder();
  }

  /**
   * 挿入操作を適用
   */
  private applyInsert(op: RGAInsertOperation): void {
    const element: RGAElement = {
      id: op.elementId,
      value: op.value,
      isDeleted: false,
      previousElementId: op.previousElementId
    };

    this.elements.set(op.elementId, element);
  }

  /**
   * 削除操作を適用
   */
  private applyDelete(op: RGADeleteOperation): void {
    const element = this.elements.get(op.elementId);
    if (element) {
      element.isDeleted = true;
    }
  }

  /**
   * 要素の順序を再構築
   */
  private rebuildOrder(): void {
    this.order = [];
    const visited = new Set<string>();

    // 先頭要素（previousElementId が null）から開始
    const buildFromElement = (elementId: string | null) => {
      if (elementId && visited.has(elementId)) return;

      for (const [id, element] of this.elements) {
        if (element.previousElementId === elementId && !visited.has(id)) {
          visited.add(id);
          this.order.push(id);
          buildFromElement(id);
        }
      }
    };

    buildFromElement(null);
  }

  /**
   * 他のRGAとマージ
   */
  merge(other: CRDT<RGAState, CRDTOperation>): void {
    if (!(other instanceof RGA)) {
      throw new Error('Can only merge with another RGA');
    }

    // 他のRGAの全要素を統合
    for (const [elementId, element] of other.elements) {
      const existing = this.elements.get(elementId);
      if (!existing) {
        this.elements.set(elementId, { ...element });
      } else {
        // 削除状態は OR で統合（一度削除されたら削除状態を維持）
        existing.isDeleted = existing.isDeleted || element.isDeleted;
      }
    }

    // ベクタークロックをマージ
    this.syncClock(other.getVectorClock());

    // 順序を再構築
    this.rebuildOrder();
  }

  /**
   * 状態の比較
   */
  equals(other: CRDT<RGAState, CRDTOperation>): boolean {
    if (!(other instanceof RGA)) {
      return false;
    }

    // 文字列内容で比較
    return this.toString() === other.toString();
  }

  /**
   * 現在の文字列を取得（削除された文字は除く）
   */
  toString(): string {
    return this.order
      .map(id => this.elements.get(id))
      .filter(element => element && !element.isDeleted)
      .map(element => element!.value)
      .join('');
  }

  /**
   * 現在の状態を取得
   */
  getState(): RGAState {
    return {
      elements: Object.fromEntries(this.elements),
      order: [...this.order],
      text: this.toString()
    };
  }

  /**
   * 状態から復元
   */
  fromState(state: RGAState): void {
    this.elements.clear();
    for (const [id, element] of Object.entries(state.elements)) {
      this.elements.set(id, element);
    }
    this.order = [...state.order];
  }

  /**
   * シリアライズ
   */
  serialize(): string {
    return JSON.stringify(this.getState());
  }

  /**
   * デシリアライズ
   */
  deserialize(data: string): void {
    const state = JSON.parse(data) as RGAState;
    this.fromState(state);
  }

  /**
   * クローン
   */
  clone(): RGA {
    const cloned = new RGA(this.nodeId, this.id);
    cloned.fromState(this.getState());
    return cloned;
  }

  /**
   * RGA固有の可視化データを生成
   */
  getRGAVisualizationData() {
    const text = this.toString();
    const totalElements = this.elements.size;
    const activeElements = this.order.filter(id => {
      const element = this.elements.get(id);
      return element && !element.isDeleted;
    }).length;

    return {
      ...super.getVisualizationData(),
      text,
      totalElements,
      activeElements,
      deletedElements: totalElements - activeElements,
      order: [...this.order],
      elements: Object.fromEntries(this.elements)
    };
  }

  /**
   * RGA固有のデバッグ情報を取得
   */
  getRGADebugInfo() {
    return {
      ...super.getDebugInfo(),
      text: this.toString(),
      totalElements: this.elements.size,
      activeElements: this.order.filter(id => {
        const element = this.elements.get(id);
        return element && !element.isDeleted;
      }).length,
      elements: Object.fromEntries(this.elements),
      order: [...this.order]
    };
  }
}
