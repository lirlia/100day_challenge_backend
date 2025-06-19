import { BaseCRDT } from './base-crdt'
import { GCounter } from './g-counter'
import { VectorClockManager } from './vector-clock'
import type {
  CRDTOperation,
  PNCounterState,
  VisualizationData,
  VectorClock,
  CRDT
} from '../../../lib/types'

// PN-Counter固有の操作型
export interface PNCounterOperation {
  type: 'increment' | 'decrement'
  nodeId: string
  crdtId: string
  timestamp: number
  vectorClock: VectorClock
  data: { value: number }
}

/**
 * PN-Counter (Increment/Decrement Counter)
 *
 * 増加と減少の両方が可能な分散カウンター。
 * 2つのG-Counterを組み合わせて実装：
 * - P (Positive): 増加専用カウンター
 * - N (Negative): 減少専用カウンター
 * 最終的な値は P - N で計算される。
 *
 * 特徴:
 * - 増加・減少操作の両方をサポート
 * - 強い結果整合性
 * - ゼロ競合（conflict-free）
 * - 可換性（commutative）・結合性（associative）・冪等性（idempotent）
 */
export class PNCounter extends BaseCRDT<PNCounterState, PNCounterOperation> {
  private positiveCounter: GCounter
  private negativeCounter: GCounter
  private state: PNCounterState

  constructor(nodeId: string, crdtId: string, initialState?: PNCounterState) {
    super('pn_counter', crdtId, nodeId)

    this.positiveCounter = new GCounter(nodeId, `${crdtId}_positive`)
    this.negativeCounter = new GCounter(nodeId, `${crdtId}_negative`)

    // 初期状態設定
    if (initialState) {
      this.state = initialState
    } else {
      this.state = {
        positive: {},
        negative: {}
      }
    }
  }

  /**
   * 現在の状態を取得
   */
  getState(): PNCounterState {
    return {
      positive: this.positiveCounter.getState().counters,
      negative: this.negativeCounter.getState().counters
    }
  }

  /**
   * カウンターの現在値を取得
   */
  getValue(): number {
    return this.positiveCounter.getValue() - this.negativeCounter.getValue()
  }

  /**
   * カウンターを増加
   */
  increment(value: number = 1): void {
    if (value < 0) {
      throw new Error('Increment value must be non-negative')
    }

    this.positiveCounter.increment(value)
    this.incrementClock()
    this.state = this.getState()
  }

  /**
   * カウンターを減少
   */
  decrement(value: number = 1): void {
    if (value < 0) {
      throw new Error('Decrement value must be non-negative')
    }

    this.negativeCounter.increment(value)
    this.incrementClock()
    this.state = this.getState()
  }

  /**
   * 操作を適用
   */
  applyOperation(operation: PNCounterOperation): void {
    if (operation.type === 'increment') {
      this.positiveCounter.increment(operation.data.value)
    } else if (operation.type === 'decrement') {
      this.negativeCounter.increment(operation.data.value)
    }

    this.syncClock(operation.vectorClock)
    this.state = this.getState()
  }

  /**
   * 他のPN-Counterとの状態をマージ
   */
  merge(other: CRDT<PNCounterState, PNCounterOperation>): void {
    const otherState = other.getState()

    // 正の値をマージ
    for (const [nodeId, value] of Object.entries(otherState.positive)) {
      const currentValue = this.state.positive[nodeId] || 0
      if (value > currentValue) {
        this.state.positive[nodeId] = value
      }
    }

    // 負の値をマージ
    for (const [nodeId, value] of Object.entries(otherState.negative)) {
      const currentValue = this.state.negative[nodeId] || 0
      if (value > currentValue) {
        this.state.negative[nodeId] = value
      }
    }

    this.syncClock(other.getVectorClock())
  }

  /**
   * 状態の比較
   */
  equals(other: CRDT<PNCounterState, PNCounterOperation>): boolean {
    const otherState = other.getState()

    // 正のカウンターの比較
    const positiveKeys = new Set([...Object.keys(this.state.positive), ...Object.keys(otherState.positive)])
    for (const key of positiveKeys) {
      if ((this.state.positive[key] || 0) !== (otherState.positive[key] || 0)) {
        return false
      }
    }

    // 負のカウンターの比較
    const negativeKeys = new Set([...Object.keys(this.state.negative), ...Object.keys(otherState.negative)])
    for (const key of negativeKeys) {
      if ((this.state.negative[key] || 0) !== (otherState.negative[key] || 0)) {
        return false
      }
    }

    return true
  }

