/**
 * インデックス再構築API
 * POST /api/index/rebuild
 */

import { NextRequest, NextResponse } from 'next/server';
import { rebuildAllIndexes, getIndexStats } from '@/lib/indexing';

export async function POST(request: NextRequest) {
  console.log('[API] Starting index rebuild...');

  try {
    // インデックス再構築実行
    await rebuildAllIndexes();

    // 統計情報取得
    const stats = await getIndexStats();

    console.log('[API] Index rebuild completed successfully');

    return NextResponse.json({
      success: true,
      message: 'インデックスの再構築が完了しました',
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[API] Index rebuild failed:', error);

    return NextResponse.json({
      success: false,
      message: 'インデックス再構築に失敗しました',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}