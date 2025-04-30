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
 * 全ノード情報取得
 */
export async function GET() {
  await ensureInitialized();

  const nodes = await clusterManager.getAllNodes();
  return NextResponse.json({ nodes });
}

/**
 * ノード追加
 */
export async function POST(request: NextRequest) {
  await ensureInitialized();

  try {
    const body = await request.json();
    const { name, weight } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const weightValue = weight ? parseInt(weight as string, 10) : undefined;

    if (weightValue !== undefined && (isNaN(weightValue) || weightValue <= 0 || weightValue > 1000)) {
      return NextResponse.json(
        { error: 'Weight must be a number between 1 and 1000' },
        { status: 400 }
      );
    }

    const node = await clusterManager.addNode(name, weightValue || 100);

    if (!node) {
      return NextResponse.json(
        { error: 'Failed to add node' },
        { status: 500 }
      );
    }

    return NextResponse.json({ node });
  } catch (error) {
    console.error('Error adding node:', error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
