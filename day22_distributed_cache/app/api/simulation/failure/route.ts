import { NextRequest, NextResponse } from 'next/server';
import { clusterManager } from '../../../../lib/cluster-manager';
import { FailureType } from '../../../../lib/types';

// 初期化確認
let initialized = false;
const ensureInitialized = async () => {
  if (!initialized) {
    await clusterManager.initialize();
    initialized = true;
  }
};

/**
 * ノード障害シミュレーション
 */
export async function POST(request: NextRequest) {
  await ensureInitialized();

  try {
    const body = await request.json();
    const { nodeId, type } = body;

    if (!nodeId || typeof nodeId !== 'string') {
      return NextResponse.json(
        { error: 'Node ID is required' },
        { status: 400 }
      );
    }

    if (!type || !['down', 'slow', 'partition'].includes(type)) {
      return NextResponse.json(
        { error: 'Valid failure type (down, slow, or partition) is required' },
        { status: 400 }
      );
    }

    const success = await clusterManager.simulateFailure(nodeId, type as FailureType);

    if (!success) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error simulating node failure:', error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
