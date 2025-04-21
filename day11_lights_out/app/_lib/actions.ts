'use server';

import prisma from '../../lib/db'; // lib/db.ts からインポート
import { createInitialBoard, BOARD_SIZE } from './gameLogic';

/**
 * 新しいゲームを作成し、初期イベントを保存して gameId を返すサーバーアクション
 */
export async function createNewGame(): Promise<string> {
  const initialBoard = createInitialBoard(BOARD_SIZE);
  // インポートした prisma インスタンスを使用
  const newGame = await prisma.game.create({
    data: {
      currentBoardState: JSON.stringify(initialBoard),
      events: {
        create: [
          {
            sequence: 0,
            type: 'GameInitialized',
            payload: JSON.stringify({ board: initialBoard }),
          },
        ],
      },
    },
    select: {
      id: true,
    },
  });
  return newGame.id;
}
