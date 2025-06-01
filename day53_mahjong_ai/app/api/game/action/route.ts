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

function getCpuDiscard(cpuHand: Tile[], gameState: GameState): Tile {
  if (cpuHand.length === 0) {
    console.error("CPU hand is empty, cannot discard.");
    throw new Error("CPU hand is empty.");
  }

  // 常に14枚手牌で分析 (ツモ後打牌前の想定)
  const currentCpuState = gameState.cpu;
  let bestDiscardCandidate: Tile = cpuHand[Math.floor(Math.random() * cpuHand.length)]; // デフォルトはランダム
  let minShanten = Infinity;

  // 各牌を捨てた場合の向聴数を評価
  for (const tileToDiscard of cpuHand) {
    const tempHand = removeTileFromHand([...cpuHand], tileToDiscard);
    const analysis = analyzeHandShanten(tempHand, currentCpuState.melds);

    if (analysis.shanten < minShanten) {
      minShanten = analysis.shanten;
      bestDiscardCandidate = tileToDiscard;
    } else if (analysis.shanten === minShanten) {
      // 同程度の向聴数なら、ヤオ九牌や孤立牌を優先して捨てる
      // (より詳細な評価ロジックをここに追加可能)
      const isCurrentCandidateYaochu = YAOCHUUHAI_IDS.includes(bestDiscardCandidate.id);
      const isNewCandidateYaochu = YAOCHUUHAI_IDS.includes(tileToDiscard.id);

      if (!isCurrentCandidateYaochu && isNewCandidateYaochu) {
        bestDiscardCandidate = tileToDiscard; // 新しい候補がヤオ九牌ならそちらを優先
      } else if (isCurrentCandidateYaochu === isNewCandidateYaochu) {
        // 両方ヤオ九牌、または両方中張牌の場合、より孤立しているものを探す (簡易)
        const currentCandidateIsolatedScore = tempHand.filter(t => Math.abs(t.value - bestDiscardCandidate.value) <= 2 && t.suit === bestDiscardCandidate.suit).length;
        const newCandidateIsolatedScore = tempHand.filter(t => Math.abs(t.value - tileToDiscard.value) <= 2 && t.suit === tileToDiscard.suit).length;
        if (newCandidateIsolatedScore < currentCandidateIsolatedScore) {
            bestDiscardCandidate = tileToDiscard;
        }
      }
    }
  }
  return bestDiscardCandidate;
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

      // プレイヤーのアクション後、CPUのターンが回ってくる場合がある
      // (例: プレイヤー打牌 -> CPUツモ -> CPU打牌 -> プレイヤーのツモ)
      // ここで processAction の結果、game.turn が CPU になっていて、
      // game.phase が Playing の場合、CPUの自動アクションを実行する。
      // ただし、プレイヤーのロン/ポン待ちの場合はCPUは動かない。
      if (game.turn === PlayerID.CPU && game.phase === GamePhase.Playing &&
          !(game.player.canRon || game.player.canPon || game.player.canKan /*プレイヤーの大明槓待ち*/) ) {

        let cpuActionTaken = false;
        const cpuState = game.cpu;

        // 1. CPU ツモ和了チェック
        if (cpuState.canTsumoAgari) {
          game = processAction(game, PlayerID.CPU, { type: ActionType.TsumoAgari });
          cpuActionTaken = true;
        }

        // 2. CPU カンチェック (ツモ後) -> 打牌前に処理 (暗槓・加槓)
        if (!cpuActionTaken && cpuState.canKan && !cpuState.isRiichi && cpuState.lastDraw) { // リーチしてない場合のみ
            // 可能なカンを探す (暗槓優先、次に加槓)
            const counts = new Map<string, Tile[]>();
            for (const tile of cpuState.hand) {
                const tileList = counts.get(tile.id) || [];
                tileList.push(tile);
                counts.set(tile.id, tileList);
            }
            let kanAction: GameAction | null = null;
            // 暗槓
            for (const [tileId, tileList] of counts.entries()) {
                if (tileList.length === 4) {
                    kanAction = { type: ActionType.Kan, tile: tileList[0]!, meldType: 'ankan' };
                    break;
                }
            }
            // 加槓 (暗槓がなければ)
            if (!kanAction) {
                for (const meld of cpuState.melds) {
                    if (meld.type === 'koutsu' && meld.isOpen) {
                        const tileInHand = cpuState.hand.find(t => isSameTile(t, meld.tiles[0]));
                        if (tileInHand) {
                           kanAction = { type: ActionType.Kan, tile: tileInHand, meld: meld, meldType: 'kakan'};
                           break;
                        }
                    }
                }
            }
            if (kanAction) {
                game = processAction(game, PlayerID.CPU, kanAction);
                // カン後、再度CPUの打牌処理が必要 (processAction(Kan)の中で手番はCPUのままのはず)
                // このifブロックの最後に打牌処理があるので、そこで処理される
                cpuActionTaken = true; // カンもアクションとみなす
            }
        }


        // 3. CPU リーチチェック (ツモ後、カン後)
        // カンした場合は、その後の手牌でリーチできるか再評価が必要だが、ここではカンしたら打牌に進む
        if (!cpuActionTaken && cpuState.canRiichi && cpuState.score >= 1000 && cpuState.melds.every(m => !m.isOpen)) {
          // リーチ宣言牌を選択 (getCpuDiscard を利用)
          const tileToDiscardForRiichi = getCpuDiscard(cpuState.hand, game); // gameState を渡す
          if (tileToDiscardForRiichi) {
            game = processAction(game, PlayerID.CPU, { type: ActionType.Riichi, tileToDiscard: tileToDiscardForRiichi });
            cpuActionTaken = true;
          }
        }

        // 4. CPU 打牌 (ツモ和了/カン/リーチしなかった場合)
        if (game.turn === PlayerID.CPU && game.phase === GamePhase.Playing) { // gameの状態が変わりうるので再チェック
            const cpuHandForDiscard = game.cpu.hand; // 最新の手牌
            if (cpuHandForDiscard.length > 0) { // 手牌がある場合のみ打牌
                const cpuDiscardTile = getCpuDiscard(cpuHandForDiscard, game);
                if (cpuDiscardTile) {
                    game = processAction(game, PlayerID.CPU, { type: ActionType.Discard, tile: cpuDiscardTile });
                    // cpuActionTaken = true; // 打牌は必ず行われる想定
                } else {
                    console.error("CPU discard tile is null, should not happen if hand is not empty.");
                }
            } else if (cpuHandForDiscard.length === 0 && !game.winner) {
                // 手牌が0枚になるのは和了か、ありえない状況(カン後など枚数調整ミス)
                 console.error("CPU hand is empty, but no winner. This should not happen.");
            }
        }
      }
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
