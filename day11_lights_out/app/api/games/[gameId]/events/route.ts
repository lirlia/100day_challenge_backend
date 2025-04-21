import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Route Segment Config
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params: rawParams }: { params: { gameId: string } }
) {
  const params = await rawParams;
  const gameId = params.gameId;

  if (!gameId) {
    return NextResponse.json({ error: 'Game ID is required' }, { status: 400 });
  }

  try {
    const events = await prisma.domainEvent.findMany({
      where: { gameId },
      orderBy: { sequence: 'asc' }, // シーケンス順で取得
    });

    // イベントが見つからなくても 200 OK で空配列を返す
    // if (events.length === 0) {
      // return NextResponse.json([], { status: 404 }); // 404 にしない
    // }

    // payload は JSON 型 (Prisma が自動でパース/シリアライズするはず)
    return NextResponse.json(events);

  } catch (error) {
    console.error(`Error fetching events for game ${gameId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
