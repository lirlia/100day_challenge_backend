import { HashRing } from './hash-ring';
import prisma from './db';
import type {
  CacheKey,
  CacheValue,
  CacheSetOptions,
  Node,
  ClusterEventType,
  FailureType,
  CacheItemResponse,
  ReplicationStatus,
} from './types';

/**
 * シングルトンとして動作するクラスタマネージャー
 * キャッシュノードの管理とデータアクセスの中央制御を担当
 */
class ClusterManager {
  private static instance: ClusterManager;
  private hashRing: HashRing;
  private nodesCache: Map<string, Node> = new Map();
  private initialized = false;
  // 配置状態と健全性を追跡
  private placementVersion = 1;
  private replicationQueue: Array<{key: string, nodeId: string, targetNodeId: string}> = [];
  // レプリケーション同期の間隔（ミリ秒）
  private replicationInterval = 5000;
  private replicationIntervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.hashRing = new HashRing();
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): ClusterManager {
    if (!ClusterManager.instance) {
      ClusterManager.instance = new ClusterManager();
    }
    return ClusterManager.instance;
  }

  /**
   * クラスタマネージャーを初期化
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    // DBからすべてのノードを取得
    const nodes = await prisma.node.findMany({
      where: {
        // アクティブなノードのみ取得
        status: 'active',
      },
    });

    // 一貫性ハッシュリングにノードを追加
    this.hashRing = new HashRing(
      nodes.map((node) => ({
        id: node.id,
        name: node.name,
        status: node.status as any,
        weight: node.weight,
        createdAt: node.createdAt.toISOString(),
        updatedAt: node.updatedAt.toISOString(),
      })),
    );

    // ノードキャッシュを初期化
    for (const node of nodes) {
      this.nodesCache.set(node.id, {
        id: node.id,
        name: node.name,
        status: node.status as any,
        weight: node.weight,
        createdAt: node.createdAt.toISOString(),
        updatedAt: node.updatedAt.toISOString(),
      });
    }

    // レプリケーション同期ジョブを開始
    this.startReplicationSyncJob();

    this.initialized = true;
    console.log(`Cluster initialized with ${nodes.length} nodes`);
  }

  /**
   * レプリケーション同期ジョブを開始
   */
  private startReplicationSyncJob(): void {
    if (this.replicationIntervalId) {
      clearInterval(this.replicationIntervalId);
    }

    this.replicationIntervalId = setInterval(async () => {
      await this.processReplicationQueue();
    }, this.replicationInterval);

    console.log('Started replication sync job');
  }

  /**
   * レプリケーションキューの処理
   */
  private async processReplicationQueue(): Promise<void> {
    if (this.replicationQueue.length === 0) return;

    // キューから最大10個のタスクを取得
    const tasks = this.replicationQueue.splice(0, 10);

    // 各タスクを並行処理
    await Promise.allSettled(
      tasks.map(async (task) => {
        try {
          await this.replicateItem(task.key, task.nodeId, task.targetNodeId);
        } catch (error) {
          console.error(`Failed to replicate ${task.key} from ${task.nodeId} to ${task.targetNodeId}:`, error);
          // 失敗したタスクは再キュー（先頭に戻す）
          this.replicationQueue.unshift(task);
        }
      })
    );
  }

  /**
   * アイテムを別ノードにレプリケーション
   */
  private async replicateItem(key: string, sourceNodeId: string, targetNodeId: string): Promise<boolean> {
    // ソースノードからデータを取得
    const sourceItem = await prisma.cacheItem.findUnique({
      where: {
        nodeId_key: {
          nodeId: sourceNodeId,
          key,
        },
      },
    });

    if (!sourceItem) return false;

    try {
      // 既存のレプリケーションを確認
      const existingReplication = await prisma.replication.findFirst({
        where: {
          nodeId: targetNodeId,
          cacheItemId: sourceItem.id,
        },
      });

      if (existingReplication) {
        // バージョンが古い場合のみ更新
        if (existingReplication.version < sourceItem.version) {
          await prisma.replication.update({
            where: { id: existingReplication.id },
            data: { version: sourceItem.version },
          });
        }
      } else {
        // 新規レプリケーションを作成
        await prisma.replication.create({
          data: {
            nodeId: targetNodeId,
            cacheItemId: sourceItem.id,
            version: sourceItem.version,
          },
        });
      }

      return true;
    } catch (error) {
      console.error(`Failed to replicate item ${key}:`, error);
      return false;
    }
  }

  /**
   * キーからプライマリノードを特定
   * @param key キャッシュキー
   */
  private getNodeForKey(key: CacheKey): Node | undefined {
    if (!this.initialized) {
      throw new Error('Cluster manager is not initialized');
    }
    return this.hashRing.getNode(key);
  }

  /**
   * キャッシュから値を取得
   * @param key キャッシュキー
   */
  public async get(key: CacheKey): Promise<CacheItemResponse | null> {
    const node = this.getNodeForKey(key);
    if (!node) {
      return null;
    }

    // プライマリノードからデータを取得
    const cacheItem = await prisma.cacheItem.findUnique({
      where: {
        nodeId_key: {
          nodeId: node.id,
          key,
        },
      },
    });

    // データが見つからない場合、レプリカノードを確認
    if (!cacheItem) {
      // レプリカノード一覧を取得
      const replicaNodes = this.hashRing.getReplicaNodes(key);

      // 各レプリカノードを順番に確認
      for (const replicaNode of replicaNodes) {
        // データベースからレプリカを検索
        const replication = await prisma.replication.findFirst({
          where: {
            nodeId: replicaNode.id,
            cacheItem: {
              key,
            },
          },
          include: {
            cacheItem: true,
          },
        });

        if (replication?.cacheItem) {
          const item = replication.cacheItem;

          // 有効期限切れならスキップ
          if (item.expiresAt && item.expiresAt < new Date()) {
            continue;
          }

          // レプリカからデータが見つかった場合、プライマリに自己修復
          await this.set(key, item.value, {
            ttl: item.expiresAt ? Math.floor((item.expiresAt.getTime() - Date.now()) / 1000) : undefined,
            version: item.version,
          });

          // レプリカのデータを返却
          return {
            key,
            value: item.value,
            metadata: {
              version: item.version,
              expiresAt: item.expiresAt?.toISOString(),
              createdAt: item.createdAt.toISOString(),
              updatedAt: item.updatedAt.toISOString(),
              source: 'replica',  // レプリカからの読み取りを示す
            },
          };
        }
      }

      // プライマリもレプリカも見つからない場合
      return null;
    }

    // 有効期限切れの場合
    if (cacheItem.expiresAt && cacheItem.expiresAt < new Date()) {
      await this.delete(key);
      return null;
    }

    // 見つかったデータを返却
    return {
      key,
      value: cacheItem.value,
      metadata: {
        version: cacheItem.version,
        expiresAt: cacheItem.expiresAt?.toISOString(),
        createdAt: cacheItem.createdAt.toISOString(),
        updatedAt: cacheItem.updatedAt.toISOString(),
        source: 'primary',  // プライマリからの読み取りを示す
      },
    };
  }

  /**
   * キャッシュに値を設定
   * @param key キャッシュキー
   * @param value キャッシュ値
   * @param options 設定オプション
   */
  public async set(
    key: CacheKey,
    value: CacheValue,
    options?: CacheSetOptions,
  ): Promise<boolean> {
    const node = this.getNodeForKey(key);
    if (!node) {
      return false;
    }

    try {
      // 有効期限の計算
      const expiresAt = options?.ttl
        ? new Date(Date.now() + options.ttl * 1000)
        : undefined;

      // 既存のキャッシュアイテムを検索
      const existingItem = await prisma.cacheItem.findUnique({
        where: {
          nodeId_key: {
            nodeId: node.id,
            key,
          },
        },
      });

      let cacheItem;

      if (existingItem) {
        // バージョン競合チェック (オプションでバージョン指定がある場合)
        if (options?.version && existingItem.version > options.version) {
          // 既存バージョンの方が新しい場合は書き込まない
          return false;
        }

        // 既存アイテムの更新
        cacheItem = await prisma.cacheItem.update({
          where: {
            id: existingItem.id,
          },
          data: {
            value,
            expiresAt,
            version: existingItem.version + 1,
          },
        });
      } else {
        // 新規アイテムの作成
        cacheItem = await prisma.cacheItem.create({
          data: {
            key,
            value,
            nodeId: node.id,
            expiresAt,
            version: options?.version || 1,
          },
        });
      }

      // レプリケーションの作成・更新
      await this.scheduleReplication(key, node.id, cacheItem.id);

      // クラスタイベントを記録
      await this.logClusterEvent('cache_updated', {
        key,
        nodeId: node.id,
        version: cacheItem.version,
      });

      return true;
    } catch (error) {
      console.error('Failed to set cache item:', error);
      return false;
    }
  }

  /**
   * レプリケーションのスケジュール
   */
  private async scheduleReplication(key: string, sourceNodeId: string, cacheItemId: string): Promise<void> {
    // レプリカノードを取得
    const replicaNodes = this.hashRing.getReplicaNodes(key);

    // レプリカノードごとにレプリケーションをスケジュール
    for (const replicaNode of replicaNodes) {
      // 自分自身にはレプリケーションしない
      if (replicaNode.id === sourceNodeId) continue;

      // キューに追加
      this.replicationQueue.push({
        key,
        nodeId: sourceNodeId,
        targetNodeId: replicaNode.id,
      });
    }
  }

  /**
   * キャッシュから値を削除
   * @param key キャッシュキー
   */
  public async delete(key: CacheKey): Promise<boolean> {
    const node = this.getNodeForKey(key);
    if (!node) {
      return false;
    }

    try {
      // 既存のキャッシュアイテムを検索
      const existingItem = await prisma.cacheItem.findUnique({
        where: {
          nodeId_key: {
            nodeId: node.id,
            key,
          },
        },
      });

      if (!existingItem) {
        return false;
      }

      // キャッシュアイテムに紐づくレプリケーションも含めて削除
      await prisma.$transaction([
        // レプリケーションを先に削除（外部キー制約のため）
        prisma.replication.deleteMany({
          where: {
            cacheItemId: existingItem.id,
          },
        }),
        // キャッシュアイテムを削除
        prisma.cacheItem.delete({
          where: {
            id: existingItem.id,
          },
        }),
      ]);

      // クラスタイベントを記録
      await this.logClusterEvent('cache_deleted', {
        key,
        nodeId: node.id,
      });

      return true;
    } catch (error) {
      console.error('Failed to delete cache item:', error);
      return false;
    }
  }

  /**
   * すべてのノード情報を取得
   */
  public async getAllNodes(): Promise<Node[]> {
    const nodes = await prisma.node.findMany();
    return nodes.map((node) => ({
      id: node.id,
      name: node.name,
      status: node.status as any,
      weight: node.weight,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    }));
  }

  /**
   * ノードを追加
   * @param name ノード名
   * @param weight ノードの重み（デフォルト: 100）
   */
  public async addNode(name: string, weight = 100): Promise<Node | null> {
    try {
      const newNode = await prisma.node.create({
        data: {
          name,
          weight,
          status: 'active',
        },
      });

      const nodeData: Node = {
        id: newNode.id,
        name: newNode.name,
        status: newNode.status as any,
        weight: newNode.weight,
        createdAt: newNode.createdAt.toISOString(),
        updatedAt: newNode.updatedAt.toISOString(),
      };

      // キャッシュとハッシュリングを更新
      this.nodesCache.set(newNode.id, nodeData);
      this.hashRing.addNode(nodeData);

      // 配置バージョンを更新
      this.placementVersion++;

      // データの再配置をスケジュール
      await this.scheduleDataRebalancing();

      // イベントログに記録
      await this.logClusterEvent('node_added', {
        nodeId: newNode.id,
        name: newNode.name,
        placementVersion: this.placementVersion,
      });

      return nodeData;
    } catch (error) {
      console.error('Failed to add node:', error);
      return null;
    }
  }

  /**
   * ノードを削除
   * @param nodeId ノードID
   */
  public async removeNode(nodeId: string): Promise<boolean> {
    try {
      // ノードの存在確認
      const node = await prisma.node.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        return false;
      }

      // このノードに属するすべてのキャッシュアイテムを取得
      const cacheItems = await prisma.cacheItem.findMany({
        where: { nodeId },
      });

      // データのリホーミング
      for (const item of cacheItems) {
        // 新しいプライマリノードを特定
        const newPrimaryNode = this.findNewPrimaryNodeForKey(item.key, nodeId);

        if (newPrimaryNode) {
          // 新しいプライマリノードにデータを移行
          await this.migrateCacheItem(item, newPrimaryNode.id);
        }
      }

      // ノードの削除
      await prisma.$transaction([
        // このノードが保持するレプリケーションを削除
        prisma.replication.deleteMany({
          where: { nodeId },
        }),
        // このノードのキャッシュアイテムを削除
        prisma.cacheItem.deleteMany({
          where: { nodeId },
        }),
        // ノードを削除
        prisma.node.delete({
          where: { id: nodeId },
        }),
      ]);

      // キャッシュとハッシュリングから削除
      this.nodesCache.delete(nodeId);
      this.hashRing.removeNode(nodeId);

      // 配置バージョンを更新
      this.placementVersion++;

      // イベントログに記録
      await this.logClusterEvent('node_removed', {
        nodeId,
        placementVersion: this.placementVersion,
      });

      return true;
    } catch (error) {
      console.error('Failed to remove node:', error);
      return false;
    }
  }

  /**
   * キーの新しいプライマリノードを特定
   */
  private findNewPrimaryNodeForKey(key: string, excludeNodeId: string): Node | undefined {
    // 現在のハッシュリングからノードを一時的に削除
    this.hashRing.removeNode(excludeNodeId);

    // 新しいプライマリノードを取得
    const newPrimaryNode = this.hashRing.getNode(key);

    // ノードを復元
    const node = this.nodesCache.get(excludeNodeId);
    if (node && node.status === 'active') {
      this.hashRing.addNode(node);
    }

    return newPrimaryNode;
  }

  /**
   * キャッシュアイテムを別ノードに移行
   */
  private async migrateCacheItem(item: any, newNodeId: string): Promise<boolean> {
    try {
      // 新しいノードに既に同じキーが存在しないか確認
      const existingItem = await prisma.cacheItem.findUnique({
        where: {
          nodeId_key: {
            nodeId: newNodeId,
            key: item.key,
          },
        },
      });

      if (existingItem) {
        // バージョンが古い場合のみ更新
        if (existingItem.version < item.version) {
          await prisma.cacheItem.update({
            where: { id: existingItem.id },
            data: {
              value: item.value,
              expiresAt: item.expiresAt,
              version: item.version,
            },
          });
        }
      } else {
        // 新規作成
        await prisma.cacheItem.create({
          data: {
            key: item.key,
            value: item.value,
            nodeId: newNodeId,
            expiresAt: item.expiresAt,
            version: item.version,
          },
        });
      }

      return true;
    } catch (error) {
      console.error(`Failed to migrate cache item ${item.key}:`, error);
      return false;
    }
  }

  /**
   * データの再配置をスケジュール
   */
  private async scheduleDataRebalancing(): Promise<void> {
    // すべてのキャッシュアイテムを取得
    const allItems = await prisma.cacheItem.findMany();

    // 各アイテムの新しい配置を計算
    for (const item of allItems) {
      const correctNode = this.getNodeForKey(item.key);

      // 正しいノードが見つからない場合はスキップ
      if (!correctNode) continue;

      // 現在のノードと正しいノードが異なる場合、移行が必要
      if (item.nodeId !== correctNode.id) {
        await this.migrateCacheItem(item, correctNode.id);

        // 古いデータを削除（移行後）
        await prisma.cacheItem.delete({
          where: { id: item.id },
        });
      }
    }
  }

  /**
   * レプリケーションステータスを取得
   */
  public async getReplicationStatus(): Promise<ReplicationStatus> {
    const totalItems = await prisma.cacheItem.count();
    const totalReplications = await prisma.replication.count();
    const pendingReplications = this.replicationQueue.length;

    const nodeStats = await prisma.node.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        _count: {
          select: {
            cacheItems: true,
            replications: true,
          },
        },
      },
    });

    return {
      totalItems,
      totalReplications,
      pendingReplications,
      placementVersion: this.placementVersion,
      nodeStats: nodeStats.map(node => ({
        nodeId: node.id,
        name: node.name,
        status: node.status as any,
        primaryItems: node._count.cacheItems,
        replicaItems: node._count.replications,
      })),
    };
  }

  /**
   * シミュレーション: ノード障害
   * @param nodeId ノードID
   * @param type 障害種別
   */
  public async simulateFailure(nodeId: string, type: FailureType): Promise<boolean> {
    try {
      const node = await prisma.node.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        return false;
      }

      // ノードの状態を更新
      const status = type === 'down' ? 'down' :
                    type === 'slow' ? 'slow' : 'partitioned';

      await prisma.node.update({
        where: { id: nodeId },
        data: { status },
      });

      // キャッシュとハッシュリングを更新
      const nodeData = {
        ...this.nodesCache.get(nodeId)!,
        status: status as any,
      };

      this.nodesCache.set(nodeId, nodeData);
      this.hashRing.updateNode(nodeId, nodeData);

      // イベントログに記録
      await this.logClusterEvent('node_down', {
        nodeId,
        failureType: type,
      });

      // 障害発生後にレプリケーション戦略を更新
      if (status !== 'slow') {
        // ダウンまたは分断の場合、そのノードのプライマリキャッシュを別ノードに移行
        await this.handleNodeFailure(nodeId);
      }

      return true;
    } catch (error) {
      console.error('Failed to simulate failure:', error);
      return false;
    }
  }

  /**
   * ノード障害時の処理
   */
  private async handleNodeFailure(nodeId: string): Promise<void> {
    // 障害ノードが持つプライマリキャッシュを取得
    const affectedItems = await prisma.cacheItem.findMany({
      where: { nodeId },
    });

    // 各アイテムを新しいノードに移行
    for (const item of affectedItems) {
      const newPrimaryNode = this.findNewPrimaryNodeForKey(item.key, nodeId);

      if (newPrimaryNode) {
        await this.migrateCacheItem(item, newPrimaryNode.id);
      }
    }
  }

  /**
   * シミュレーション: ノード復旧
   * @param nodeId ノードID
   */
  public async simulateRecovery(nodeId: string): Promise<boolean> {
    try {
      const node = await prisma.node.findUnique({
        where: { id: nodeId },
      });

      if (!node) {
        return false;
      }

      // ノードの状態を更新
      await prisma.node.update({
        where: { id: nodeId },
        data: { status: 'active' },
      });

      // キャッシュとハッシュリングを更新
      const nodeData = {
        ...this.nodesCache.get(nodeId)!,
        status: 'active' as const,
      };

      this.nodesCache.set(nodeId, nodeData);
      this.hashRing.updateNode(nodeId, nodeData);

      // イベントログに記録
      await this.logClusterEvent('node_recovered', {
        nodeId,
      });

      // 復旧後にレプリケーション戦略を更新
      await this.handleNodeRecovery(nodeId);

      return true;
    } catch (error) {
      console.error('Failed to simulate recovery:', error);
      return false;
    }
  }

  /**
   * ノード復旧時の処理
   */
  private async handleNodeRecovery(nodeId: string): Promise<void> {
    // すべてのキャッシュアイテムをチェック
    const allItems = await prisma.cacheItem.findMany();

    for (const item of allItems) {
      const correctNode = this.getNodeForKey(item.key);

      // 正しいノードが復旧したノードで、現在別のノードにある場合
      if (correctNode?.id === nodeId && item.nodeId !== nodeId) {
        // アイテムを正しいノードに移行
        await this.migrateCacheItem(item, nodeId);

        // 古いデータを削除
        await prisma.cacheItem.delete({
          where: { id: item.id },
        });
      }
    }
  }

  /**
   * クラスタイベントをログに記録
   * @param type イベント種別
   * @param data イベントデータ
   */
  private async logClusterEvent(type: ClusterEventType, data: any): Promise<void> {
    try {
      await prisma.clusterEvent.create({
        data: {
          type,
          payload: JSON.stringify(data),
        },
      });
    } catch (error) {
      console.error('Failed to log cluster event:', error);
    }
  }

  /**
   * クラスタイベント履歴を取得
   * @param limit 取得数
   */
  public async getClusterEvents(limit = 50): Promise<any[]> {
    const events = await prisma.clusterEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return events.map(event => ({
      id: event.id,
      type: event.type,
      payload: JSON.parse(event.payload),
      createdAt: event.createdAt.toISOString(),
    }));
  }
}

// シングルトンインスタンスをエクスポート
export const clusterManager = ClusterManager.getInstance();
export default clusterManager;
