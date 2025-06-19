import { VectorClock } from '@/lib/types';

/**
 * ベクタークロック - 分散システムでの因果順序を追跡
 */
export class VectorClockManager {
  private clock: VectorClock;
  private nodeId: string;

  constructor(nodeId: string, initialClock: VectorClock = {}) {
    this.nodeId = nodeId;
    this.clock = { ...initialClock };
    // 自ノードのクロックを初期化
    if (!(nodeId in this.clock)) {
      this.clock[nodeId] = 0;
    }
  }

  /**
   * 現在のベクタークロックを取得
   */
  getClock(): VectorClock {
    return { ...this.clock };
  }

  /**
   * 自ノードのクロックをインクリメント（操作発生時）
   */
  increment(): VectorClock {
    this.clock[this.nodeId] = (this.clock[this.nodeId] || 0) + 1;
    console.log(`🕒 [${this.nodeId}] クロック更新:`, this.clock);
    return this.getClock();
  }

  /**
   * 他ノードからのクロックと同期（メッセージ受信時）
   */
  sync(otherClock: VectorClock): VectorClock {
    const oldClock = { ...this.clock };

    // 各ノードについて最大値を取る
    for (const nodeId in otherClock) {
      this.clock[nodeId] = Math.max(
        this.clock[nodeId] || 0,
        otherClock[nodeId] || 0
      );
    }

    // 自ノードのクロックをインクリメント
    this.clock[this.nodeId] = (this.clock[this.nodeId] || 0) + 1;

    console.log(`🔄 [${this.nodeId}] クロック同期:`, {
      before: oldClock,
      received: otherClock,
      after: this.clock
    });

    return this.getClock();
  }

  /**
   * 因果関係の比較: このクロックが他のクロックよりも後か
   */
  isAfter(otherClock: VectorClock): boolean {
    return this.compare(this.clock, otherClock) > 0;
  }

  /**
   * 因果関係の比較: このクロックが他のクロックよりも前か
   */
  isBefore(otherClock: VectorClock): boolean {
    return this.compare(this.clock, otherClock) < 0;
  }

  /**
   * 同時発生（concurrent）の判定
   */
  isConcurrent(otherClock: VectorClock): boolean {
    return this.compare(this.clock, otherClock) === 0;
  }

  /**
   * ベクタークロックの比較
   * @returns 1: clock1 > clock2, -1: clock1 < clock2, 0: concurrent
   */
  private compare(clock1: VectorClock, clock2: VectorClock): number {
    const allNodes = new Set([
      ...Object.keys(clock1),
      ...Object.keys(clock2)
    ]);

    let hasGreater = false;
    let hasLess = false;

    for (const nodeId of allNodes) {
      const val1 = clock1[nodeId] || 0;
      const val2 = clock2[nodeId] || 0;

      if (val1 > val2) {
        hasGreater = true;
      } else if (val1 < val2) {
        hasLess = true;
      }
    }

    if (hasGreater && !hasLess) {
      return 1; // clock1 > clock2
    } else if (hasLess && !hasGreater) {
      return -1; // clock1 < clock2
    } else {
      return 0; // concurrent
    }
  }

  /**
   * クロックをシリアライズ
   */
  serialize(): string {
    return JSON.stringify(this.clock);
  }

  /**
   * クロックをデシリアライズ
   */
  static deserialize(data: string, nodeId: string): VectorClockManager {
    try {
      const clock = JSON.parse(data) as VectorClock;
      return new VectorClockManager(nodeId, clock);
    } catch (error) {
      console.error('ベクタークロックのデシリアライズに失敗:', error);
      return new VectorClockManager(nodeId);
    }
  }

  /**
   * クロックの文字列表現（デバッグ用）
   */
  toString(): string {
    const entries = Object.entries(this.clock)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nodeId, count]) => `${nodeId}:${count}`)
      .join(', ');
    return `{${entries}}`;
  }

  /**
   * 因果関係グラフの可視化用データ生成
   */
  generateVisualizationData() {
    return {
      nodeId: this.nodeId,
      clock: this.clock,
      timestamp: Date.now(),
      causalityLevel: Object.values(this.clock).reduce((sum, val) => sum + val, 0)
    };
  }
}

/**
 * ベクタークロック関連のユーティリティ関数
 */
export class VectorClockUtils {
  /**
   * 複数のベクタークロックの最小上界（Least Upper Bound）を計算
   */
  static lub(clocks: VectorClock[]): VectorClock {
    if (clocks.length === 0) return {};

    const result: VectorClock = {};
    const allNodes = new Set<string>();

    // 全ノードIDを収集
    for (const clock of clocks) {
      for (const nodeId of Object.keys(clock)) {
        allNodes.add(nodeId);
      }
    }

    // 各ノードの最大値を取る
    for (const nodeId of allNodes) {
      result[nodeId] = Math.max(
        ...clocks.map(clock => clock[nodeId] || 0)
      );
    }

    return result;
  }

  /**
   * ベクタークロックの差分を計算
   */
  static diff(clock1: VectorClock, clock2: VectorClock): VectorClock {
    const result: VectorClock = {};
    const allNodes = new Set([
      ...Object.keys(clock1),
      ...Object.keys(clock2)
    ]);

    for (const nodeId of allNodes) {
      const val1 = clock1[nodeId] || 0;
      const val2 = clock2[nodeId] || 0;
      result[nodeId] = val1 - val2;
    }

    return result;
  }

  /**
   * ベクタークロックがゼロかチェック
   */
  static isZero(clock: VectorClock): boolean {
    return Object.values(clock).every(val => val === 0);
  }

  /**
   * ベクタークロックの合計値
   */
  static sum(clock: VectorClock): number {
    return Object.values(clock).reduce((sum, val) => sum + val, 0);
  }
}