  /**
   * 状態のシリアライゼーション
   */
  serialize(): string {
    return JSON.stringify({
      nodeId: this.nodeId,
      crdtId: this.id,
      type: this.type,
      state: this.getState(),
      vectorClock: this.getVectorClock()
    })
  }

  /**
   * 状態のデシリアライゼーション
   */
  deserialize(data: string): void {
    const parsed = JSON.parse(data)
    this.state = parsed.state
    this.vectorClock = new VectorClockManager(this.nodeId, parsed.vectorClock)
  }

  /**
   * ディープコピー
   */
  clone(): CRDT<PNCounterState, PNCounterOperation> {
    const cloned = new PNCounter(this.nodeId, this.id, this.getState())
    cloned.vectorClock = new VectorClockManager(this.nodeId, this.getVectorClock())
    return cloned
  }

  /**
   * デバッグ情報を取得
   */
  getDebugInfo(): any {
    return {
      ...super.getDebugInfo(),
      currentValue: this.getValue(),
      positiveSum: this.positiveCounter.getValue(),
      negativeSum: this.negativeCounter.getValue(),
      nodeDetails: this.getNodeDetails()
    }
  }

  /**
   * ノード別の詳細情報を取得
   */
  getNodeDetails(): Record<string, { positive: number; negative: number; total: number }> {
    const result: Record<string, { positive: number; negative: number; total: number }> = {}

    const allNodes = new Set([
      ...Object.keys(this.state.positive),
      ...Object.keys(this.state.negative)
    ])

    for (const nodeId of allNodes) {
      const positive = this.state.positive[nodeId] || 0
      const negative = this.state.negative[nodeId] || 0
      result[nodeId] = {
        positive,
        negative,
        total: positive - negative
      }
    }

    return result
  }

}

/**
 * PN-Counterユーティリティクラス
 */
export class PNCounterUtils {
  /**
   * 複数のPN-Counterを一度にマージ
   */
  static mergeMultiple(counters: PNCounter[]): PNCounter | null {
    if (counters.length === 0) return null
    if (counters.length === 1) return counters[0]

    const [first, ...rest] = counters
    const merged = new PNCounter(first.nodeId, first.id, first.getState())

    for (const counter of rest) {
      merged.merge(counter)
    }

    return merged
  }

  /**
   * カウンターの差分を計算
   */
  static calculateDiff(counter1: PNCounter, counter2: PNCounter): {
    valueDiff: number
    positiveDiff: number
    negativeDiff: number
    nodeDetails: Record<string, any>
  } {
    const value1 = counter1.getValue()
    const value2 = counter2.getValue()
    const state1 = counter1.getState()
    const state2 = counter2.getState()
    const pos1 = Object.keys(state1.positive).length
    const pos2 = Object.keys(state2.positive).length
    const neg1 = Object.keys(state1.negative).length
    const neg2 = Object.keys(state2.negative).length

    return {
      valueDiff: value1 - value2,
      positiveDiff: pos1 - pos2,
      negativeDiff: neg1 - neg2,
      nodeDetails: {
        counter1: counter1.getNodeDetails(),
        counter2: counter2.getNodeDetails()
      }
    }
  }

  /**
   * 統計情報を計算
   */
  static calculateStats(counter: PNCounter): {
    totalValue: number
    totalPositive: number
    totalNegative: number
    nodeCount: number
    averagePerNode: number
    maxPositive: number
    maxNegative: number
  } {
    const nodeDetails = counter.getNodeDetails()
    const nodes = Object.values(nodeDetails)
    const state = counter.getState()

    return {
      totalValue: counter.getValue(),
      totalPositive: Object.keys(state.positive).length,
      totalNegative: Object.keys(state.negative).length,
      nodeCount: nodes.length,
      averagePerNode: nodes.length > 0 ? counter.getValue() / nodes.length : 0,
      maxPositive: Math.max(...nodes.map(n => n.positive), 0),
      maxNegative: Math.max(...nodes.map(n => n.negative), 0)
    }
  }
}
