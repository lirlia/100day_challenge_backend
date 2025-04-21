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

// ペイロードを安全にパースし、期待する型として返すヘルパー関数
function safeParsePayload<T>(payload: Prisma.JsonValue): T | null {
  if (payload === null || typeof payload !== 'object') {
    // 文字列の場合はパース試行
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload) as T;
      } catch (e) {
        console.error('Failed to parse JSON payload:', payload, e);
        return null;
      }
    }
    // オブジェクトでも文字列でもない場合は null
    console.warn('Payload is not an object or string:', payload);
    return null;
  }
  // すでにオブジェクトの場合はそのまま返す (型アサーションには注意)
  return payload as T;
}

/**
 * 指定されたサイズの空（すべてfalse）の盤面を作成する
 * @param size 盤面のサイズ
 * @returns すべて false の Board
 */
const createEmptyBoard = (size: number): Board => {
  return Array(size).fill(null).map(() => Array(size).fill(false));
};

/**
 * 解けることが保証された初期盤面を生成する。
 * 完成状態（すべてオフ）からランダムにボタンをクリックして作成する。
 * @param size 盤面のサイズ
 * @param difficulty クリックする回数の目安 (多いほど複雑になる傾向)
 * @returns 初期盤面状態
 */
export const createInitialBoard = (size: number = BOARD_SIZE, difficulty: number = 10): Board => {
  let board = createEmptyBoard(size);
  const clicks = Math.floor(Math.random() * difficulty) + Math.max(3, difficulty - 5); // ある程度の最低手数とランダム性を確保

  // 同じ場所を 2 回クリックすると元に戻るので、クリック履歴は不要
  for (let i = 0; i < clicks; i++) {
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    board = toggleLight(board, r, c); // toggleLight は新しい盤面を返す
  }

  // 偶然すべてオフになってしまったら、もう一度中央をクリックしてやり直す
  if (isGameWon(board)) {
    console.log("Initial board generation resulted in a solved state, retrying...");
    const center = Math.floor(size / 2);
    board = toggleLight(board, center, center);
  }

  return board;
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
 * @param event 適用するドメインイベント
 * @returns イベント適用後の新しい盤面状態
 */
export const applyEvent = (board: Board, event: { type: string; payload: Prisma.JsonValue }): Board => {
  switch (event.type) {
    case 'GameInitialized': {
      const parsedPayload = safeParsePayload<GameInitializedPayload>(event.payload);
      if (parsedPayload && parsedPayload.board) {
        // 正しくパースでき、board プロパティが存在すれば返す
        return parsedPayload.board;
      } else {
        console.error('Invalid GameInitialized payload:', event.payload);
        return board; // エラー時は元のボードを返すか、エラーを投げる
      }
    }
    case 'LightToggled': {
      const parsedPayload = safeParsePayload<LightToggledPayload>(event.payload);
      if (parsedPayload && typeof parsedPayload.row === 'number' && typeof parsedPayload.col === 'number') {
        return toggleLight(board, parsedPayload.row, parsedPayload.col);
      } else {
        console.error('Invalid LightToggled payload:', event.payload);
        return board;
      }
    }
    case 'GameWon':
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
 * @throws 初期化イベントが見つからない、またはペイロードが無効な場合
 */
export const buildStateFromEvents = (events: { type: string; payload: Prisma.JsonValue; sequence: number }[], targetSequence?: number): Board => {
  const initEventIndex = events.findIndex(e => e.type === 'GameInitialized');
  if (initEventIndex === -1) {
    throw new Error('GameInitialized event not found in event history');
  }

  // 初期盤面を取得 (パースと検証)
  const initPayload = safeParsePayload<GameInitializedPayload>(events[initEventIndex].payload);
  if (!initPayload || !initPayload.board) {
    throw new Error('Invalid or missing GameInitialized payload for initial board state');
  }
  let currentBoard: Board = initPayload.board;

  const sequenceLimit = targetSequence ?? Number.MAX_SAFE_INTEGER;

  // 初期化イベントの次のイベントから適用を開始し、targetSequence まで進める
  for (let i = initEventIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.sequence > sequenceLimit) {
      break;
    }
    // applyEvent内でペイロードは検証される
    currentBoard = applyEvent(currentBoard, event);
  }

  return currentBoard;
};

// --- Solver Implementation (Gaussian Elimination over GF(2)) ---

/**
 * Lights Out パズルを解くための解法（押すべきボタン）を計算する。
 * ガウスの消去法 (GF(2)) を使用。
 * @param board 現在の盤面状態
 * @returns 解法を示す盤面 (押すべきボタンが true)。解けない場合は null (通常は発生しないはず)。
 */
export const solveLightsOut = (board: Board): Board | null => {
  const size = board.length;
  const n = size * size; // マスの総数 (変数の数)

  // 拡大係数行列 [A|b] を作成
  // A: ボタン j を押したときにマス i が反転するなら A[i][j] = 1
  // b: 現在の盤面状態 (オンなら 1)
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n + 1).fill(0));
  const b: number[] = Array(n).fill(0);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c; // 現在のマス (方程式の行インデックス)
      b[i] = board[r][c] ? 1 : 0; // 右辺 (盤面の状態)

      // ボタン (r, c) を押したときに影響を受けるマスに対応する A の要素を 1 にする
      const positionsAffected = [
        [r, c],
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];

      for (const [pr, pc] of positionsAffected) {
        if (pr >= 0 && pr < size && pc >= 0 && pc < size) {
          const j = pr * size + pc; // 影響を受けるマス (方程式の列インデックス)
          matrix[j][i] = 1; // A[j][i] = 1 (j 行 i 列)
        }
      }
    }
  }

  // b を行列の最後の列に追加
  for (let i = 0; i < n; i++) {
    matrix[i][n] = b[i];
  }

  // ガウスの消去法 (前進消去)
  let rank = 0;
  for (let j = 0; j < n && rank < n; j++) {
    // ピボット選択: j 列目で rank 行以降に 1 がある行を探す
    let pivotRow = rank;
    while (pivotRow < n && matrix[pivotRow][j] === 0) {
      pivotRow++;
    }

    if (pivotRow < n) {
      // ピボット行を rank 行目と交換
      [matrix[rank], matrix[pivotRow]] = [matrix[pivotRow], matrix[rank]];

      // rank 行目以外の行で j 列目が 1 の行に対し、rank 行目を加算 (XOR) して j 列目を 0 にする
      for (let i = 0; i < n; i++) {
        if (i !== rank && matrix[i][j] === 1) {
          for (let k = j; k <= n; k++) {
            matrix[i][k] ^= matrix[rank][k]; // XOR 演算
          }
        }
      }
      rank++;
    }
  }

  // 解の存在チェック (拡大係数行列の rank と係数行列の rank が一致するか)
  for (let i = rank; i < n; i++) {
    if (matrix[i][n] === 1) {
      console.error("Lights Out Solver: No solution exists!");
      return null; // 解なし
    }
  }

  // 後退代入
  const solutionVec: number[] = Array(n).fill(0);
  for (let i = rank - 1; i >= 0; i--) {
    let pivotCol = -1;
    for(let j=0; j<n; ++j) {
      if(matrix[i][j] === 1) {
        pivotCol = j;
        break;
      }
    }

    if(pivotCol !== -1) {
        let sum = 0;
        for (let j = pivotCol + 1; j < n; j++) {
          sum ^= (matrix[i][j] * solutionVec[j]);
        }
        solutionVec[pivotCol] = sum ^ matrix[i][n];
    }
  }

  // 結果を Board 形式に変換
  const solutionBoard: Board = createEmptyBoard(size);
  for (let i = 0; i < n; i++) {
    if (solutionVec[i] === 1) {
      const r = Math.floor(i / size);
      const c = i % size;
      solutionBoard[r][c] = true;
    }
  }

  return solutionBoard;
};
