// ガベージコレクタのメイン実装

import {
  GCObject,
  MarkingContext,
  GCType,
  GCStats,
  GCConfig,
  DEFAULT_GC_CONFIG,
  GCEvent,
  GCEventHandler,
  Generation as GenerationType
} from './gc-types';
import { Heap, HeapGeneration } from './heap';

// Mark-and-Sweep ガベージコレクタ
export class GarbageCollector {
  private heap: Heap;
  private markingContext: MarkingContext;
  private isRunning: boolean = false;
  private sessionId: string;
  private concurrentGCWorker?: NodeJS.Timeout;

  constructor(config: GCConfig = DEFAULT_GC_CONFIG, sessionId: string = 'default') {
    this.heap = new Heap(config);
    this.sessionId = sessionId;
    this.markingContext = {
      phase: 'idle',
      visitedObjects: new Set(),
      grayObjects: new Set(),
      blackObjects: new Set(),
      rootSet: new Set(),
    };

    // イベントハンドラーを設定
    this.heap.addEventListener(this.handleHeapEvent.bind(this));

    // 並行GCを有効にする場合
    if (config.concurrentGC) {
      this.startConcurrentGC();
    }

    this.log('info', 'gc-init', 'Garbage Collector initialized');
  }

  // ヒープイベントハンドラー
  private handleHeapEvent(event: GCEvent): void {
    // TODO: 必要に応じてイベント処理を実装
  }

  // ログ出力
  private log(level: 'info' | 'warning' | 'error' | 'debug', phase: string, message: string, metadata?: any): void {
    console.log(`[GC-${level.toUpperCase()}] ${phase}: ${message}`);
  }

  // オブジェクトを割り当て
  allocate(data: any, type: any = 'object', refs: string[] = []): GCObject | null {
    const object = this.heap.allocateObject(data, type, refs);

    if (object) {
      // GCが必要かチェック
      const gcNeeds = this.heap.needsGC();
      if (gcNeeds.young && !this.isRunning) {
        // 非同期でYoung世代GCを実行
        setTimeout(() => this.collectYoungGeneration(), 0);
      } else if (gcNeeds.old && !this.isRunning) {
        // 非同期でFull GCを実行
        setTimeout(() => this.collectFullHeap(), 0);
      }
    }

    return object;
  }

  // ルートオブジェクトを設定
  setRootObject(objectId: string): void {
    this.heap.addRootObject(objectId);
    this.markingContext.rootSet.add(objectId);
  }

  // ルートオブジェクトを削除
  removeRootObject(objectId: string): void {
    this.heap.removeRootObject(objectId);
    this.markingContext.rootSet.delete(objectId);
  }

  // Young世代のGCを実行
  async collectYoungGeneration(): Promise<GCStats | null> {
    if (this.isRunning) {
      this.log('warning', 'young-gc', 'GC already running');
      return null;
    }

    this.isRunning = true;
    const gcType: GCType = 'young-gen';
    const startTime = Date.now();

    this.log('info', 'young-gc', 'Starting Young Generation GC');
    this.heap.addEventListener(event => {
      if (event.type === 'gc-start') {
        // GC開始イベント処理
      }
    });

    try {
      // 統計情報を収集
      const beforeStats = this.heap.getStats();
      const objectsBefore = beforeStats.young.objectCount;
      const memoryBefore = beforeStats.young.size;

      // マーキングフェーズ
      await this.markPhase(['young']);

      // スイープフェーズ
      const freedObjects = await this.sweepPhase(['young']);

      // プロモーションフェーズ
      await this.promoteObjects();

      // 統計情報を収集
      const afterStats = this.heap.getStats();
      const objectsAfter = afterStats.young.objectCount;
      const memoryAfter = afterStats.young.size;
      const memoryFreed = memoryBefore - memoryAfter;

      const endTime = Date.now();
      const stats: GCStats = {
        sessionId: this.sessionId,
        gcType,
        startTime,
        endTime,
        duration: endTime - startTime,
        objectsBefore,
        objectsAfter,
        memoryBefore,
        memoryAfter,
        memoryFreed,
        collectionEfficiency: memoryBefore > 0 ? memoryFreed / memoryBefore : 0,
      };

      this.heap.getYoungGeneration().gcCount++;
      this.log('info', 'young-gc', `Completed: freed ${freedObjects} objects, ${memoryFreed} bytes`);

      return stats;

    } catch (error) {
      this.log('error', 'young-gc', `Error during GC: ${error}`);
      return null;
    } finally {
      this.isRunning = false;
      this.resetMarkingContext();
    }
  }

