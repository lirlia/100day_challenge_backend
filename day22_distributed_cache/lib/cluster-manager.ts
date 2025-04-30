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

    this.initialized = true;
    console.log(`Cluster initialized with ${nodes.length} nodes`);
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

      if (existingItem) {
        // バージョン競合チェック (オプションでバージョン指定がある場合)
        if (options?.version && existingItem.version > options.version) {
          // 既存バージョンの方が新しい場合は書き込まない
          return false;
        }

        // 既存アイテムの更新
        await prisma.cacheItem.update({
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
        await prisma.cacheItem.create({
          data: {
            key,
            value,
            nodeId: node.id,
            expiresAt,
            version: options?.version || 1,
          },
        });
      }

      // レプリカの作成/更新は別の関数で実装予定
      // この時点では基本機能のみ実装

      return true;
    } catch (error) {
      console.error('Failed to set cache item:', error);
      return false;
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

      // キャッシュアイテムを削除
      await prisma.cacheItem.delete({
        where: {
          id: existingItem.id,
        },
      });

      // レプリカの削除は別の関数で実装予定
      // この時点では基本機能のみ実装

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

      // イベントログに記録
      await this.logClusterEvent('node_added', {
        nodeId: newNode.id,
        name: newNode.name,
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

      // このノードに属するキャッシュアイテムのリホーミングは別途実装予定
      // この時点では基本機能のみ実装

      // ノードの削除
      await prisma.node.delete({
        where: { id: nodeId },
      });

      // キャッシュとハッシュリングから削除
      this.nodesCache.delete(nodeId);
      this.hashRing.removeNode(nodeId);

      // イベントログに記録
      await this.logClusterEvent('node_removed', {
        nodeId,
      });

      return true;
    } catch (error) {
      console.error('Failed to remove node:', error);
      return false;
    }
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

      return true;
    } catch (error) {
      console.error('Failed to simulate failure:', error);
      return false;
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

      return true;
    } catch (error) {
      console.error('Failed to simulate recovery:', error);
      return false;
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
}

// シングルトンインスタンスをエクスポート
export const clusterManager = ClusterManager.getInstance();
export default clusterManager;
