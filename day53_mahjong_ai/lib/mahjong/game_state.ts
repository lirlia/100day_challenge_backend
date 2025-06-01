import { Tile, isSameTile, compareTiles, HonorType } from './tiles';
import { Yama, createYama, dealInitialHands, drawTile, getCurrentDora, drawRinshanTile, revealKanDora, getCurrentUraDora } from './yama';
import { analyzeHandShanten, Meld, HandPattern, AgariInfo, AgariContext } from './hand'; // AgariContext を正しくインポート
import type { AgariContext as OldAgariContext } from './hand'; // AgariContext 型をインポート

export enum PlayerID {
  Player = "player",
  CPU = "cpu",
}

export enum GamePhase {
  Playing = "playing",
  PlayerWon = "player_won",
  CPUWon = "cpu_won",
  Draw = "draw", // 流局
  GameOver = "game_over" // ゲーム全体の終了
}

// アクションの種類を定義
export enum ActionType {
  Discard = "discard",
  Riichi = "riichi",
  Kan = "kan", // 暗槓、加槓、大明槓を区別する場合はさらに詳細化
  TsumoAgari = "tsumo_agari",
  Ron = "ron",
  // TODO: チー、ポン (二人麻雀では通常なし)
}

export interface GameAction {
  type: ActionType;
  tile?: Tile;            // 打牌、カンする牌 (暗槓・大明槓の場合)、加槓で加える牌
  tileToDiscard?: Tile;   // リーチ時に捨てる牌
  meldType?: 'ankan' | 'kakan' | 'daiminkan'; // カンの種類
  meld?: Meld;            // 加槓の対象となる既存の面子
}

// 河の牌の型 (Tile に追加情報)
export interface TileInRiver extends Tile {
  discardedBy: PlayerID;
  turn: number;
  isRiichiDeclare?: boolean;
}

export interface PlayerState {
  hand: Tile[];         // 手牌 (ツモ牌を含む場合は14枚、それ以外は13枚)
  river: TileInRiver[];  // 捨て牌の履歴 (型を TileInRiver[] に変更)
  score: number;        // 現在の点数
  isRiichi: boolean;    // リーチしているか
  riichiTurn: number;   // リーチ宣言した巡目 (リーチ後のフリテン確認などに使用)
  // アクション可能フラグ (サーバーサイドで設定)
  canRiichi?: boolean;
  canTsumoAgari?: boolean;
  canRon?: boolean; // 相手の打牌に対してロン可能か
  canKan?: boolean; // カン可能か (暗槓、加槓、大明槓のいずれか)
  melds: Meld[];      // 副露した面子
  justKaned?: boolean; // カン直後のツモか (嶺上開花判定用)
  lastDraw?: Tile;      // 最後にツモった牌
  lastDiscard?: Tile;   // 最後に捨てた牌 (主にロン判定用)
}

export interface GameState {
  gameId: string;          // ゲームの一意なID (セッション管理用、今回は簡易的に)
  round: number;           // 現在の局 (例: 1 = 東1局, 2 = 東2局)
  honba: number;           // 本場 (積み棒の数)
  oya: PlayerID;           // 現在の親プレイヤー
  turn: PlayerID;          // 現在手番のプレイヤー
  phase: GamePhase;        // 現在のゲームフェーズ
  yama: Yama;              // 山の状態
  dora: Tile[];            // 現在見えているドラ牌 (表示牌ではない)
  uraDora?: Tile[];         // 裏ドラ (リーチ和了時にセットされる)
  player: PlayerState;
  cpu: PlayerState;
  turnCount: number;       // 現在の局の総巡目 (誰かが打牌するたびに+1)
  lastActionMessage?: string; // 直前のアクションに関するメッセージ (例: "CPUが1萬を捨てました")
  winner?: PlayerID | null; // 現在の局の和了者 (nullなら流局)
  gameWinner?: PlayerID | null; // ゲーム全体の勝者
  winningHandInfo?: AgariInfo;    // 和了時の手牌情報、役、点数など (詳細は後で)
  lastAction?: GameAction; // 最後に行われたアクション (主にCPUのロン判定用)
  totalRounds: number; // ゲームの総局数 (例: 4局戦)
}

