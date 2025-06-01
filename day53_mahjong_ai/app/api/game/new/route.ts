import { NextResponse } from "next/server";
import { createYama, dealInitialHands, getCurrentDora } from "../../../../lib/mahjong/yama"; // パスを修正
import { createInitialGameState, GameState } from "../../../../lib/mahjong/game_state"; // GameState をインポート
import { saveGame } from "@/lib/mahjong/game_store"; // setActiveGame を saveGame に変更
import { v4 as uuidv4 } from 'uuid'; // ゲームID生成用

// インメモリでゲーム状態を保持 (本番ではDBなどを使う)
// TODO: 将来的にはDBやキャッシュに移行
const activeGames: Map<string, GameState> = new Map();

export async function GET() {
  try {
    const gameId = uuidv4();
    const initialYama = createYama();
    const { playerHand, cpuHand, updatedYama: yamaAfterDeal } = dealInitialHands(initialYama);

    // 正しいドラを取得
    const currentDora = getCurrentDora(yamaAfterDeal);

    const initialGameState = createInitialGameState(gameId, playerHand, cpuHand, yamaAfterDeal, currentDora);

    saveGame(initialGameState);

    console.log(`[Game New] Created new game: ${gameId}`);
    console.log(`Player Hand: ${playerHand.map(t => t.id)}`);
    console.log(`CPU Hand: ${cpuHand.map(t => t.id)}`);
    console.log(`Dora Indicators: ${yamaAfterDeal.doraIndicators.map(t => t.id)}`);
    console.log(`Actual Dora: ${currentDora.map(t => t.id)}`);

    return NextResponse.json(initialGameState);
  } catch (error) {
    console.error("Error creating new game:", error);
    return NextResponse.json({ error: "Failed to create new game" }, { status: 500 });
  }
}
