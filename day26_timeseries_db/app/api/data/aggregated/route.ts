import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '../../../generated/prisma'; // Prisma と Prisma.sql をインポート
import { z } from 'zod';

const prisma = new PrismaClient();

// Zod スキーマ定義 (クエリパラメータ用)
const AggregationQuerySchema = z.object({
  key: z.string(),
  start: z.coerce.number().int().optional(), // 文字列を数値に変換
  end: z.coerce.number().int().optional(),
  interval: z.enum(['minute', 'hour', 'day']),
  aggregation: z.enum(['avg', 'max', 'min', 'sum', 'count']),
});

// 集計関数とSQLのマッピング
const aggregationMap = {
  avg: 'AVG(value)',
  max: 'MAX(value)',
  min: 'MIN(value)',
  sum: 'SUM(value)',
  count: 'COUNT(value)',
};

// 時間間隔と strftime フォーマットのマッピング
const intervalFormatMap = {
  minute: '%Y-%m-%d %H:%M:00', // 分単位で丸める
  hour: '%Y-%m-%d %H:00:00',   // 時間単位で丸める
  day: '%Y-%m-%d 00:00:00',    // 日単位で丸める
};

/**
 * 時間ベース集計 API (GET /api/data/aggregated)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queryParams = Object.fromEntries(searchParams.entries());

  // クエリパラメータのバリデーション
  const parseResult = AggregationQuerySchema.safeParse(queryParams);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parseResult.error.errors }, { status: 400 });
  }

  const { key, start, end, interval, aggregation } = parseResult.data;

  // SQL クエリの構築
  const selectedAggregation = aggregationMap[aggregation];
  const selectedIntervalFormat = intervalFormatMap[interval];

  // WHERE句の構築 (key, start, end)
  const conditions = [Prisma.sql`key = ${key}`];
  if (start !== undefined) {
    conditions.push(Prisma.sql`timestamp >= ${start}`);
  }
  if (end !== undefined) {
    conditions.push(Prisma.sql`timestamp <= ${end}`);
  }
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

  try {
    // Prisma.$queryRaw を使用して集計クエリを実行
    // 結果の型は any[] または未知の型になるため、適切にキャストまたは処理が必要
    const result: { interval_start: string; aggregated_value: number }[] = await prisma.$queryRaw`
      SELECT
        strftime(${selectedIntervalFormat}, timestamp, 'unixepoch') AS interval_start,
        ${Prisma.raw(selectedAggregation)} AS aggregated_value
      FROM TimeSeriesData
      ${whereClause}
      GROUP BY interval_start
      ORDER BY interval_start ASC
    `;

    // 結果のタイムスタンプ文字列を Unix タイムスタンプ (秒) に変換
    const formattedResult = result.map(row => ({
      timestamp: Math.floor(new Date(row.interval_start + 'Z').getTime() / 1000), // UTCとして解釈し秒単位に
      value: row.aggregated_value,
    }));

    return NextResponse.json(formattedResult);

  } catch (error) {
    console.error('Error fetching aggregated data:', error);
    return NextResponse.json({ error: 'Failed to fetch aggregated data' }, { status: 500 });
  }
}
