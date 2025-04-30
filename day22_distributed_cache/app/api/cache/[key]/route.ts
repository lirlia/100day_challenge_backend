import { NextRequest, NextResponse } from 'next/server';
import { cacheStore } from '../../../../lib/cache-store';
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
 * キャッシュから値を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  await ensureInitialized();

  const key = decodeURIComponent(params.key);
  const result = await cacheStore.get(key);

  if (!result) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}

/**
 * キャッシュに値を設定
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  await ensureInitialized();

  const key = decodeURIComponent(params.key);

  try {
    const body = await request.json();
    const { value, ttl } = body;

    if (typeof value !== 'string') {
      return NextResponse.json(
        { error: 'Invalid value' },
        { status: 400 }
      );
    }

    const options = ttl ? { ttl: Number(ttl) } : undefined;
    const success = await cacheStore.set(key, value, options);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to set cache' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`Error setting cache for ${key}:`, error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}

/**
 * キャッシュから値を削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  await ensureInitialized();

  const key = decodeURIComponent(params.key);
  const success = await cacheStore.delete(key);

  if (!success) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