export function createInitialGameState(gameId: string): GameState {
  const yama = createYama();
  const { playerHand, cpuHand } = dealInitialHands(yama);
  const initialOya = PlayerID.Player; // 仮にプレイヤーを常に東家とする

  // ツモ牌をプレイヤーの手牌に加える（最初のツモ）
  let playerHandWithTsumo: Tile[] = [...playerHand];
  const firstPlayerTsumo = drawTile(yama);
  if (firstPlayerTsumo.tile) {
    playerHandWithTsumo.push(firstPlayerTsumo.tile);
  }
  let currentYama = firstPlayerTsumo.updatedYama;

  const initialPlayerState: PlayerState = {
    hand: playerHandWithTsumo,
    river: [],
    score: 25000,
    isRiichi: false,
    riichiTurn: 0,
    canRiichi: false,
    canTsumoAgari: false,
    canRon: false,
    canKan: false,
    melds: [],
    lastDraw: firstPlayerTsumo.tile === null ? undefined : firstPlayerTsumo.tile,
  };

  const initialCpuState: PlayerState = {
    hand: cpuHand,
    river: [],
    score: 25000,
    isRiichi: false,
    riichiTurn: 0,
    canRiichi: false,
    canTsumoAgari: false,
    canRon: false,
    canKan: false,
    melds: [],
  };

  // 初期状態でのプレイヤーのアクション可否判定
  const playerWindForInit = initialOya === PlayerID.Player ? HonorType.TON : HonorType.NAN;
  const roundWindForInit = HonorType.TON; // 二人麻雀では東場固定

  const initialPlayerAnalysis = analyzeHandShanten(
    initialPlayerState.hand,
    initialPlayerState.melds,
    {
      agariTile: initialPlayerState.hand[initialPlayerState.hand.length -1], // 仮ツモ牌
      isTsumo: true,
      isRiichi: false,
      playerWind: playerWindForInit,
      roundWind: roundWindForInit,
      doraTiles: getCurrentDora(currentYama),
      turnCount: 1,
      isMenzen: initialPlayerState.melds.every(m => !m.isOpen)
    }
  );
  if (initialPlayerAnalysis.shanten === -1 && initialPlayerAnalysis.agariResult && initialPlayerAnalysis.agariResult.score) {
    initialPlayerState.canTsumoAgari = initialPlayerAnalysis.agariResult.score.yakuList.length > 0;
  } else {
    initialPlayerState.canTsumoAgari = false;
  }
  initialPlayerState.canRiichi = initialPlayerAnalysis.shanten === 0 && !initialPlayerState.isRiichi && initialPlayerState.melds.every(m => !m.isOpen) && initialPlayerState.score >= 1000;
  // TODO: canKan の初期判定

  return {
    gameId,
    round: 1,
    honba: 0,
    oya: initialOya,
    turn: initialOya,
    phase: GamePhase.Playing,
    yama: currentYama, // 更新された山を使用
    dora: getCurrentDora(currentYama),
    player: initialPlayerState,
    cpu: initialCpuState,
    turnCount: 1,
    winner: undefined,
    gameWinner: undefined,
    winningHandInfo: undefined,
    totalRounds: 4, // 東風戦 (4局)
  };
}

/**
 * プレイヤーのアクション後に手牌と状況を分析し、可能なアクションフラグを更新する。
 * @param playerState 更新するプレイヤーの状態
 * @param gameState 現在のゲーム状態 (特に山、ドラ、風など)
 * @param agariTile ツモ牌またはロン牌 (分析対象の14枚目の牌)
 * @param isTsumo ツモ和了の分析かどうか
 */
