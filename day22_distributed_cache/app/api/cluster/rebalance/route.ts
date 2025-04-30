import { NextRequest, NextResponse } from 'next/server';
import { clusterManager } from '../../../../lib/cluster-manager';
import prisma from '../../../../lib/db';

// 初期化確認
let initialized = false;
const ensureInitialized = async () => {
  if (!initialized) {
    await clusterManager.initialize();
    initialized = true;
  }
};

/**
 * リバランス操作を開始
 */
export async function POST(request: NextRequest) {
  await ensureInitialized();

  try {
    // 現在のノードの状態を確認
    const nodes = await prisma.node.findMany({
      where: { status: 'active' },
    });

    if (nodes.length === 0) {
      return NextResponse.json(
        { error: 'No active nodes available' },
        { status: 400 }
      );
    }

    // リバランス開始イベントを記録
    await prisma.clusterEvent.create({
      data: {
        type: 'rebalance_started',
        payload: JSON.stringify({
          initiatedAt: new Date().toISOString(),
          activeNodes: nodes.length,
        }),
      },
    });

    // 非同期でリバランスを実行（実際の処理はバックグラウンドで行われる）
    scheduleRebalance();

    return NextResponse.json({
      status: 'success',
      message: 'Rebalance operation started',
    });
  } catch (error) {
    console.error('Failed to start rebalance:', error);
    return NextResponse.json(
      { error: 'Failed to start rebalance' },
      { status: 500 }
    );
  }
}

/**
 * バックグラウンドでリバランスを実行
 */
async function scheduleRebalance() {
  try {
    // すべてのキャッシュアイテムを取得
    const allItems = await prisma.cacheItem.findMany();
    const itemCount = allItems.length;
    let processedCount = 0;
    let migratedCount = 0;

    // 各アイテムについて、適切なノードに配置されているか確認
    for (const item of allItems) {
      const correctNodeId = await getCorrectNodeForKey(item.key);

      // 正しいノードが見つからない場合はスキップ
      if (!correctNodeId) {
        processedCount++;
        continue;
      }

      // 現在のノードと想定されるノードが異なる場合、移行が必要
      if (item.nodeId !== correctNodeId) {
        await migrateItem(item, correctNodeId);
        migratedCount++;
      }

      processedCount++;
    }

    // リバランス完了イベントを記録
    await prisma.clusterEvent.create({
      data: {
        type: 'rebalance_completed',
        payload: JSON.stringify({
          completedAt: new Date().toISOString(),
          totalItems: itemCount,
          migratedItems: migratedCount,
        }),
      },
    });

    console.log(`Rebalance completed: ${migratedCount}/${itemCount} items migrated`);
  } catch (error) {
    console.error('Error during rebalance:', error);
  }
}

/**
 * キーに対応する正しいノードを取得
 */
async function getCorrectNodeForKey(key: string): Promise<string | null> {
  const node = await clusterManager['getNodeForKey'](key);
  return node?.id || null;
}

/**
 * アイテムを別ノードに移行
 */
async function migrateItem(item: any, newNodeId: string): Promise<void> {
  try {
    // トランザクションで一貫性を保証
    await prisma.$transaction(async (tx) => {
      // 新しいノードに既に同じキーが存在しないか確認
      const existingItem = await tx.cacheItem.findUnique({
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
          await tx.cacheItem.update({
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
        await tx.cacheItem.create({
          data: {
            key: item.key,
            value: item.value,
            nodeId: newNodeId,
            expiresAt: item.expiresAt,
            version: item.version,
          },
        });
      }

      // 古いアイテムを削除
      await tx.cacheItem.delete({
        where: { id: item.id },
      });

      // レプリケーションも更新
      const replicaNodes = await clusterManager['hashRing'].getReplicaNodes(item.key);

      // このアイテムに関連するレプリケーションをすべて削除
      await tx.replication.deleteMany({
        where: {
          cacheItem: {
            key: item.key,
          },
        },
      });

      // 新しいレプリケーションを設定
      const newItem = await tx.cacheItem.findUnique({
        where: {
          nodeId_key: {
            nodeId: newNodeId,
            key: item.key,
          },
        },
      });

      if (newItem) {
        for (const replicaNode of replicaNodes) {
          if (replicaNode.id !== newNodeId) {
            await tx.replication.create({
              data: {
                nodeId: replicaNode.id,
                cacheItemId: newItem.id,
                version: newItem.version,
              },
            });
          }
        }
      }
    });
  } catch (error) {
    console.error(`Failed to migrate item ${item.key}:`, error);
    throw error; // 上位層での処理のために再スロー
  }
}
