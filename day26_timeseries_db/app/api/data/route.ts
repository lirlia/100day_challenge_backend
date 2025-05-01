import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../generated/prisma';
import { z } from 'zod';

const prisma = new PrismaClient();

// Zod スキーマ定義
const DataInputSchema = z.object({
  key: z.string(),
  timestamp: z.number().int(),
  value: z.number(),
});

const DataInputArraySchema = z.array(DataInputSchema);

/**
 * データ登録 API (POST /api/data)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 単一データか配列かを判定してパース
    const parseResult = DataInputSchema.safeParse(body);
    let dataToCreate: z.infer<typeof DataInputSchema>[] = [];

    if (parseResult.success) {
      dataToCreate.push(parseResult.data);
    } else {
      const arrayParseResult = DataInputArraySchema.safeParse(body);
      if (arrayParseResult.success) {
        dataToCreate = arrayParseResult.data;
      } else {
        console.error('Invalid input data:', parseResult.error, arrayParseResult.error);
        return NextResponse.json({ error: 'Invalid input data format' }, { status: 400 });
      }
    }

    if (dataToCreate.length === 0) {
       return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    const result = await prisma.timeSeriesData.createMany({
      data: dataToCreate,
      // skipDuplicates: true, // SQLiteではサポートされていないため削除
    });

    console.log(`Inserted ${result.count} data points.`);
    return NextResponse.json({ count: result.count }, { status: 201 });

  } catch (error) {
    console.error('Error inserting data:', error);
    return NextResponse.json({ error: 'Failed to insert data' }, { status: 500 });
  }
}

/**
 * 時間範囲データ取得 API (GET /api/data)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');

  if (!key) {
    return NextResponse.json({ error: 'Missing required parameter: key' }, { status: 400 });
  }

  const start = startStr ? parseInt(startStr, 10) : undefined;
  const end = endStr ? parseInt(endStr, 10) : undefined;

  if (startStr && isNaN(start as number)) {
    return NextResponse.json({ error: 'Invalid parameter: start (must be integer)' }, { status: 400 });
  }
  if (endStr && isNaN(end as number)) {
    return NextResponse.json({ error: 'Invalid parameter: end (must be integer)' }, { status: 400 });
  }

  try {
    const data = await prisma.timeSeriesData.findMany({
      where: {
        key: key,
        timestamp: {
          gte: start, // >= start (undefinedの場合は無視される)
          lte: end,   // <= end (undefinedの場合は無視される)
        },
      },
      orderBy: {
        timestamp: 'asc', // 時系列順にソート
      },
    });

    return NextResponse.json(data);

  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
