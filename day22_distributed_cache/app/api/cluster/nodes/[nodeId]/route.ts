import { NextRequest, NextResponse } from 'next/server';
import { clusterManager } from '../../../../../lib/cluster-manager';

// 初期化確認
let initialized = false;
const ensureInitialized = async () => {
  if (!initialized) {
    await clusterManager.initialize();
    initialized = true;
  }
};

/**
 * ノード削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { nodeId: string } }
) {
  await ensureInitialized();

  const nodeId = params.nodeId;

  try {
    const success = await clusterManager.removeNode(nodeId);

    if (!success) {
      return NextResponse.json(
        { error: 'Node not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error removing node ${nodeId}:`, error);
    return NextResponse.json(
      { error: 'Failed to remove node' },
      { status: 500 }
    );
  }
}
