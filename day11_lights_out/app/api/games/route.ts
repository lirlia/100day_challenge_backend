import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { createInitialBoard, BOARD_SIZE } from '@/app/_lib/gameLogic';
import cuid from 'cuid';

export async function POST() {
  try {
    const gameId = cuid(); // 新しいゲームIDを生成
    const initialBoard = createInitialBoard(BOARD_SIZE);

    // GameInitialized イベントを作成して保存
    await prisma.domainEvent.create({
      data: {
        gameId: gameId,
        type: 'GameInitialized',
        payload: { board: initialBoard }, // Prisma が Json 型にシリアライズしてくれる
        sequence: 1, // 最初のイベント
      },
    });

    console.log(`[Game ${gameId}] New game started.`);

    // 新しいゲームIDを返す
    return NextResponse.json({ gameId });
  } catch (error) {
    console.error('Error creating new game:', error);
    return NextResponse.json({ error: 'Failed to create new game' }, { status: 500 });
  }
}
