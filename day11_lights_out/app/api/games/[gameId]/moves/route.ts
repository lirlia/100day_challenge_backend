import { NextResponse, NextRequest } from 'next/server';
import prisma from '@/lib/db';
import {
  buildStateFromEvents,
  toggleLight,
  isGameWon,
  PersistedGameEvent,
  LightToggledPayload,
} from '@/app/_lib/gameLogic';
import { Prisma } from '@/app/generated/prisma';

// Route Segment Config - 動的ルートを強制
// (params を使うために必要になる場合がある)
export const dynamic = 'force-dynamic';

// Request の Body の型定義
interface RequestBody {
  row: number;
  col: number;
}

export async function POST(
  request: NextRequest,
  { params: rawParams }: { params: { gameId: string } }
) {
  const params = await rawParams;
  const gameId = params.gameId;

  let requestBody: RequestBody;
  try {
    // Next.js 15 以降では await が必要になる可能性がある
    // requestBody = await request.json();
    // 現状のバージョンでは await なしで動作する想定
    requestBody = await request.json();
  } catch (error) {
    console.error('Invalid request body:', error);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { row, col } = requestBody;

  if (
    typeof row !== 'number' ||
    typeof col !== 'number' ||
    row < 0 ||
    col < 0
    // BOARD_SIZE チェックも追加した方がより堅牢
  ) {
    return NextResponse.json({ error: 'Invalid row or col' }, { status: 400 });
  }

  try {
    // トランザクションを開始して一貫性を保証
    const result = await prisma.$transaction(async (tx) => {
      // 1. 現在のゲームの最新イベントシーケンスを取得
      const latestEvent = await tx.domainEvent.findFirst({
        where: { gameId },
        orderBy: { sequence: 'desc' },
      });

      if (!latestEvent) {
        throw new Error('Game not found or no events');
      }

      // すでにゲームが終了しているかチェック (GameWon イベントがあるか)
      if (latestEvent.type === 'GameWon') {
        console.log(`[Game ${gameId}] Attempted move on completed game.`);
        // throw new Error('Game already completed'); // エラーにするか、無視するかは要件次第
        // 今回は無視して現在のシーケンスを返す
        return { latestSequence: latestEvent.sequence };
      }

      const currentSequence = latestEvent.sequence;
      const nextSequence = currentSequence + 1;

      // 2. LightToggled イベントを作成・保存
      const toggleEventPayload: LightToggledPayload = { row, col };
      await tx.domainEvent.create({
        data: {
          gameId,
          type: 'LightToggled',
          payload: toggleEventPayload as unknown as Prisma.JsonObject, // Prisma.JsonValue or Prisma.JsonObject depending on prisma version
          sequence: nextSequence,
        },
      });

      console.log(`[Game ${gameId}] Event ${nextSequence}: LightToggled (${row}, ${col})`);

      // 3. ゲームがクリアされたかチェック
      //    最新の状態をイベントから再構築して判定する必要がある
      const allEvents = await tx.domainEvent.findMany({
        where: { gameId },
        orderBy: { sequence: 'asc' },
      });

      // toggle イベントを含めた状態で盤面を構築
      const boardAfterToggle = buildStateFromEvents(allEvents);

      let finalSequence = nextSequence;

      if (isGameWon(boardAfterToggle)) {
        // 4. クリアした場合、GameWon イベントを作成・保存
        const wonSequence = nextSequence + 1;
        await tx.domainEvent.create({
          data: {
            gameId,
            type: 'GameWon',
            payload: {}, // ペイロードなし
            sequence: wonSequence,
          },
        });
        finalSequence = wonSequence;
        console.log(`[Game ${gameId}] Event ${wonSequence}: GameWon`);
      }

      // 成功した場合、最新のイベントシーケンス番号を返す
      return { latestSequence: finalSequence };
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error(`Error processing move for game ${gameId}:`, error);
    // エラー内容に応じて適切なステータスコードを返す
    if (error instanceof Error && error.message.includes('Game not found')) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to process move' }, { status: 500 });
  }
}
