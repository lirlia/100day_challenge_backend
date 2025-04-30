import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import ngeohash from 'ngeohash';

const GEOHASH_PRECISION = 9; // 保存するGeohashの精度（文字数）

// 全地点取得
export async function GET() {
  try {
    const locations = await prisma.location.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return NextResponse.json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 });
  }
}

// 新規地点登録
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, latitude, longitude } = body;

    if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json({ error: 'Missing required fields: name, latitude, longitude' }, { status: 400 });
    }

    // Geohashを計算
    const geohash = ngeohash.encode(latitude, longitude, GEOHASH_PRECISION);

    const newLocation = await prisma.location.create({
      data: {
        name,
        latitude,
        longitude,
        geohash,
      },
    });

    return NextResponse.json(newLocation, { status: 201 });
  } catch (error) {
    console.error('Error creating location:', error);
    // JSON パースエラーなども考慮
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create location' }, { status: 500 });
  }
}