  // Full GC（両世代）を実行
  async collectFullHeap(): Promise<GCStats | null> {
    if (this.isRunning) {
      this.log('warning', 'full-gc', 'GC already running');
      return null;
    }

    this.isRunning = true;
    const gcType: GCType = 'mark-sweep';
    const startTime = Date.now();

    this.log('info', 'full-gc', 'Starting Full Heap GC');

    try {
      // 統計情報を収集
      const beforeStats = this.heap.getStats();
      const objectsBefore = beforeStats.total.objectCount;
      const memoryBefore = beforeStats.total.size;

      // マーキングフェーズ
      await this.markPhase(['young', 'old']);

      // スイープフェーズ
      const freedObjects = await this.sweepPhase(['young', 'old']);

      // 統計情報を収集
      const afterStats = this.heap.getStats();
      const objectsAfter = afterStats.total.objectCount;
      const memoryAfter = afterStats.total.size;
      const memoryFreed = memoryBefore - memoryAfter;

      const endTime = Date.now();
      const stats: GCStats = {
        sessionId: this.sessionId,
        gcType,
        startTime,
        endTime,
        duration: endTime - startTime,
        objectsBefore,
        objectsAfter,
        memoryBefore,
        memoryAfter,
        memoryFreed,
        collectionEfficiency: memoryBefore > 0 ? memoryFreed / memoryBefore : 0,
      };

      this.heap.getYoungGeneration().gcCount++;
      this.heap.getOldGeneration().gcCount++;
      this.log('info', 'full-gc', `Completed: freed ${freedObjects} objects, ${memoryFreed} bytes`);

      return stats;

    } catch (error) {
      this.log('error', 'full-gc', `Error during GC: ${error}`);
      return null;
    } finally {
      this.isRunning = false;
      this.resetMarkingContext();
    }
  }

