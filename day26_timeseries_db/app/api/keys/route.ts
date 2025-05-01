import { NextResponse } from 'next/server';
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

/**
 * 利用可能なキー一覧取得 API (GET /api/keys)
 */
export async function GET() {
  try {
    const distinctKeys = await prisma.timeSeriesData.findMany({
      select: {
        key: true, // key カラムのみを選択
      },
      distinct: ['key'], // key で重複を除外
      orderBy: {
        key: 'asc', // キーをソート
      },
    });

    // 結果を string の配列に変換
    const keys = distinctKeys.map(item => item.key);

    return NextResponse.json(keys);

  } catch (error) {
    console.error('Error fetching distinct keys:', error);
    return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
  }
}
