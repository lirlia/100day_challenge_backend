import { NextResponse, NextRequest } from "next/server";
import { GameState, PlayerID, GamePhase, GameAction, ActionType, processAction } from "../../../../lib/mahjong/game_state";
import { Tile, tilesFromStrings, tileFromString, isSameTile } from "../../../../lib/mahjong/tiles";
import { drawTile as drawTileFromYamaOriginal, getCurrentDora, drawRinshanTile, Yama } from "../../../../lib/mahjong/yama";
import { analyzeHandShanten, removeTileFromHand, addTileToHand } from "../../../../lib/mahjong/hand";
import { getGame, saveGame } from "../../../../lib/mahjong/game_store";

// drawTileFromYama のラッパーを作成して、シグネチャの不一致を吸収
function drawTileWrapper(yama: Yama): { tile: Tile | null; updatedYama: Yama } {
  return drawTileFromYamaOriginal(yama);
}

const YAOCHUUHAI_IDS = ["1m", "9m", "1s", "9s", "1p", "9p", "ton", "nan", "sha", "pei", "haku", "hatsu", "chun"];

function getCpuDiscard(hand: Tile[], gameState: GameState): Tile {
  if (hand.length === 0) {
    console.error("CPU hand is empty, cannot discard.");
    throw new Error("CPU hand is empty.");
  }

  // 1. 安全そうなヤオ九牌を探す (孤立しているもの)
  const isolatedYaochuuhai = hand.filter(tile =>
    YAOCHUUHAI_IDS.includes(tile.id) &&
    hand.filter(t => Math.abs(t.value - tile.value) <= 2 && t.suit === tile.suit).length === 1 // 周りに他の牌がない
  );
  if (isolatedYaochuuhai.length > 0) {
    return isolatedYaochuuhai[Math.floor(Math.random() * isolatedYaochuuhai.length)];
  }

  // 2. 単純なヤオ九牌
  const yaochuuhai = hand.filter(tile => YAOCHUUHAI_IDS.includes(tile.id));
  if (yaochuuhai.length > 0) {
    return yaochuuhai[Math.floor(Math.random() * yaochuuhai.length)];
  }

  // 3. 上記がなければランダム
  return hand[Math.floor(Math.random() * hand.length)];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, playerId, action } = body as { gameId: string; playerId: PlayerID; action: GameAction };

    if (!gameId || !playerId || !action || !action.type) {
      return NextResponse.json({ message: 'Invalid request parameters' }, { status: 400 });
    }

    let game = getGame(gameId);
    if (!game) {
      return NextResponse.json({ message: 'Game not found' }, { status: 404 });
    }

    // プレイヤーのターンか確認 (アクションによっては不要な場合もある)
    if (game.turn !== playerId && ![ActionType.Ron].includes(action.type)) { // ロンは相手の打牌に対するアクション
      // TODO: カンも相手の打牌に対して可能な場合がある (大明槓)
      // return NextResponse.json({ message: 'Not your turn' }, { status: 403 });
      console.warn(`Action attempted by ${playerId} but current turn is ${game.turn}. Action: ${action.type}`);
      // 一旦許容して進めるが、厳密にはエラーにすべきケースもある
    }

    // ゲームロジックの処理を processAction に委譲
    try {
      game = processAction(game, playerId, action);
    } catch (e: any) {
      console.error("Error processing action in game_state:", e);
      return NextResponse.json({ message: e.message || "Error processing action logic" }, { status: 400 }); // 400 for logical errors
    }

    saveGame(game);
    return NextResponse.json(game);

  } catch (error) {
    console.error("Error in game action API:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