function updateActionFlagsForPlayer(playerState: PlayerState, gameState: GameState, agariTile: Tile, isTsumo: boolean): void {
  // プレイヤーの風を決定 (親なら東、子なら南)
  const playerWind = (gameState.oya === PlayerID.Player && gameState.turn === PlayerID.Player) || (gameState.oya === PlayerID.CPU && gameState.turn === PlayerID.CPU) ? HonorType.TON : HonorType.NAN;
  const roundWind = HonorType.TON; // 二人麻雀の場風は常に東

  const analysis = analyzeHandShanten(
    isTsumo ? playerState.hand : [...playerState.hand, agariTile],
    playerState.melds,
    {
      agariTile: agariTile,
      isTsumo: isTsumo,
      isRiichi: playerState.isRiichi,
      playerWind: playerWind,
      roundWind: roundWind,
      doraTiles: getCurrentDora(gameState.yama),
      uraDoraTiles: playerState.isRiichi && (gameState.phase === GamePhase.PlayerWon || gameState.phase === GamePhase.CPUWon) ? getCurrentUraDora(gameState.yama) : undefined,
      turnCount: gameState.turnCount,
      isMenzen: playerState.melds.every(m => !m.isOpen),
      isRinshan: !!playerState.justKaned && isTsumo, // 嶺上開花フラグ
    }
  );

  if (analysis.shanten === -1 && analysis.agariResult && analysis.agariResult.score && analysis.agariResult.score.yakuList.length > 0) {
    if (isTsumo) playerState.canTsumoAgari = true;
    else playerState.canRon = true;
  } else {
    if (isTsumo) playerState.canTsumoAgari = false;
    else playerState.canRon = false;
  }

  playerState.canRiichi = isTsumo && analysis.shanten === 0 && !playerState.isRiichi && playerState.melds.every(m => !m.isOpen) && playerState.score >= 1000;

  // 暗槓の判定 (手牌に同じ牌が4枚あるか)
  let canAnkan = false;
  // リーチ中でも、待ちが変わらない暗槓は可能。ただし、この判定は複雑なので、
  // ここでは「リーチ中は暗槓不可」としておくか、より詳細な分析が必要。
  // 今回は簡易的に「リーチ中も暗槓は可能」としてしまう (手牌構成が変わるが、役の計算時に影響)
  // ただし、analyzeHandShantenで待ち牌リストを取得し、それが変わらないかチェックするのが理想
  if (isTsumo) { // ツモ時のみカンを考慮 (手番なので)
    const counts = new Map<string, number>();
    for (const tile of playerState.hand) {
      counts.set(tile.id, (counts.get(tile.id) || 0) + 1);
    }
    for (const [tileId, count] of counts.entries()) {
      if (count === 4) {
        // リーチ中の場合、このカンで待ちが変わるかどうかのチェックが必要。
        // 非常に簡略化して、リーチ中は暗槓はできないものとして扱う。
        // より正確には、カンしても役や待ちが変わらない場合のみ許可。
        // 今回は、リーチ後の暗槓は許可しない方向で進める。（以前のロジックに戻す）
        if (!playerState.isRiichi) {
            canAnkan = true;
            break;
        }
      }
    }
  }
  // TODO: 加槓の判定 (ポンした刻子と同じ牌を手牌に持っているか)
  let canKakan = false;
  if (isTsumo && !playerState.isRiichi) { // 加槓もリーチ中は不可（通常）
    for (const meld of playerState.melds) {
      if (meld.type === 'koutsu' && meld.isOpen) { // 開いた刻子（ポン）であること
        const tileInHand = playerState.hand.find(t => isSameTile(t, meld.tiles[0]));
        if (tileInHand) {
          canKakan = true;
          break;
        }
      }
    }
  }

  // TODO: 大明槓の判定は相手の打牌時なのでここでは false
  playerState.canKan = canAnkan || canKakan; // 現状は暗槓と加槓のみツモ時に判定
}

