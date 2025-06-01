import { GameState } from "./game_state";

// インメモリでゲーム状態を保持
const activeGames: Map<string, GameState> = new Map();

export function getGame(gameId: string): GameState | undefined {
  return activeGames.get(gameId);
}

export function saveGame(game: GameState): void {
  activeGames.set(game.gameId, game);
}

export function removeGame(gameId: string): void {
  activeGames.delete(gameId);
}

// (デバッグ用など) 全てのゲームを取得
export function getAllActiveGames(): Map<string, GameState> {
    return activeGames;
}
