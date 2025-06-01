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

    const previousPlayerPhase = game.player.canRon || game.player.canPon || game.player.canKan;

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
          !(game.player.canRon || game.player.canPon || game.player.canKan /*プレイヤーの大明槓待ち*/) &&
          !previousPlayerPhase) { // プレイヤーがロン/ポン/カンを選択できる状態だった場合はCPUは動かない

        let cpuActionTaken = false;
        const cpuState = game.cpu;
        const opponentState = game.player; // CPUから見た相手はプレイヤー

        // 0. CPU ポン判断 (相手の打牌直後、自分がツモる前)
        // このタイミングでポンするかは、processActionでdiscardが行われた"直後"に決まるべき
        // processAction(playerDiscard) -> updateActionFlags(cpu) で cpu.canPon が設定される。
        // このAPIハンドラでは、その canPon フラグを見て、CPUがポンするかどうかを決める。
        // ただし、現在の action/route.ts の構造では、プレイヤーのアクション後に一連のCPUの動きをシミュレートしている。
        // CPUがポンできるのは「プレイヤーが打牌した後」かつ「CPUがツモる前」。
        // game.lastAction がプレイヤーの discard で、cpu.canPon が true の場合に検討。

        if (game.lastAction?.type === ActionType.Discard && game.lastAction?.tile && cpuState.canPon && opponentState.lastDiscard && isSameTile(opponentState.lastDiscard, game.lastAction.tile)) {
          // ポンするかどうかの簡易的な評価ロジック
          // ここでは、「ポンしたら役がつく、またはシャンテン数が進むならポンする」を実装する
          // (より高度な評価は将来の課題)
          const tileToPon = opponentState.lastDiscard;
          const handAfterPonDraw = [...cpuState.hand]; // ポンした後の手牌は1枚減り、打牌する
                                                    // 正確には、ポンで2枚消費し、打牌する牌を選ぶので、手牌は11枚+打牌候補1枚になる

          // ポンしたと仮定してシャンテン数を計算 (打牌する牌は別途選択)
          const tempHandForPon = [...cpuState.hand];
          let removedForPon = 0;
          const handWithoutPonTiles = tempHandForPon.filter(t => {
            if (isSameTile(t, tileToPon) && removedForPon < 2) {
              removedForPon++;
              return false;
            }
            return true;
          });

          // ポン後の手牌 (打牌前) は12枚になる (13 - 2(ポン) + 1(次の打牌する牌) - 1(打牌) ... ではなく、13 - 2 = 11枚)
          // ここでどの牌を捨てるかによってシャンテン数が変わる。
          // 簡易的に、ポン後の11枚でシャンテン数を評価。 analyzeHandShanten は13枚 or 14枚を期待するので、
          // ダミーの2牌を加えて評価するか、11枚の状態で評価できるロジックが必要。
          // もしくは、ポン後の手牌から1枚捨てた状態を全て試し、最も良くなるかを見る。

          let shouldPon = false;
          // とりあえず常にポンするとする (テストのため)
          // TODO: ここにポンするかどうかのより詳細な判断ロジックを入れる
          // 例: ポンすると役が付く、シャンテン数が進むなど。
          // analyzeHandShanten は13枚か14枚を期待するので、ポンして打牌後の11枚にダミー2枚追加して評価は難しい。
          // ここでは、「ポンできるなら必ずポンする」という最も単純なAIで実装
          if (cpuState.canPon && tileToPon) { // canPon は updateActionFlags で設定済みのはず
             shouldPon = true; // 簡易的に常にポン
          }

          if (shouldPon) {
            game = processAction(game, PlayerID.CPU, { type: ActionType.Pon, targetTile: tileToPon });
            // ポン後はCPUの打牌ターンになるので、この後の打牌ロジックで処理される
            // cpuActionTaken = true; // ポンは打牌とは別のカテゴリのアクションとして扱う
                                  // この後の打牌ロジックが実行されるように cpuActionTaken は true にしない
          }
        }

        // 1. CPU ツモ和了チェック (ポンしなかった場合、またはポンしてツモ番が来た場合)
        if (game.turn === PlayerID.CPU && cpuState.canTsumoAgari) { // game.turn を再確認
          game = processAction(game, PlayerID.CPU, { type: ActionType.TsumoAgari });
          cpuActionTaken = true;
        }

        // 2. CPU カンチェック (ツモ後)
        if (!cpuActionTaken && game.turn === PlayerID.CPU && cpuState.canKan && !cpuState.isRiichi && cpuState.lastDraw) {
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
