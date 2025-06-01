import { NextResponse, NextRequest } from "next/server";
import { GameState, PlayerID, GamePhase, GameAction, ActionType, processAction } from "../../../../lib/mahjong/game_state";
import { Tile, tilesFromStrings, tileFromString, isSameTile, TileSuit, HonorType } from "../../../../lib/mahjong/tiles";
import { drawTile as drawTileFromYamaOriginal, getCurrentDora, drawRinshanTile, Yama } from "../../../../lib/mahjong/yama";
import { analyzeHandShanten, removeTileFromHand, addTileToHand } from "../../../../lib/mahjong/hand";
import { getGame, saveGame } from "../../../../lib/mahjong/game_store";

// drawTileFromYama のラッパーを作成して、シグネチャの不一致を吸収
function drawTileWrapper(yama: Yama): { tile: Tile | null; updatedYama: Yama } {
  return drawTileFromYamaOriginal(yama);
}

const YAOCHUUHAI_IDS = ["1m", "9m", "1s", "9s", "1p", "9p", "ton", "nan", "sha", "pei", "haku", "hatsu", "chun"];

// CPUの打牌選択ロジック (game_state を引数に追加)
function getCpuDiscard(cpuHand: Tile[], gameState: GameState): Tile {
  if (cpuHand.length === 0) {
    console.error("CPU hand is empty, cannot discard.");
    throw new Error("CPU hand is empty.");
  }

  const opponentState = gameState.player; // CPUから見た相手はプレイヤー
  const ownState = gameState.cpu;

  // 相手がリーチしている場合の安全牌選択
  if (opponentState.isRiichi) {
    const opponentRiver = opponentState.river.map(r => r.id);
    const safeTiles: Tile[] = [];

    // 1. 現物 (相手の捨て牌)
    for (const tile of cpuHand) {
      if (opponentRiver.includes(tile.id)) {
        safeTiles.push(tile);
      }
    }
    if (safeTiles.length > 0) {
      return safeTiles[Math.floor(Math.random() * safeTiles.length)];
    }

    // 2. スジ牌 (1-4-7, 2-5-8, 3-6-9) - 簡易版
    const sujiCandidates: Tile[] = [];
    const opponentDiscardValuesBySuit: { [suit: string]: number[] } = {};
    opponentState.river.forEach(t => {
      if (t.suit !== TileSuit.JIHAI) {
        if (!opponentDiscardValuesBySuit[t.suit]) opponentDiscardValuesBySuit[t.suit] = [];
        opponentDiscardValuesBySuit[t.suit].push(t.value as number);
      }
    });

    for (const tile of cpuHand) {
      if (tile.suit !== TileSuit.JIHAI) {
        const suit = tile.suit;
        const value = tile.value as number;
        const discardedValuesInSuit = opponentDiscardValuesBySuit[suit] || [];

        if (discardedValuesInSuit.includes(value - 3) || discardedValuesInSuit.includes(value + 3)) { // 1-4, 4-7, 2-5, 5-8, 3-6, 6-9
          sujiCandidates.push(tile);
        }
      }
    }
    if (sujiCandidates.length > 0) {
      return sujiCandidates[Math.floor(Math.random() * sujiCandidates.length)];
    }

    // 3. 壁（カベ）の考慮
    const kabeCandidates: Tile[] = [];
    const allVisibleTiles = [
      ...cpuHand,
      ...opponentState.river,
      ...ownState.river, // 自分の河も考慮
      ...opponentState.melds.flatMap(m => m.tiles),
      ...ownState.melds.flatMap(m => m.tiles),
      gameState.yama.doraIndicators[0], // ドラ表示牌
      // TODO: カンドラ表示牌も追加 (gameState.yama.kanDoraIndicators)
    ];

    for (const tile of cpuHand) {
      if (tile.suit !== TileSuit.JIHAI) {
        const suit = tile.suit;
        const value = tile.value as number;
        let isKabeSafe = false;

        // 例: 7が4枚見えていれば8,9は比較的安全 (ノーチャンスカベ)
        // 6が4枚見えていれば、8は比較的安全 (ワンチャンスカベの内スジ)
        // 5が4枚見えていれば、7は比較的安全 (ワンチャンスカベの内スジ)
        // 4が4枚見えていれば、2,6は比較的安全
        // 3が4枚見えていれば、1,5は比較的安全
        // 2が4枚見えていれば、1,4は比較的安全
        // 1が4枚見えていれば、2,3は比較的安全 (1に対するカベはあまり意味がないが、一応)

        const countVisible = (s: TileSuit, v: number) => allVisibleTiles.filter(t => t.suit === s && t.value === v).length;

        if (value === 9) {
            if (countVisible(suit, 7) === 4 || countVisible(suit, 8) === 4) isKabeSafe = true;
        } else if (value === 8) {
            if (countVisible(suit, 7) === 4 || countVisible(suit, 6) === 4) isKabeSafe = true;
        } else if (value === 7) {
            if (countVisible(suit, 5) === 4 || countVisible(suit, 6) === 4) isKabeSafe = true;
        } else if (value === 6) {
            if (countVisible(suit, 4) === 4 || countVisible(suit, 5) === 4 || (countVisible(suit,8) === 4 && countVisible(suit,9) === 4) /* 7を跨ぐ場合 */) isKabeSafe = true;
        } else if (value === 5) {
            // 5は複雑なので一旦スキップ
        } else if (value === 4) {
            if (countVisible(suit, 2) === 4 || countVisible(suit, 3) === 4 || (countVisible(suit,1) === 4 && countVisible(suit,2) === 4) /* 3を跨ぐ場合 */) isKabeSafe = true;
        } else if (value === 3) {
            if (countVisible(suit, 1) === 4 || countVisible(suit, 2) === 4) isKabeSafe = true;
        } else if (value === 2) {
            if (countVisible(suit, 1) === 4 || countVisible(suit, 3) === 4) isKabeSafe = true;
        } else if (value === 1) {
            if (countVisible(suit, 2) === 4 || countVisible(suit, 3) === 4) isKabeSafe = true;
        }

        if (isKabeSafe) {
          kabeCandidates.push(tile);
        }
      }
    }
    if (kabeCandidates.length > 0) {
      return kabeCandidates[Math.floor(Math.random() * kabeCandidates.length)];
    }

    // 4. 字牌の安全度評価
    const safeJihaiCandidates: { tile: Tile, safetyRank: number }[] = [];
    // allVisibleTiles は壁のセクションで定義済み

    const ownPlayerWind = gameState.oya === PlayerID.CPU ? HonorType.TON : HonorType.NAN; // CPUの自風
    const roundWind = HonorType.TON; // 二人麻雀では場風は常に東

    for (const tile of cpuHand) {
      if (tile.suit === TileSuit.JIHAI) {
        const honorValue = tile.value as HonorType;
        let safetyRank = 0; // 高いほど安全

        const visibleCount = allVisibleTiles.filter(t => t.suit === TileSuit.JIHAI && t.value === honorValue).length;

        if (opponentRiver.includes(tile.id)) { // 現物は最高ランク (既に上で処理されるが念のため)
          safetyRank = 100;
        } else if (visibleCount >= 3) { // 3枚以上見え
          safetyRank = 50;
        } else if (visibleCount === 2) { // 2枚見え
          safetyRank = 30;
        } else if (visibleCount === 1) { // 1枚見え
          // 役牌かどうかでランク調整
          if (honorValue === HonorType.HAKU || honorValue === HonorType.HATSU || honorValue === HonorType.CHUN) {
            safetyRank = 5; // 1枚見えの三元牌
          } else if (honorValue === ownPlayerWind || honorValue === roundWind) {
            safetyRank = 8; // 1枚見えの役風牌
          } else {
            safetyRank = 15; // 1枚見えのオタ風
          }
        } else { // 生牌 (visibleCount === 0)
          if (honorValue === HonorType.HAKU || honorValue === HonorType.HATSU || honorValue === HonorType.CHUN) {
            safetyRank = 1;
          } else if (honorValue === ownPlayerWind || honorValue === roundWind) {
            safetyRank = 2;
          } else {
            safetyRank = 10; // 生牌のオタ風は比較的マシ
          }
        }
        safeJihaiCandidates.push({ tile, safetyRank });
      }
    }

    if (safeJihaiCandidates.length > 0) {
      safeJihaiCandidates.sort((a, b) => b.safetyRank - a.safetyRank); // 安全度高い順
      // ある程度の安全ランク以上のものだけを選ぶ (例: ランク10以上)
      const sufficientlySafeJihai = safeJihaiCandidates.filter(c => c.safetyRank >= 10);
      if (sufficientlySafeJihai.length > 0) {
        // 最も安全なランクの牌の中からランダムに選ぶ
        const highestRank = sufficientlySafeJihai[0].safetyRank;
        const topRankedJihai = sufficientlySafeJihai.filter(c => c.safetyRank === highestRank);
        return topRankedJihai[Math.floor(Math.random() * topRankedJihai.length)].tile;
      }
    }

  }

  // 常に14枚手牌で分析 (ツモ後打牌前の想定)
  let bestDiscardCandidate: Tile = cpuHand[Math.floor(Math.random() * cpuHand.length)]; // デフォルトはランダム
  let minShanten = Infinity;

  // 各牌を捨てた場合の向聴数を評価
  for (const tileToDiscard of cpuHand) {
    const tempHand = removeTileFromHand([...cpuHand], tileToDiscard);
    const analysis = analyzeHandShanten(tempHand, ownState.melds); // 副露も考慮

    if (analysis.shanten < minShanten) {
      minShanten = analysis.shanten;
      bestDiscardCandidate = tileToDiscard;
    } else if (analysis.shanten === minShanten) {
      // 同程度の向聴数なら、ヤオ九牌や孤立牌を優先して捨てる
      const isCurrentCandidateYaochu = YAOCHUUHAI_IDS.includes(bestDiscardCandidate.id);
      const isNewCandidateYaochu = YAOCHUUHAI_IDS.includes(tileToDiscard.id);

      if (!isCurrentCandidateYaochu && isNewCandidateYaochu) {
        bestDiscardCandidate = tileToDiscard;
      } else if (isCurrentCandidateYaochu === isNewCandidateYaochu) {
        // 両方ヤオ九牌、または両方中張牌の場合、より孤立しているものを探す (簡易)
        // (ここでは孤立度をカウントするのではなく、単純にIDで比較したり、ランダム性を残すことも考えられる)
        // より安全な牌を選ぶロジック (例: スジ、壁など) はここでは未実装
        // 簡単のため、ID文字列の長さや辞書順などで適当に選ぶ (より良い基準があれば変更)
        if (tileToDiscard.id < bestDiscardCandidate.id) { // 適当な比較
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
        if (game.lastAction?.type === ActionType.Discard &&
            game.lastAction.tile &&
            cpuState.canPon &&
            opponentState.lastDiscard &&
            isSameTile(opponentState.lastDiscard, game.lastAction.tile)) {

          const tileToPon = opponentState.lastDiscard;
          let shouldPon = false;

          const cpuOya = game.oya === PlayerID.CPU;
          const cpuPlayerWindActual = cpuOya ? HonorType.TON : HonorType.NAN;
          const currentRoundWindActual = HonorType.TON; // 二人麻雀の場風は常に東

          let isTileYakuhai = false;
          // tileToPon が undefined でないこと、字牌であること、value が HonorType であることを確認
          if (tileToPon && tileToPon.suit === TileSuit.JIHAI) {
            // このブロック内では tileToPon.value は HonorType であると推論される
            const honorValue = tileToPon.value as HonorType; // 明示的なキャストも可能だが、通常は不要
            if (honorValue === HonorType.HAKU || honorValue === HonorType.HATSU || honorValue === HonorType.CHUN) {
              isTileYakuhai = true;
            }
            if (honorValue === cpuPlayerWindActual) {
              isTileYakuhai = true;
            }
            if (honorValue === currentRoundWindActual) {
              isTileYakuhai = true;
            }
          }

          if (isTileYakuhai) {
            shouldPon = true;
          }

          if (shouldPon) {
            game = processAction(game, PlayerID.CPU, { type: ActionType.Pon, targetTile: tileToPon });
          }
        }

        // 1. CPU ツモ和了チェック (ポンしなかった場合、またはポンしてツモ番が来た場合)
        if (game.turn === PlayerID.CPU && cpuState.canTsumoAgari) { // game.turn を再確認
          game = processAction(game, PlayerID.CPU, { type: ActionType.TsumoAgari });
          cpuActionTaken = true;
        }

        // 2. CPU カンチェック (ツモ後)
        if (!cpuActionTaken && game.turn === PlayerID.CPU && cpuState.canKan && !cpuState.isRiichi && cpuState.lastDraw) {
            const counts = new Map<string, Tile[]>();
            for (const tile of cpuState.hand) {
                const tileList = counts.get(tile.id) || [];
                tileList.push(tile);
                counts.set(tile.id, tileList);
            }
            let kanAction: GameAction | null = null;
            for (const [tileId, tileList] of counts.entries()) {
                if (tileList.length === 4) {
                    kanAction = { type: ActionType.Kan, tile: tileList[0]!, meldType: 'ankan' };
                    break;
                }
            }
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
                cpuActionTaken = true;
            }
        }

        // 3. CPU リーチチェック (ツモ後、カン後)
        if (!cpuActionTaken && game.turn === PlayerID.CPU && cpuState.canRiichi && cpuState.score >= 1000 && cpuState.melds.every(m => !m.isOpen)) {
          const tileToDiscardForRiichi = getCpuDiscard(cpuState.hand, game);
          if (tileToDiscardForRiichi) {
            game = processAction(game, PlayerID.CPU, { type: ActionType.Riichi, tileToDiscard: tileToDiscardForRiichi });
            cpuActionTaken = true;
          }
        }

        // 4. CPU 打牌 (ツモ和了/カン/リーチしなかった場合、またはポンした後)
        if (game.turn === PlayerID.CPU && game.phase === GamePhase.Playing) { // gameの状態が変わりうるので再チェック
            const cpuHandForDiscard = game.cpu.hand;
            if (cpuHandForDiscard.length > 0) {
                const cpuDiscardTile = getCpuDiscard(cpuHandForDiscard, game);
                if (cpuDiscardTile) {
                    game = processAction(game, PlayerID.CPU, { type: ActionType.Discard, tile: cpuDiscardTile });
                } else {
                    console.error("CPU discard tile is null, should not happen if hand is not empty.");
                }
            } else if (cpuHandForDiscard.length === 0 && !game.winner) {
                 console.error("CPU hand is empty, but no winner. This should not happen.");
            }
        }
      }
    } catch (e: any) {
      console.error("Error processing action in game_state:", e);
      return NextResponse.json({ message: e.message || "Error processing action logic" }, { status: 400 });
    }

    saveGame(game);
    return NextResponse.json(game);

  } catch (error) {
    console.error("Error in game action API:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}
