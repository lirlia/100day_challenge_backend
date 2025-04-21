import { Prisma, DomainEvent } from '../generated/prisma';

export type Board = boolean[][];
export const BOARD_SIZE = 5;

// イベントペイロードの型定義
export type GameInitializedPayload = { board: Board };
export type LightToggledPayload = { row: number; col: number };
export type GameWonPayload = Record<string, never>; // ペイロードなし

// DomainEvent モデルの payload に対応する型
export type DomainEventPayload = GameInitializedPayload | LightToggledPayload | GameWonPayload;

// ドメインイベントの型 (Prisma.DomainEventCreateInput と組み合わせる想定)
export type GameEvent = {
  type: 'GameInitialized';
  payload: GameInitializedPayload;
} | {
  type: 'LightToggled';
  payload: LightToggledPayload;
} | {
  type: 'GameWon';
  payload: GameWonPayload;
};

// DB から取得した DomainEvent を型付けするためのヘルパー
// payload は Json 型なので as でキャストが必要
export type PersistedGameEvent = Omit<DomainEvent, 'payload'> & GameEvent;

/**
 * 指定されたサイズの空（すべてfalse）の盤面を作成する
 * @param size 盤面のサイズ
 * @returns すべて false の Board
 */
const createEmptyBoard = (size: number): Board => {
  return Array(size).fill(null).map(() => Array(size).fill(false));
};

/**
 * ランダムな初期盤面を生成する (クリア可能な保証はない簡易版)
 * ※ 本来は解が存在するパターンを生成すべきだが、今回は簡略化
 * @param size 盤面のサイズ
 * @returns ランダムにライトが点灯した Board
 */
export const createInitialBoard = (size: number = BOARD_SIZE): Board => {
  const board = createEmptyBoard(size);
  // 簡単にするため、中央のプラス形状を初期状態とする
  const center = Math.floor(size / 2);
  board[center][center] = true;
  board[center - 1][center] = true;
  board[center + 1][center] = true;
  board[center][center - 1] = true;
  board[center][center + 1] = true;
  return board;
  // 以下はランダム版の例 (クリア不能な場合がある)
  // return board.map(row => row.map(() => Math.random() < 0.3));
};

/**
 * 指定された位置のライトとその隣接ライトの状態を反転させる
 * @param board 現在の盤面
 * @param row クリックされた行
 * @param col クリックされた列
 * @returns 状態が反転した新しい Board (元の Board は変更しない)
 */
export const toggleLight = (board: Board, row: number, col: number): Board => {
  const newBoard = board.map(r => [...r]); // ディープコピー
  const size = newBoard.length;

  const positionsToToggle = [
    [row, col],
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ];

  for (const [r, c] of positionsToToggle) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      newBoard[r][c] = !newBoard[r][c];
    }
  }

  return newBoard;
};

/**
 * 現在の盤面がクリア状態（すべて消灯）か判定する
 * @param board 判定する盤面
 * @returns クリアしていれば true, そうでなければ false
 */
export const isGameWon = (board: Board): boolean => {
  return board.every(row => row.every(light => !light));
};

/**
 * 単一のドメインイベントを現在の盤面状態に適用する
 * @param board 現在の盤面状態
 * @param event 適用するドメインイベント (PersistedGameEvent 想定)
 * @returns イベント適用後の新しい盤面状態
 */
export const applyEvent = (board: Board, event: { type: string; payload: Prisma.JsonValue }): Board => {
  switch (event.type) {
    case 'GameInitialized':
      // GameInitialized イベントは初期状態を定義するため、通常は buildStateFromEvents の開始点
      // ここで適用される場合は、既存のボードを上書きする
      // payload が期待する型であることを確認 (本来はバリデーションが必要)
      return (event.payload as GameInitializedPayload).board;
    case 'LightToggled': {
      // payload が期待する型であることを確認
      const { row, col } = event.payload as LightToggledPayload;
      return toggleLight(board, row, col);
    }
    case 'GameWon':
      // GameWon イベントは状態遷移に影響しないマーカーとして扱う
      return board;
    default:
      console.warn(`Unknown event type: ${event.type}`);
      return board;
  }
};

/**
 * イベント履歴から特定のシーケンスまでの盤面状態を構築（再現）する
 * @param events イベント履歴 (シーケンス順にソート済みであること)
 * @param targetSequence 再現したい状態の最終イベントシーケンス番号 (指定しない場合は最新状態)
 * @returns 指定されたシーケンスまでのイベントを適用した盤面状態
 * @throws 初期化イベントが見つからない場合
 */
export const buildStateFromEvents = (events: { type: string; payload: Prisma.JsonValue; sequence: number }[], targetSequence?: number): Board => {
  const initEventIndex = events.findIndex(e => e.type === 'GameInitialized');
  if (initEventIndex === -1) {
    throw new Error('GameInitialized event not found');
  }

  let board = (events[initEventIndex].payload as GameInitializedPayload).board;
  const sequenceLimit = targetSequence ?? Number.MAX_SAFE_INTEGER;

  // 初期化イベントの次のイベントから適用を開始し、targetSequence まで進める
  for (let i = initEventIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.sequence > sequenceLimit) {
      break;
    }
    board = applyEvent(board, event);
  }

  return board;
};
