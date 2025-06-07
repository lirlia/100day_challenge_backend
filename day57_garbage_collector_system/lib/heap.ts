// ヒープとメモリアロケータの実装

import {
  GCObject,
  ObjectHeader,
  ObjectType,
  Generation as GenerationType,
  GCConfig,
  DEFAULT_GC_CONFIG,
  GCEvent,
  GCEventHandler
} from './gc-types';

// ユニークIDジェネレータ
function generateObjectId(): string {
  return `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// オブジェクトサイズ計算（簡略化）
function calculateObjectSize(data: any): number {
  const dataStr = JSON.stringify(data);
  return dataStr.length * 2; // UTF-16文字の近似バイト数
}

// ヒープ世代クラス
export class HeapGeneration {
  public name: 'young' | 'old';
  public objects: Map<string, GCObject>;
  public size: number;
  public limit: number;
  public gcCount: number;
  public promotionThreshold: number;

  constructor(
    name: 'young' | 'old',
    limit: number,
    promotionThreshold: number = 2
  ) {
    this.name = name;
    this.objects = new Map();
    this.size = 0;
    this.limit = limit;
    this.gcCount = 0;
    this.promotionThreshold = promotionThreshold;
  }

  // オブジェクトを追加
  addObject(object: GCObject): boolean {
    if (this.size + object.header.size > this.limit) {
      return false; // 容量不足
    }

    this.objects.set(object.header.id, object);
    this.size += object.header.size;
    return true;
  }

  // オブジェクトを削除
  removeObject(objectId: string): boolean {
    const object = this.objects.get(objectId);
    if (object) {
      this.objects.delete(objectId);
      this.size -= object.header.size;
      return true;
    }
    return false;
  }

  // 使用率を取得
  getUsageRatio(): number {
    return this.size / this.limit;
  }

  // 空き容量を取得
  getFreeSpace(): number {
    return this.limit - this.size;
  }

  // オブジェクト一覧を取得
  getAllObjects(): GCObject[] {
    return Array.from(this.objects.values());
  }

  // 統計情報を取得
  getStats() {
    return {
      name: this.name,
      objectCount: this.objects.size,
      size: this.size,
      limit: this.limit,
      usageRatio: this.getUsageRatio(),
      freeSpace: this.getFreeSpace(),
      gcCount: this.gcCount,
    };
  }
}

// メインヒープクラス
export class Heap {
  private youngGeneration: HeapGeneration;
  private oldGeneration: HeapGeneration;
  private config: GCConfig;
  private eventHandlers: GCEventHandler[] = [];
  private rootSet: Set<string> = new Set();

  constructor(config: GCConfig = DEFAULT_GC_CONFIG) {
    this.config = config;
    this.youngGeneration = new HeapGeneration('young', config.youngGenSizeLimit);
    this.oldGeneration = new HeapGeneration('old', config.oldGenSizeLimit);

    this.log('info', 'heap-init', `Heap initialized with config: ${JSON.stringify(config)}`);
  }

  // イベントハンドラーを追加
  addEventListener(handler: GCEventHandler): void {
    this.eventHandlers.push(handler);
  }

  // イベントハンドラーを削除
  removeEventListener(handler: GCEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  // イベントを発火
  private emitEvent(event: GCEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    });
  }

  // ログ出力
  private log(level: 'info' | 'warning' | 'error' | 'debug', phase: string, message: string, metadata?: any): void {
    if (this.config.debugMode) {
      console.log(`[GC-${level.toUpperCase()}] ${phase}: ${message}`);
    }

    this.emitEvent({
      type: 'log',
      entry: {
        sessionId: 'default', // TODO: セッション管理を実装
        timestamp: Date.now(),
        level,
        phase,
        message,
        metadata,
      }
    });
  }

  // オブジェクトを割り当て
  allocateObject(data: any, type: ObjectType, refs: string[] = []): GCObject | null {
    const size = calculateObjectSize(data);

    // 最大サイズチェック
    if (size > this.config.maxObjectSize) {
      this.log('error', 'allocation', `Object too large: ${size} bytes (max: ${this.config.maxObjectSize})`);
      return null;
    }

    const header: ObjectHeader = {
      id: generateObjectId(),
      type,
      size,
      marked: false,
      generation: 'young',
      refs,
      refCount: 0,
      allocatedAt: Date.now(),
      lastAccessed: Date.now(),
    };

    const object: GCObject = { header, data };

    // Young世代に割り当て試行
    if (this.youngGeneration.addObject(object)) {
      this.log('debug', 'allocation', `Object allocated in young gen: ${header.id} (${size} bytes)`);
      this.emitEvent({ type: 'object-allocated', object });
      return object;
    }

    // Young世代が満杯の場合、直接Old世代に割り当て
    if (this.oldGeneration.addObject(object)) {
      object.header.generation = 'old';
      this.log('debug', 'allocation', `Object allocated in old gen: ${header.id} (${size} bytes)`);
      this.emitEvent({ type: 'object-allocated', object });
      return object;
    }

    // 両世代とも満杯の場合、割り当て失敗
    this.log('error', 'allocation', `Failed to allocate object: ${size} bytes (heap full)`);
    return null;
  }

  // ルートオブジェクトを追加
  addRootObject(objectId: string): void {
    this.rootSet.add(objectId);
    this.log('debug', 'root-management', `Added root object: ${objectId}`);
  }

  // ルートオブジェクトを削除
  removeRootObject(objectId: string): void {
    this.rootSet.delete(objectId);
    this.log('debug', 'root-management', `Removed root object: ${objectId}`);
  }

  // オブジェクトを取得
  getObject(objectId: string): GCObject | undefined {
    const youngObj = this.youngGeneration.objects.get(objectId);
    if (youngObj) {
      youngObj.header.lastAccessed = Date.now();
      return youngObj;
    }

    const oldObj = this.oldGeneration.objects.get(objectId);
    if (oldObj) {
      oldObj.header.lastAccessed = Date.now();
      return oldObj;
    }

    return undefined;
  }

  // オブジェクトが存在するかチェック
  hasObject(objectId: string): boolean {
    return this.youngGeneration.objects.has(objectId) || this.oldGeneration.objects.has(objectId);
  }

  // 全オブジェクトを取得
  getAllObjects(): GCObject[] {
    return [
      ...this.youngGeneration.getAllObjects(),
      ...this.oldGeneration.getAllObjects(),
    ];
  }

  // Young世代のオブジェクトをOld世代に昇格
  promoteObject(objectId: string): boolean {
    const object = this.youngGeneration.objects.get(objectId);
    if (!object) {
      return false;
    }

    // Old世代に容量があるかチェック
    if (this.oldGeneration.size + object.header.size > this.oldGeneration.limit) {
      this.log('warning', 'promotion', `Cannot promote object ${objectId}: old gen full`);
      return false;
    }

    // Young世代から削除
    this.youngGeneration.removeObject(objectId);

    // Old世代に追加
    object.header.generation = 'old';
    this.oldGeneration.addObject(object);

    this.log('debug', 'promotion', `Object promoted: ${objectId} (young -> old)`);
    this.emitEvent({
      type: 'object-promoted',
      objectId,
      fromGen: 'young',
      toGen: 'old'
    });

    return true;
  }

  // GCが必要かどうかをチェック
  needsGC(): { young: boolean; old: boolean } {
    const youngNeedsGC = this.youngGeneration.getUsageRatio() >= this.config.gcTriggerThreshold;
    const oldNeedsGC = this.oldGeneration.getUsageRatio() >= this.config.gcTriggerThreshold;

    return { young: youngNeedsGC, old: oldNeedsGC };
  }

  // 統計情報を取得
  getStats() {
    const youngStats = this.youngGeneration.getStats();
    const oldStats = this.oldGeneration.getStats();

    return {
      young: youngStats,
      old: oldStats,
      total: {
        objectCount: youngStats.objectCount + oldStats.objectCount,
        size: youngStats.size + oldStats.size,
        limit: youngStats.limit + oldStats.limit,
        usageRatio: (youngStats.size + oldStats.size) / (youngStats.limit + oldStats.limit),
        rootObjects: this.rootSet.size,
      },
      config: this.config,
    };
  }

  // ヒープスナップショットを取得
  takeSnapshot(sessionId: string = 'default') {
    const stats = this.getStats();

    const snapshot = {
      sessionId,
      timestamp: Date.now(),
      youngGenSize: stats.young.limit,
      youngGenUsed: stats.young.size,
      oldGenSize: stats.old.limit,
      oldGenUsed: stats.old.size,
      totalObjects: stats.total.objectCount,
      rootObjects: stats.total.rootObjects,
    };

    this.emitEvent({ type: 'heap-snapshot', snapshot });
    return snapshot;
  }

  // 設定を更新
  updateConfig(newConfig: Partial<GCConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // 世代のサイズ制限を更新
    if (newConfig.youngGenSizeLimit) {
      this.youngGeneration.limit = newConfig.youngGenSizeLimit;
    }
    if (newConfig.oldGenSizeLimit) {
      this.oldGeneration.limit = newConfig.oldGenSizeLimit;
    }

    this.log('info', 'config-update', `Config updated: ${JSON.stringify(newConfig)}`);
  }

  // ルートセットを取得
  getRootSet(): Set<string> {
    return new Set(this.rootSet);
  }

  // 世代オブジェクトを取得
  getYoungGeneration(): HeapGeneration {
    return this.youngGeneration;
  }

  getOldGeneration(): HeapGeneration {
    return this.oldGeneration;
  }
}
