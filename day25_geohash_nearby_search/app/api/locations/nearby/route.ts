import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import ngeohash from 'ngeohash';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const precision = searchParams.get('precision');

    if (!lat || !lng || !precision) {
      return NextResponse.json(
        { error: 'Missing required query parameters: lat, lng, precision' },
        { status: 400 }
      );
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const geohashPrecision = parseInt(precision, 10);

    if (
      isNaN(latitude) ||
      isNaN(longitude) ||
      isNaN(geohashPrecision) ||
      geohashPrecision < 1 ||
      geohashPrecision > 9 // 保存精度に合わせるか、より広く取るか
    ) {
      return NextResponse.json(
        { error: 'Invalid query parameters: lat, lng must be numbers, precision must be between 1 and 9' },
        { status: 400 }
      );
    }

    // 指定地点のGeohashプレフィックスを計算
    const targetGeohashPrefix = ngeohash.encode(latitude, longitude, geohashPrecision);

    // プレフィックスが一致する地点を検索
    // 注意: この方法では、指定した精度ブロック内のみを検索します。
    // より広い範囲（隣接ブロック含む）の検索が必要な場合は、ngeohash.neighbors() などを使って検索範囲を広げる必要があります。
    const nearbyLocations = await prisma.location.findMany({
      where: {
        geohash: {
          startsWith: targetGeohashPrefix,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(nearbyLocations);
  } catch (error) {
    console.error('Error fetching nearby locations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch nearby locations' },
      { status: 500 }
    );
  }
}
