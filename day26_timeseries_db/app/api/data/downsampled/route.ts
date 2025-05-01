import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '../../../generated/prisma';
import { z } from 'zod';

const prisma = new PrismaClient();

// Zod スキーマ定義 (クエリパラメータ用)
const DownsamplingQuerySchema = z.object({
  key: z.string(),
  start: z.coerce.number().int().optional(),
  end: z.coerce.number().int().optional(),
  method: z.enum(['every_nth', 'aggregate']),
  factor: z.coerce.number().int().positive(), // N番目 or 集計間隔(秒)
});

// 集計関数とSQLのマッピング (aggregate メソッド用)
const aggregationMap = {
  avg: 'AVG(value)', // デフォルトは平均値とする
};

/**
 * ダウンサンプリング API (GET /api/data/downsampled)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const queryParams = Object.fromEntries(searchParams.entries());

  // クエリパラメータのバリデーション
  const parseResult = DownsamplingQuerySchema.safeParse(queryParams);
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parseResult.error.errors }, { status: 400 });
  }

  const { key, start, end, method, factor } = parseResult.data;

  // WHERE句の構築 (共通)
  const conditions = [Prisma.sql`key = ${key}`];
  if (start !== undefined) {
    conditions.push(Prisma.sql`timestamp >= ${start}`);
  }
  if (end !== undefined) {
    conditions.push(Prisma.sql`timestamp <= ${end}`);
  }
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

  try {
    let result: { timestamp: number; value: number }[] = [];

    if (method === 'every_nth') {
      // ウィンドウ関数 ROW_NUMBER() を使用して N 件ごと (`factor`) に抽出
      const rawResult: { timestamp: number; value: number }[] = await prisma.$queryRaw`
        SELECT timestamp, value
        FROM (
          SELECT
            timestamp,
            value,
            ROW_NUMBER() OVER (ORDER BY timestamp ASC) as rn
          FROM TimeSeriesData
          ${whereClause}
        )
        WHERE rn % ${factor} = 1 -- N番目ごとのデータを抽出 (rn=1, N+1, 2N+1, ...)
        ORDER BY timestamp ASC
      `;
      result = rawResult;

    } else if (method === 'aggregate') {
      // 指定した時間間隔 (`factor` 秒) で集計 (ここでは平均値)
      // Unixタイムスタンプを factor で整数除算してグルーピングキーとする
      const rawResult: { aggregated_value: number, time_group: number }[] = await prisma.$queryRaw`
        SELECT
          AVG(value) AS aggregated_value,
          (timestamp / ${factor}) AS time_group -- 整数除算でグループ化
        FROM TimeSeriesData
        ${whereClause}
        GROUP BY time_group
        ORDER BY time_group ASC
      `;
      // 結果の time_group (整数) を代表タイムスタンプ (グループの開始時刻) に変換
      result = rawResult.map(row => ({
        timestamp: Number(row.time_group) * factor,
        value: row.aggregated_value
      }));
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error fetching downsampled data:', error);
    return NextResponse.json({ error: 'Failed to fetch downsampled data' }, { status: 500 });
  }
}
