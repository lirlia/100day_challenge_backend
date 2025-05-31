import { NextResponse, NextRequest } from "next/server";
import { GameState, PlayerID, GamePhase } from "../../../../lib/mahjong/game_state";
import { Tile, tilesFromStrings, tileFromString, isSameTile } from "../../../../lib/mahjong/tiles";
import { drawTile, getCurrentDora } from "../../../../lib/mahjong/yama";
import { analyzeHandShanten, removeTileFromHand, addTileToHand } from "../../../../lib/mahjong/hand";
import { getActiveGame, setActiveGame } from "../../../../lib/mahjong/game_store";

// CPUの打牌ロジック (超簡易版: ランダムに捨てる)
function getCpuDiscard(cpuHand: Tile[], gameState: GameState): Tile {
  // TODO: もっと賢いAIを実装する (向聴数ベースなど)
  if (cpuHand.length === 0) throw new Error("CPU hand is empty, cannot discard.");
  // ひとまずランダムに1枚選択 (ツモ切りでない手牌から)
  const nonTsumogiriHand = cpuHand.filter(t => !t.isTsumogiri);
  if (nonTsumogiriHand.length > 0) {
    return nonTsumogiriHand[Math.floor(Math.random() * nonTsumogiriHand.length)];
  }
  return cpuHand[Math.floor(Math.random() * cpuHand.length)]; // 全てツモ切りならランダム
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, actionType, tileId } = body;

    if (!gameId || !actionType) {
      return NextResponse.json({ error: "Missing gameId or actionType" }, { status: 400 });
    }

    let gameState = getActiveGame(gameId);
    if (!gameState) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // プレイヤーの打牌処理
    if (actionType === "discard" && gameState.turn === PlayerID.Player && tileId) {
      const discardedTile = tileFromString(tileId);
      if (!discardedTile) {
        return NextResponse.json({ error: "Invalid tileId for discard" }, { status: 400 });
      }

      // プレイヤーの手牌から捨て牌を削除
      const playerHandAfterDiscard = removeTileFromHand(gameState.player.hand, discardedTile);
      if (playerHandAfterDiscard.length === gameState.player.hand.length) { // 牌が見つからなかった
        return NextResponse.json({ error: "Tile not found in player hand" }, { status: 400 });
      }
      gameState.player.hand = playerHandAfterDiscard;
      gameState.player.river.push({ ...discardedTile, isTsumogiri: false }); // isTsumogiri はツモ牌をそのまま捨てた場合true
      gameState.lastActionMessage = `プレイヤーが ${discardedTile.name} を捨てました。`;
      console.log(`[Game Action] ${gameId}: Player discarded ${discardedTile.id}`);

      // TODO: 他プレイヤーがロンできるかチェック (PlayerActionWaitフェーズへ移行)

      // CPUのターンへ
      gameState.turn = PlayerID.CPU;
      gameState.phase = GamePhase.CPUTurnStart;
      gameState.turnCount++;

      // CPUのツモ処理
      const { tile: cpuTsumoTile, updatedYama: yamaAfterCpuTsumo } = drawTile(gameState.yama);
      if (!cpuTsumoTile) {
        // 流局処理 (TODO)
        gameState.phase = GamePhase.RoundEnd;
        gameState.lastActionMessage = "流局しました (山切れ)";
        console.log(`[Game Action] ${gameId}: Round end - Yama empty`);
        setActiveGame(gameId, gameState);
        return NextResponse.json(gameState);
      }
      gameState.yama = yamaAfterCpuTsumo;
      gameState.cpu.hand = addTileToHand(gameState.cpu.hand, { ...cpuTsumoTile, isTsumogiri: true });
      console.log(`[Game Action] ${gameId}: CPU drew ${cpuTsumoTile.id}`);

      // TODO: CPUがツモ和了できるかチェック

      // CPUの打牌処理
      const cpuDiscard = getCpuDiscard(gameState.cpu.hand, gameState);
      gameState.cpu.hand = removeTileFromHand(gameState.cpu.hand, cpuDiscard);
      gameState.cpu.river.push(cpuDiscard);
      gameState.lastActionMessage = `CPUが ${cpuDiscard.name} を捨てました。`;
      console.log(`[Game Action] ${gameId}: CPU discarded ${cpuDiscard.id}`);

      // TODO: プレイヤーがロン・ポン・チー・カンできるかチェック (PlayerActionWaitフェーズへ移行)

      // プレイヤーのターンへ
      gameState.turn = PlayerID.Player;
      gameState.phase = GamePhase.PlayerTurnStart;
      // gameState.turnCount++; // 打牌ごとにカウントなので、ここでは増やさない

      // プレイヤーのツモ処理
      const { tile: playerTsumoTile, updatedYama: yamaAfterPlayerTsumo } = drawTile(gameState.yama);
      if (!playerTsumoTile) {
        // 流局処理 (TODO)
        gameState.phase = GamePhase.RoundEnd;
        gameState.lastActionMessage = "流局しました (山切れ)";
        console.log(`[Game Action] ${gameId}: Round end - Yama empty`);
        setActiveGame(gameId, gameState);
        return NextResponse.json(gameState);
      }
      gameState.yama = yamaAfterPlayerTsumo;
      gameState.player.hand = addTileToHand(gameState.player.hand, { ...playerTsumoTile, isTsumogiri: true });
      gameState.phase = GamePhase.PlayerDiscardWait; // プレイヤーの打牌待ち
      console.log(`[Game Action] ${gameId}: Player drew ${playerTsumoTile.id}`);

      // TODO: プレイヤーがツモ和了・カンできるかチェック

      setActiveGame(gameId, gameState);
      return NextResponse.json(gameState);

    } else {
      return NextResponse.json({ error: "Invalid action or not your turn" }, { status: 400 });
    }

  } catch (error) {
    console.error("Error processing game action:", error);
    if (error instanceof Error) {
        return NextResponse.json({ error: "Failed to process game action: " + error.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to process game action" }, { status: 500 });
  }
}
