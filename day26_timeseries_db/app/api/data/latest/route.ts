import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../generated/prisma';
import { z } from 'zod';

const prisma = new PrismaClient();

// Zod スキーマ定義 (クエリパラメータ用)
const LatestQuerySchema = z.object({
  key: z.string(),
  limit: z.coerce.number().int().positive().optional().default(10), // デフォルトは10件
});

/**
 * 最新 N 件取得 API (GET /api/data/latest)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queryParams = Object.fromEntries(searchParams.entries());

  // クエリパラメータのバリデーション
  const parseResult = LatestQuerySchema.safeParse(queryParams);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parseResult.error.errors }, { status: 400 });
  }

  const { key, limit } = parseResult.data;

  try {
    const data = await prisma.timeSeriesData.findMany({
      where: {
        key: key,
      },
      orderBy: {
        timestamp: 'desc', // 最新のものが先頭に来るように降順ソート
      },
      take: limit, // 上位 N 件を取得
    });

    // 結果を昇順に戻して返す (グラフ表示などを考慮)
    const sortedData = data.sort((a, b) => a.timestamp - b.timestamp);

    return NextResponse.json(sortedData);

  } catch (error) {
    console.error('Error fetching latest data:', error);
    return NextResponse.json({ error: 'Failed to fetch latest data' }, { status: 500 });
  }
}
