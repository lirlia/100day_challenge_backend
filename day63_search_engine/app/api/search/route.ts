/**
 * 検索API
 * GET /api/search?q=検索クエリ&page=1&limit=10
 */

import { NextRequest, NextResponse } from 'next/server';
import { search, logSearch, SearchOptions } from '@/lib/search-engine';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // クエリパラメータの取得
    const query = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const category = searchParams.get('category') || undefined;
    const author = searchParams.get('author') || undefined;
    const minWordCount = searchParams.get('minWordCount') ? parseInt(searchParams.get('minWordCount')!) : undefined;
    const maxWordCount = searchParams.get('maxWordCount') ? parseInt(searchParams.get('maxWordCount')!) : undefined;
    const sortBy = searchParams.get('sortBy') as 'relevance' | 'date' | 'pagerank' | 'title' || 'relevance';
    const sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc' || 'desc';

    // クエリが空の場合
    if (!query || query.trim() === '') {
      return NextResponse.json({
        success: false,
        message: '検索クエリが指定されていません',
        error: 'Query parameter "q" is required'
      }, { status: 400 });
    }

    console.log(`[API] Search request: "${query}" (page=${page}, limit=${limit})`);

    // 検索オプションの構築
    const options: SearchOptions = {
      page,
      limit,
      category,
      author,
      minWordCount,
      maxWordCount,
      sortBy,
      sortOrder
    };

    // 検索実行
    const startTime = Date.now();
    const result = await search(query, options);
    const executionTime = Date.now() - startTime;

    // 検索ログの保存
    await logSearch(query, result.totalResults, executionTime);

    console.log(`[API] Search completed: ${result.totalResults} results in ${executionTime}ms`);

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date().toISOString(),
        apiVersion: '1.0',
        executionTimeMs: executionTime
      }
    });

  } catch (error) {
    console.error('[API] Search failed:', error);

    return NextResponse.json({
      success: false,
      message: '検索処理中にエラーが発生しました',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}