function proceedToNextRoundOrEndGame(currentState: GameState): GameState {
  let nextState = JSON.parse(JSON.stringify(currentState)) as GameState;

  // 1. 飛び判定 (誰かの点数が0点以下)
  if (nextState.player.score <= 0) {
    nextState.phase = GamePhase.GameOver;
    nextState.gameWinner = PlayerID.CPU; // プレイヤーが飛んだのでCPUの勝ち
    return nextState;
  }
  if (nextState.cpu.score <= 0) {
    nextState.phase = GamePhase.GameOver;
    nextState.gameWinner = PlayerID.Player; // CPUが飛んだのでプレイヤーの勝ち
    return nextState;
  }

  const currentRound = nextState.round;
  const currentOya = nextState.oya;
  const roundWinner = nextState.winner; // 局の和了者

  let renchan = false; // 連荘フラグ
  if (roundWinner === currentOya) { // 親の和了
    renchan = true;
  } else if (nextState.phase === GamePhase.Draw) {
    // 流局時の聴牌判定 (簡易的に、親が聴牌なら連荘とする)
    // TODO: より正確な聴牌判定を analyzeHandShanten などから取得して使う
    const oyaState = currentOya === PlayerID.Player ? nextState.player : nextState.cpu;
    const oyaHandAnalysis = analyzeHandShanten(oyaState.hand, oyaState.melds);
    if (oyaHandAnalysis.shanten === 0) {
      renchan = true;
    }
  }

  if (renchan) {
    nextState.honba++;
    // Oya は変わらず、局も進まない (ただし表示上は同じ局が続く)
  } else {
    nextState.honba = 0;
    nextState.round++;
    nextState.oya = currentOya === PlayerID.Player ? PlayerID.CPU : PlayerID.Player;
  }

  // 2. 規定局数終了判定 (例: 東4局終了)
  if (nextState.round > nextState.totalRounds) {
    nextState.phase = GamePhase.GameOver;
    // 点数比較で勝者を決定
    if (nextState.player.score > nextState.cpu.score) {
      nextState.gameWinner = PlayerID.Player;
    } else if (nextState.cpu.score > nextState.player.score) {
      nextState.gameWinner = PlayerID.CPU;
    } else {
      nextState.gameWinner = null; // 引き分け
    }
    return nextState;
  }

  // 次の局の準備
  nextState.yama = createYama();
  const { playerHand, cpuHand } = dealInitialHands(nextState.yama);
  const nextOya = nextState.oya;

  let firstPlayerToDrawId = nextOya; // 次の局の親からツモ開始
  let handForNextPlayer: Tile[];
  let handForOtherPlayer: Tile[];

  if (firstPlayerToDrawId === PlayerID.Player) {
      handForNextPlayer = playerHand;
      handForOtherPlayer = cpuHand;
  } else {
      handForNextPlayer = cpuHand;
      handForOtherPlayer = playerHand;
  }

  const firstDraw = drawTile(nextState.yama);
  if (firstDraw.tile) {
    handForNextPlayer.push(firstDraw.tile);
    handForNextPlayer.sort(compareTiles);
  }
  nextState.yama = firstDraw.updatedYama;

  nextState.player.hand = (firstPlayerToDrawId === PlayerID.Player) ? handForNextPlayer : handForOtherPlayer;
  nextState.cpu.hand = (firstPlayerToDrawId === PlayerID.CPU) ? handForNextPlayer : handForOtherPlayer;

  nextState.player.river = [];
  nextState.player.melds = [];
  nextState.player.isRiichi = false;
  nextState.player.justKaned = false;
  nextState.cpu.river = [];
  nextState.cpu.melds = [];
  nextState.cpu.isRiichi = false;
  nextState.cpu.justKaned = false;

  nextState.turn = nextOya;
  nextState.turnCount = 1;
  nextState.phase = GamePhase.Playing;
  nextState.dora = getCurrentDora(nextState.yama);
  nextState.uraDora = undefined;
  nextState.winner = undefined;
  nextState.winningHandInfo = undefined;

  // 初手のアクションフラグ更新 (新しい親に対して)
  const activePlayerState = nextOya === PlayerID.Player ? nextState.player : nextState.cpu;
  const firstTileDrawn = activePlayerState.hand[activePlayerState.hand.length -1]; // 最後の牌がツモ牌
  if (firstTileDrawn) {
      updateActionFlagsForPlayer(activePlayerState, nextState, firstTileDrawn, true);
  }

  return nextState;
}

