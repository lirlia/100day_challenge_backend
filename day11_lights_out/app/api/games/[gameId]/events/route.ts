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

  try {
    const events = await prisma.domainEvent.findMany({
      where: { gameId },
      orderBy: { sequence: 'asc' }, // シーケンス順で取得
    });

    if (events.length === 0) {
      // ゲームが存在しない、またはイベントがまだない場合
      // Game Not Found の方が適切かもしれないが、空配列を返す仕様でも良い
      return NextResponse.json([], { status: 404 }); // 空配列と 404 を返す
    }

    // イベント履歴を JSON として返す
    // payload は JSON 文字列として DB に保存されているので、そのまま返す
    // クライアント側で必要に応じてパースする
    return NextResponse.json(events);

  } catch (error) {
    console.error(`Error fetching events for game ${gameId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
