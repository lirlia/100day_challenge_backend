import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../lib/db';
import { clusterManager } from '../../../lib/cluster-manager';
import type { CacheItemResponse } from '../../../lib/types';

// 初期化確認
let initialized = false;
const ensureInitialized = async () => {
  if (!initialized) {
    await clusterManager.initialize();
    initialized = true;
  }
};

/**
 * すべてのキャッシュアイテムを取得
 */
export async function GET(request: NextRequest) {
  await ensureInitialized();

  try {
    // すべてのキャッシュアイテムを取得
    const cacheItems = await prisma.cacheItem.findMany({
      include: { node: true },
      orderBy: { updatedAt: 'desc' },
    });

    // 期限切れのアイテムをフィルタリング
    const now = new Date();
    const validItems = cacheItems.filter(item => !item.expiresAt || item.expiresAt > now);

    // 各アイテムのソースを判定（プライマリかレプリカか）
    const responseItems: CacheItemResponse[] = await Promise.all(
      validItems.map(async (item) => {
        // このキーの正しいプライマリノードを取得
        const correctNode = await clusterManager['getNodeForKey'](item.key);
        const isPrimary = correctNode?.id === item.nodeId;

        return {
          key: item.key,
          value: item.value,
          metadata: {
            version: item.version,
            expiresAt: item.expiresAt?.toISOString(),
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
            source: isPrimary ? 'primary' : 'replica',
            nodeName: item.node.name,
          },
        };
      })
    );

    return NextResponse.json({
      status: 'success',
      items: responseItems,
    });
  } catch (error) {
    console.error('Failed to get all cache items:', error);
    return NextResponse.json(
      { error: 'Failed to get cache items' },
      { status: 500 }
    );
  }
}