  // マーキングフェーズ
  private async markPhase(generations: GenerationType[]): Promise<void> {
    this.markingContext.phase = 'marking';
    this.log('debug', 'mark', 'Starting mark phase');

    // ルートセットから開始
    const rootSet = this.heap.getRootSet();
    for (const rootId of rootSet) {
      await this.markObject(rootId, generations);
    }

        // Tri-color markingアルゴリズム
    while (this.markingContext.grayObjects.size > 0) {
      const iterator = this.markingContext.grayObjects.values().next();
      if (iterator.done || !iterator.value) {
        break;
      }

      const objectId = iterator.value;
      this.markingContext.grayObjects.delete(objectId);

      const object = this.heap.getObject(objectId);
      if (object && generations.includes(object.header.generation)) {
        // 参照先をマーク
        for (const refId of object.header.refs) {
          await this.markObject(refId, generations);
        }

        // オブジェクトを黒に変更
        this.markingContext.blackObjects.add(objectId);
        object.header.marked = true;
      }

      // 並行GCの場合は、他の処理に制御を渡す
      if (this.markingContext.grayObjects.size % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.log('debug', 'mark', `Marked ${this.markingContext.blackObjects.size} objects`);
  }

  // オブジェクトをマーク
  private async markObject(objectId: string, generations: GenerationType[]): Promise<void> {
    if (this.markingContext.visitedObjects.has(objectId)) {
      return;
    }

    const object = this.heap.getObject(objectId);
    if (!object || !generations.includes(object.header.generation)) {
      return;
    }

    this.markingContext.visitedObjects.add(objectId);
    this.markingContext.grayObjects.add(objectId);
  }

  // スイープフェーズ
  private async sweepPhase(generations: GenerationType[]): Promise<number> {
    this.markingContext.phase = 'sweeping';
    this.log('debug', 'sweep', 'Starting sweep phase');

    let freedObjectCount = 0;

    for (const genType of generations) {
      const generation = genType === 'young'
        ? this.heap.getYoungGeneration()
        : this.heap.getOldGeneration();

      const objectsToDelete: string[] = [];

      // マークされていないオブジェクトを特定
      for (const [objectId, object] of generation.objects) {
        if (!object.header.marked) {
          objectsToDelete.push(objectId);
        }
      }

      // オブジェクトを削除
      for (const objectId of objectsToDelete) {
        if (generation.removeObject(objectId)) {
          freedObjectCount++;
          this.log('debug', 'sweep', `Freed object: ${objectId}`);
        }
      }

      // 並行性を確保
      if (objectsToDelete.length > 100) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.log('debug', 'sweep', `Freed ${freedObjectCount} objects`);
    return freedObjectCount;
  }

  // オブジェクトの昇格処理
  private async promoteObjects(): Promise<void> {
    this.markingContext.phase = 'promoting';
    this.log('debug', 'promotion', 'Starting promotion phase');

    const youngGen = this.heap.getYoungGeneration();
    const objectsToPromote: string[] = [];

    // 昇格候補のオブジェクトを特定（より厳しい条件）
    for (const [objectId, object] of youngGen.objects) {
      // マークされており、かつ十分古いオブジェクトのみ昇格
      if (object.header.marked) {
        const age = Date.now() - object.header.allocatedAt;
        const ageThreshold = 5000; // 5秒以上古いオブジェクト

        // ランダムで50%の確率で昇格（実際のGCではより複雑な条件）
        if (age > ageThreshold || Math.random() < 0.5) {
          objectsToPromote.push(objectId);
        }
      }
    }

    // オブジェクトを昇格
    for (const objectId of objectsToPromote) {
      this.heap.promoteObject(objectId);
    }

    this.log('debug', 'promotion', `Promoted ${objectsToPromote.length} objects to old generation`);
  }

  // マーキングコンテキストをリセット
  private resetMarkingContext(): void {
    this.markingContext = {
      phase: 'idle',
      visitedObjects: new Set(),
      grayObjects: new Set(),
      blackObjects: new Set(),
      rootSet: this.heap.getRootSet(),
    };

    // 全オブジェクトのマークをクリア
    const allObjects = this.heap.getAllObjects();
    for (const object of allObjects) {
      object.header.marked = false;
    }
  }

  // 並行GCを開始
  private startConcurrentGC(): void {
    this.concurrentGCWorker = setInterval(() => {
      if (!this.isRunning) {
        const gcNeeds = this.heap.needsGC();
        if (gcNeeds.young) {
          this.collectYoungGeneration();
        } else if (gcNeeds.old) {
          this.collectFullHeap();
        }
      }
    }, 1000); // 1秒間隔でチェック
  }

  // 並行GCを停止
  private stopConcurrentGC(): void {
    if (this.concurrentGCWorker) {
      clearInterval(this.concurrentGCWorker);
      this.concurrentGCWorker = undefined;
    }
  }

  // ガベージコレクタを停止
  shutdown(): void {
    this.stopConcurrentGC();
    this.log('info', 'shutdown', 'Garbage Collector stopped');
  }

  // 統計情報を取得
  getStats() {
    return {
      heap: this.heap.getStats(),
      marking: {
        phase: this.markingContext.phase,
        visitedObjects: this.markingContext.visitedObjects.size,
        grayObjects: this.markingContext.grayObjects.size,
        blackObjects: this.markingContext.blackObjects.size,
        rootObjects: this.markingContext.rootSet.size,
      },
      isRunning: this.isRunning,
    };
  }

  // ヒープ参照を取得
  getHeap(): Heap {
    return this.heap;
  }

  // ヒープスナップショットを取得
  takeSnapshot() {
    return this.heap.takeSnapshot(this.sessionId);
  }
}