// ゲーム状態を更新するメインロジック
export function processAction(currentState: GameState, playerId: PlayerID, action: GameAction): GameState {
  let nextState = JSON.parse(JSON.stringify(currentState)) as GameState; // Deep copy
  nextState.lastAction = action;

  const actingPlayer = playerId === PlayerID.Player ? nextState.player : nextState.cpu;
  const opponentPlayer = playerId === PlayerID.Player ? nextState.cpu : nextState.player;
  const opponentPlayerId = playerId === PlayerID.Player ? PlayerID.CPU : PlayerID.Player;

  let gameEndedThisTurn = false; // このアクションで局またはゲームが終了したか

  switch (action.type) {
    case ActionType.Discard:
      if (!action.tile) {
        console.error("Discard action without tile", action);
        nextState.lastActionMessage = "エラー: 捨てる牌が指定されていません。";
        break;
      }
      const discardedTile = action.tile; // nullチェック済みのためOK
      actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, discardedTile));
      actingPlayer.river.push({ ...discardedTile, discardedBy: playerId, turn: nextState.turnCount });
      actingPlayer.lastDiscard = discardedTile;
      actingPlayer.justKaned = false;
      nextState.turn = opponentPlayerId;
      nextState.turnCount++;
      nextState.lastActionMessage = `${playerId === PlayerID.Player ? "あなた" : "CPU"}が ${discardedTile.id} を捨てました。`;

      // 相手のロン判定
      updateActionFlagsForPlayer(opponentPlayer, nextState, discardedTile, false); // canRon フラグを更新

      if (opponentPlayer.canRon) {
        // ロン可能な状態。相手のアクションを待つ。
        nextState.lastActionMessage += ` ${opponentPlayerId === PlayerID.Player ? "あなた" : "CPU"}はロン可能です。`;
      } else if (nextState.yama.tiles.length > 0) {
        // ロンされず、山が残っていれば相手のツモ
        const drawResult = drawTile(nextState.yama);
        nextState.yama = drawResult.updatedYama;
        if (drawResult.tile) {
          opponentPlayer.hand.push(drawResult.tile);
          opponentPlayer.hand.sort(compareTiles);
          opponentPlayer.lastDraw = drawResult.tile;
          updateActionFlagsForPlayer(opponentPlayer, nextState, drawResult.tile as Tile, true); // Type assertion
          nextState.lastActionMessage += ` ${opponentPlayerId === PlayerID.Player ? "あなた" : "CPU"}がツモりました。`;
        } else {
          // 山切れ (通常は発生しないはず、drawTileがnullを返すのは嶺上牌など特殊なケース)
          nextState.phase = GamePhase.Draw;
          nextState.winner = null;
          gameEndedThisTurn = true;
        }
      } else {
        // ロンされず、山もなし -> 流局
        nextState.phase = GamePhase.Draw;
        nextState.winner = null;
        gameEndedThisTurn = true;
      }
      break;

    case ActionType.Riichi:
      if (!action.tileToDiscard) {
        console.error("Riichi action without tileToDiscard", action);
        nextState.lastActionMessage = "エラー: リーチ時に捨てる牌が指定されていません。";
        break;
      }
      const tileToDiscardForRiichi = action.tileToDiscard; // nullチェック済み
      actingPlayer.isRiichi = true;
      actingPlayer.riichiTurn = nextState.turnCount;
      actingPlayer.score -= 1000; // リーチ供託
      nextState.honba++; // 供託されたリーチ棒は場に積まれる (便宜上honbaで管理)

      // リーチ宣言牌を捨てる
      actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, tileToDiscardForRiichi));
      actingPlayer.river.push({ ...tileToDiscardForRiichi, discardedBy: playerId, turn: nextState.turnCount, isRiichiDeclare: true });
      actingPlayer.lastDiscard = tileToDiscardForRiichi;
      actingPlayer.justKaned = false;
      nextState.turn = opponentPlayerId;
      nextState.turnCount++;
      nextState.lastActionMessage = `${playerId === PlayerID.Player ? "あなた" : "CPU"}がリーチを宣言し、${tileToDiscardForRiichi.id} を捨てました。`;

      // 相手のロン判定
      if (tileToDiscardForRiichi) {
        updateActionFlagsForPlayer(opponentPlayer, nextState, tileToDiscardForRiichi, false);
        if (opponentPlayer.canRon) {
          nextState.lastActionMessage += ` ${opponentPlayerId === PlayerID.Player ? "あなた" : "CPU"}はロン可能です。`;
          if (nextState.yama.tiles.length > 0) {
            const drawResult = drawTile(nextState.yama);
            nextState.yama = drawResult.updatedYama;
            const drawnTile = drawResult.tile; // ローカル変数に代入
            if (drawnTile) { // このローカル変数でチェック
              opponentPlayer.hand.push(drawnTile);
              opponentPlayer.hand.sort(compareTiles);
              opponentPlayer.lastDraw = drawnTile;
              updateActionFlagsForPlayer(opponentPlayer, nextState, drawnTile as Tile, true); // Type assertion
              nextState.lastActionMessage += ` ${opponentPlayerId === PlayerID.Player ? "あなた" : "CPU"}がツモりました。`;
            } else {
              nextState.phase = GamePhase.Draw;
              nextState.winner = null;
              gameEndedThisTurn = true;
            }
          } else {
            nextState.phase = GamePhase.Draw;
            nextState.winner = null;
            gameEndedThisTurn = true;
          }
        }
      } else {
        // tileToDiscardForRiichi が undefined の場合 (action.tileToDiscard がなかった場合)
        // 基本的にエラーなので、ここでは何もしないか、エラーメッセージを出す
        // (既に break しているので、ここは通らない想定)
      }
      break;

    case ActionType.TsumoAgari:
      if (!actingPlayer.lastDraw) {
        console.error("TsumoAgari action without lastDraw tile on player state.");
        nextState.lastActionMessage = "エラー: ツモ牌が記録されていません。";
        break;
      }
      const agariContextTsumo: AgariContext = {
        agariTile: actingPlayer.lastDraw,
        isTsumo: true,
        isRiichi: actingPlayer.isRiichi,
        playerWind: playerId === nextState.oya ? HonorType.TON : HonorType.NAN, // 仮
        roundWind: HonorType.TON, // 仮 (場風はGameStateから取るべき)
        doraTiles: nextState.dora,
        uraDoraTiles: actingPlayer.isRiichi ? getCurrentUraDora(nextState.yama) : undefined,
        turnCount: nextState.turnCount,
        isMenzen: actingPlayer.melds.every(m => !m.isOpen),
        isRinshan: actingPlayer.justKaned,
      };
      const agariAnalysisTsumo = analyzeHandShanten(
        actingPlayer.hand.filter(t => !isSameTile(t, actingPlayer.lastDraw!)),
        actingPlayer.melds,
        agariContextTsumo
      );

      if (agariAnalysisTsumo.shanten === -1 && agariAnalysisTsumo.agariResult && agariAnalysisTsumo.agariResult.score) {
        nextState.phase = playerId === PlayerID.Player ? GamePhase.PlayerWon : GamePhase.CPUWon;
        nextState.winner = playerId;
        nextState.winningHandInfo = agariAnalysisTsumo.agariResult;
        // 点数移動
        const scoreResult = agariAnalysisTsumo.agariResult.score;
        if (playerId === PlayerID.Player) {
          actingPlayer.score += scoreResult.displayedPoint;
          opponentPlayer.score -= scoreResult.displayedPoint; // 二人麻雀なので相手が全額負担
        } else { // CPUのツモ和了
          actingPlayer.score += scoreResult.displayedPoint;
          opponentPlayer.score -= scoreResult.displayedPoint;
        }
        nextState.lastActionMessage = `${playerId === PlayerID.Player ? "あなた" : "CPU"}がツモ和了しました。`;
        gameEndedThisTurn = true;
      } else {
        console.warn("TsumoAgari declared but analysis failed or no yaku.", agariAnalysisTsumo);
        nextState.lastActionMessage = "エラー: ツモ和了の条件を満たしていません。";
        // 間違った宣言なので、ターンはそのまま or ペナルティ
      }
      break;

    case ActionType.Ron:
      if (!currentState.lastAction || (currentState.lastAction.type !== ActionType.Discard && currentState.lastAction.type !== ActionType.Riichi)) {
        console.error("Ron action without a preceding discard.", currentState.lastAction);
        nextState.lastActionMessage = "エラー: ロン対象の打牌がありません。";
        break;
      }
      // opponentPlayer.lastDiscard を使う。actingPlayerはロンする側なので、そのlastDiscardは関係ない。
      const ronTargetTile = opponentPlayer.lastDiscard;
      if (!ronTargetTile) {
        console.error("Ron action, but opponent's lastDiscard is not set.");
        nextState.lastActionMessage = "エラー: ロン対象の牌が見つかりません。";
        break;
      }

      const agariContextRon: AgariContext = {
        agariTile: ronTargetTile,
        isTsumo: false,
        isRiichi: actingPlayer.isRiichi,
        playerWind: playerId === nextState.oya ? HonorType.TON : HonorType.NAN,
        roundWind: HonorType.TON,
        doraTiles: nextState.dora,
        uraDoraTiles: actingPlayer.isRiichi ? getCurrentUraDora(nextState.yama) : undefined,
        turnCount: nextState.turnCount, // ロンした巡目
        isMenzen: actingPlayer.melds.every(m => !m.isOpen),
        isRinshan: false, // ロンは嶺上開花ではない
      };
      // ロン和了の場合、手牌は13枚のはずなので、アガリ牌を加えて14枚で判定
      const ronHandForAnalysis = [...actingPlayer.hand];
      const agariAnalysisRon = analyzeHandShanten(
        ronHandForAnalysis,
        actingPlayer.melds,
        agariContextRon
      );

      if (agariAnalysisRon.shanten === -1 && agariAnalysisRon.agariResult && agariAnalysisRon.agariResult.score) {
        nextState.phase = playerId === PlayerID.Player ? GamePhase.PlayerWon : GamePhase.CPUWon;
        nextState.winner = playerId;
        nextState.winningHandInfo = agariAnalysisRon.agariResult;
        // 点数移動
        const scoreResult = agariAnalysisRon.agariResult.score;
        if (playerId === PlayerID.Player) { // プレイヤーのロン
          actingPlayer.score += scoreResult.displayedPoint;
          opponentPlayer.score -= scoreResult.displayedPoint; // 放銃者が全額負担
        } else { // CPUのロン
          actingPlayer.score += scoreResult.displayedPoint;
          opponentPlayer.score -= scoreResult.displayedPoint;
        }
        nextState.lastActionMessage = `${playerId === PlayerID.Player ? "あなた" : "CPU"}が ${opponentPlayerId === PlayerID.Player ? "あなた" : "CPU"} の ${ronTargetTile.id} でロン和了しました。`;
        gameEndedThisTurn = true;
      } else {
        console.warn("Ron declared but analysis failed or no yaku.", agariAnalysisRon);
        nextState.lastActionMessage = "エラー: ロン和了の条件を満たしていません。";
      }
      break;

    case ActionType.Kan:
      if (!action.tile && !action.meld) {
          nextState.lastActionMessage = "エラー: カンする牌または面子が指定されていません。";
          break;
      }
      let kanSuccess = false;
      let kanTypeMessage = "";

      if (action.meldType === "ankan" && action.tile) { // 暗槓
          const tileStr = action.tile.id;
          const count = actingPlayer.hand.filter(t => t.id === tileStr).length;
          if (count === 4) {
              const ankanMeld: Meld = { type: 'kantsu', tiles: [action.tile, action.tile, action.tile, action.tile], isOpen: false };
              actingPlayer.melds.push(ankanMeld);
              actingPlayer.hand = actingPlayer.hand.filter(t => t.id !== tileStr);
              kanSuccess = true;
              kanTypeMessage = "暗槓";
          }
      } else if (action.meldType === "kakan" && action.meld && action.tile) { // 加槓
          const koutsuToUpgrade = actingPlayer.melds.find(m => m.type === 'koutsu' && isSameTile(m.tiles[0], action.meld!.tiles[0]));
          const tileInHand = actingPlayer.hand.find(t => isSameTile(t, action.tile!));
          if (koutsuToUpgrade && tileInHand) {
              koutsuToUpgrade.type = 'kantsu';
              koutsuToUpgrade.tiles.push(action.tile); // 4枚目
              actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, action.tile));
              kanSuccess = true;
              kanTypeMessage = "加槓";
          }
      } else if (action.meldType === "daiminkan" && action.tile) { // 大明槓
          // 直前の相手の捨て牌に対してカン
          if (opponentPlayer.lastDiscard && isSameTile(opponentPlayer.lastDiscard, action.tile)) {
              const ownCount = actingPlayer.hand.filter(t => isSameTile(t, action.tile!)).length;
              if (ownCount === 3) {
                  const daiminkanMeld: Meld = {
                      type: 'kantsu',
                      tiles: [action.tile, action.tile, action.tile, opponentPlayer.lastDiscard],
                      isOpen: true,
                      fromWho: opponentPlayerId
                  };
                  actingPlayer.melds.push(daiminkanMeld);
                  actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, action.tile!));
                  // 大明槓の場合、相手の河から牌が消えるわけではない (そのまま残る)
                  // また、相手のcanRonフラグは消える
                  opponentPlayer.canRon = false;
                  kanSuccess = true;
                  kanTypeMessage = "大明槓";
              }
          }
      }

      if (kanSuccess) {
          nextState.yama = revealKanDora(nextState.yama);
          nextState.dora = getCurrentDora(nextState.yama);
          actingPlayer.justKaned = true;
          nextState.lastActionMessage = `${playerId === PlayerID.Player ? "あなた" : "CPU"}が ${action.tile?.id || action.meld?.tiles[0].id} で${kanTypeMessage}しました。嶺上牌をツモります。`;

          const rinshanDrawResult = drawRinshanTile(nextState.yama); // rinshanDrawResult を正しく使用
          nextState.yama = rinshanDrawResult.updatedYama;

          if (rinshanDrawResult.tile) {
              actingPlayer.hand.push(rinshanDrawResult.tile);
              actingPlayer.hand.sort(compareTiles);
              actingPlayer.lastDraw = rinshanDrawResult.tile === null ? undefined : rinshanDrawResult.tile; // null を undefined に変換
              updateActionFlagsForPlayer(actingPlayer, nextState, rinshanDrawResult.tile as Tile, true); // 嶺上ツモ後の状態更新
              // 大明槓の場合、ここでターンが終了し、打牌は不要
              if (action.meldType !== "daiminkan") {
                // 暗槓・加槓の場合は打牌が必要。次のアクションを待つ。
                // updateActionFlagsForPlayer で canDiscard などが設定される。
              } else {
                // 大明槓後は打牌不要。相手のターンに通常は移らない。次の自分のツモで継続のはずだが、
                // ここでは簡略化し、次のツモは updateActionFlagsForPlayer で canTsumoAgari が true になればそれを待ち、
                // そうでなければ次の打牌を促す (手番は変わらないまま)。
                // 実際には大明槓の後の処理はもう少し複雑（他のプレイヤーの行動など）。
                // ここでは、ツモアガリできなければ、手番プレイヤーが再度打牌する流れを想定。
                nextState.turn = playerId; // 手番は変わらない
              }
          } else {
              // 嶺上牌が引けなかった -> 流局 (特殊ケース)
              nextState.phase = GamePhase.Draw;
              nextState.winner = null;
              nextState.lastActionMessage += " しかし嶺上牌がありませんでした。流局です。";
              gameEndedThisTurn = true;
          }
      } else {
          nextState.lastActionMessage = "エラー: カンできませんでした。";
      }
      break;
  }

  // プレイヤー状態の最終更新 (canRonなどは打牌後などにリセットされるべき)
  // (現状は updateActionFlagsForPlayer が都度行っているので、ここでは不要かも)

  if (gameEndedThisTurn && nextState.phase !== GamePhase.GameOver) {
    nextState = proceedToNextRoundOrEndGame(nextState);
  }

  return nextState;
}

// 古い updateGameState は削除またはコメントアウト
/*
export function updateGameState(currentState: GameState, playerId: PlayerID, action: GameAction): GameState {
  let nextState = { ...currentState };
  nextState.lastAction = action;
  return nextState;
}
*/
