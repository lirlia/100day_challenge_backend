// オセロの基本的なロジックを実装
export type CellState = 'empty' | 'black' | 'white';
export type Player = 'black' | 'white';

export interface GameState {
  board: CellState[][];
  currentPlayer: Player;
  blackCount: number;
  whiteCount: number;
  gameOver: boolean;
  winner: Player | 'draw' | null;
  validMoves: { row: number; col: number }[];
}

export class ReversiEngine {
  private board: CellState[][];
  private currentPlayer: Player;

  constructor() {
    this.board = this.createInitialBoard();
    this.currentPlayer = 'black'; // 黒が先手
  }

  // 初期盤面を作成
  private createInitialBoard(): CellState[][] {
    const board: CellState[][] = Array(8).fill(null).map(() => Array(8).fill('empty'));

    // 初期配置
    board[3][3] = 'white';
    board[3][4] = 'black';
    board[4][3] = 'black';
    board[4][4] = 'white';

    return board;
  }

  // 現在のゲーム状態を取得
  getGameState(): GameState {
    const validMoves = this.getValidMoves(this.currentPlayer);
    const { blackCount, whiteCount } = this.countStones();
    const gameOver = this.isGameOver();
    const winner = gameOver ? this.getWinner() : null;

    return {
      board: this.board.map(row => [...row]), // ディープコピー
      currentPlayer: this.currentPlayer,
      blackCount,
      whiteCount,
      gameOver,
      winner,
      validMoves,
    };
  }

  // 石の数をカウント
  private countStones(): { blackCount: number; whiteCount: number } {
    let blackCount = 0;
    let whiteCount = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (this.board[row][col] === 'black') blackCount++;
        if (this.board[row][col] === 'white') whiteCount++;
      }
    }

    return { blackCount, whiteCount };
  }

  // 有効な手を取得
  getValidMoves(player: Player): { row: number; col: number }[] {
    const validMoves: { row: number; col: number }[] = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (this.isValidMove(row, col, player)) {
          validMoves.push({ row, col });
        }
      }
    }

    return validMoves;
  }

  // 指定位置に石を置けるかチェック
  isValidMove(row: number, col: number, player: Player): boolean {
    if (row < 0 || row >= 8 || col < 0 || col >= 8) return false;
    if (this.board[row][col] !== 'empty') return false;

    const opponent: Player = player === 'black' ? 'white' : 'black';
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];

    for (const [dr, dc] of directions) {
      let r = row + dr;
      let c = col + dc;
      let hasOpponent = false;

      // 隣接する相手の石をチェック
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === opponent) {
        hasOpponent = true;
        r += dr;
        c += dc;
      }

      // 相手の石の後に自分の石があるかチェック
      if (hasOpponent && r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === player) {
        return true;
      }
    }

    return false;
  }

  // 石を配置し、反転処理を行う
  makeMove(row: number, col: number, player: Player): boolean {
    if (!this.isValidMove(row, col, player)) return false;

    this.board[row][col] = player;
    this.flipStones(row, col, player);
    this.currentPlayer = player === 'black' ? 'white' : 'black';

    return true;
  }

  // 石の反転処理
  private flipStones(row: number, col: number, player: Player): void {
    const opponent: Player = player === 'black' ? 'white' : 'black';
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];

    for (const [dr, dc] of directions) {
      const toFlip: { r: number; c: number }[] = [];
      let r = row + dr;
      let c = col + dc;

      // 反転対象の石を収集
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === opponent) {
        toFlip.push({ r, c });
        r += dr;
        c += dc;
      }

      // 自分の石で挟まれている場合のみ反転
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && this.board[r][c] === player && toFlip.length > 0) {
        for (const { r: fr, c: fc } of toFlip) {
          this.board[fr][fc] = player;
        }
      }
    }
  }

  // ゲーム終了判定
  private isGameOver(): boolean {
    const blackMoves = this.getValidMoves('black');
    const whiteMoves = this.getValidMoves('white');
    return blackMoves.length === 0 && whiteMoves.length === 0;
  }

  // 勝者を判定
  private getWinner(): Player | 'draw' {
    const { blackCount, whiteCount } = this.countStones();
    if (blackCount > whiteCount) return 'black';
    if (whiteCount > blackCount) return 'white';
    return 'draw';
  }

  // プレイヤーをスキップ（有効な手がない場合）
  skipTurn(): void {
    this.currentPlayer = this.currentPlayer === 'black' ? 'white' : 'black';
  }

  // 簡単なAI（ランダム選択）
  getAIMove(player: Player): { row: number; col: number } | null {
    const validMoves = this.getValidMoves(player);
    if (validMoves.length === 0) return null;

    // ランダムな手を選択
    const randomIndex = Math.floor(Math.random() * validMoves.length);
    return validMoves[randomIndex];
  }

  // ゲームをリセット
  reset(): void {
    this.board = this.createInitialBoard();
    this.currentPlayer = 'black';
  }
}
