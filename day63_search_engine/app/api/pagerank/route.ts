/**
 * PageRank API
 * GET /api/pagerank - PageRank統計取得
 * POST /api/pagerank - PageRank計算実行
 */

import { NextRequest, NextResponse } from 'next/server';
import { runPageRankWorkflow, getPageRankStatistics, DEFAULT_PAGERANK_OPTIONS } from '@/lib/pagerank';

export async function GET() {
  try {
    console.log('[API] Getting PageRank statistics...');

    const stats = await getPageRankStatistics();

    return NextResponse.json({
      success: true,
      data: stats,
      metadata: {
        timestamp: new Date().toISOString(),
        apiVersion: '1.0'
      }
    });

  } catch (error) {
    console.error('[API] Failed to get PageRank statistics:', error);

    return NextResponse.json({
      success: false,
      message: 'PageRank統計の取得中にエラーが発生しました',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    console.log('[API] Starting PageRank calculation...');

    // オプションのパース
    const options = {
      dampingFactor: body.dampingFactor || DEFAULT_PAGERANK_OPTIONS.dampingFactor,
      maxIterations: body.maxIterations || DEFAULT_PAGERANK_OPTIONS.maxIterations,
      tolerance: body.tolerance || DEFAULT_PAGERANK_OPTIONS.tolerance
    };

    const generateLinks = body.generateLinks !== false; // デフォルトtrue

    console.log(`[API] PageRank options:`, options);
    console.log(`[API] Generate links: ${generateLinks}`);

    // PageRank計算実行
    const startTime = Date.now();
    const results = await runPageRankWorkflow(generateLinks, options);
    const executionTime = Date.now() - startTime;

    // 統計情報を取得
    const stats = await getPageRankStatistics();

    console.log(`[API] PageRank calculation completed in ${executionTime}ms`);

    return NextResponse.json({
      success: true,
      data: {
        results: results.slice(0, 10), // トップ10のみ返す
        statistics: stats,
        options: options,
        executionTimeMs: executionTime
      },
      metadata: {
        timestamp: new Date().toISOString(),
        apiVersion: '1.0'
      }
    });

  } catch (error) {
    console.error('[API] PageRank calculation failed:', error);

    return NextResponse.json({
      success: false,
      message: 'PageRank計算中にエラーが発生しました',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}