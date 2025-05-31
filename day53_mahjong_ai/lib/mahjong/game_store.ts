import { GameState } from "./game_state";

// インメモリでゲーム状態を保持
const activeGames: Map<string, GameState> = new Map();

export function getActiveGame(gameId: string): GameState | undefined {
  return activeGames.get(gameId);
}

export function setActiveGame(gameId: string, gameState: GameState): void {
  activeGames.set(gameId, gameState);
}

export function removeActiveGame(gameId: string): void {
  activeGames.delete(gameId);
}

// (デバッグ用など) 全てのゲームを取得
export function getAllActiveGames(): Map<string, GameState> {
    return activeGames;
}
