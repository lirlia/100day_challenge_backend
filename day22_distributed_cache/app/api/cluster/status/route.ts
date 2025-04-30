import { NextRequest, NextResponse } from 'next/server';
import { clusterManager } from '../../../../lib/cluster-manager';

// 初期化確認
let initialized = false;
const ensureInitialized = async () => {
  if (!initialized) {
    await clusterManager.initialize();
    initialized = true;
  }
};

/**
 * クラスタのステータスを取得
 */
export async function GET(request: NextRequest) {
  await ensureInitialized();

  try {
    // レプリケーションの状態を取得
    const replicationStatus = await clusterManager.getReplicationStatus();

    // クラスタイベントを取得
    const clusterEvents = await clusterManager.getClusterEvents(20);

    return NextResponse.json({
      status: 'success',
      replication: replicationStatus,
      events: clusterEvents,
    });
  } catch (error) {
    console.error('Failed to get cluster status:', error);
    return NextResponse.json(
      { error: 'Failed to get cluster status' },
      { status: 500 }
    );
  }
}
