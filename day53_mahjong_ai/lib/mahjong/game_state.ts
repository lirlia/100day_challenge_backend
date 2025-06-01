import { Tile, isSameTile, compareTiles, HonorType, TileSuit } from './tiles';
import { Yama, createYama, dealInitialHands, drawTile, getCurrentDora, drawRinshanTile, revealKanDora, getCurrentUraDora } from './yama';
import { analyzeHandShanten, Meld, HandPattern, AgariInfo, AgariContext, removeTileFromHand as removeTileFromPlayerHand, isKyuushuuKyuuhai } from './hand'; // removeTileFromHand をインポート
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
  Pon = "pon",
  // TODO: チー (二人麻雀では通常なし)
}

export interface GameAction {
  type: ActionType;
  tile?: Tile;            // 打牌、カンする牌 (暗槓・大明槓の場合)、加槓で加える牌
  tileToDiscard?: Tile;   // リーチ時に捨てる牌
  meldType?: 'ankan' | 'kakan' | 'daiminkan' | 'pon'; // カンの種類 -> meldTypeからponを削除し、ActionType.Ponで処理
  meld?: Meld;            // 加槓の対象となる既存の面子
  targetTile?: Tile; // ポン、チーの対象となる相手の捨て牌 (Ponアクションで使用)
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
  canPon?: boolean; // ポン可能か
  tileToPon?: Tile; // ポン可能な場合の対象牌
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
  kanCount: number;      // 現在の局で行われたカンの総数
}

export function createInitialGameState(gameId: string): GameState {
  const yama = createYama();
  const { playerHand, cpuHand } = dealInitialHands(yama);
  const initialOya = PlayerID.Player; // 仮にプレイヤーを常に東家とする

  // 九種九牌チェック用の手牌 (ツモ前)
  const initialPlayerHandForKyuuCheck = [...playerHand];
  const initialCpuHandForKyuuCheck = [...cpuHand];

  if (isKyuushuuKyuuhai(initialPlayerHandForKyuuCheck) || isKyuushuuKyuuhai(initialCpuHandForKyuuCheck)) {
    const kyuushuuPlayer = isKyuushuuKyuuhai(initialPlayerHandForKyuuCheck) ? PlayerID.Player : PlayerID.CPU;
    return {
      gameId,
      round: 1,
      honba: 1, // 九種九牌は本場を1増やして親流れなし（ルールによるが、ここではそうする）
      oya: initialOya,
      turn: initialOya, // 親のターンで再開
      phase: GamePhase.Draw,
      yama: createYama(), // 山を再生成
      dora: getCurrentDora(yama), // ドラも再設定
      player: {
        hand: playerHand, // 九種九牌でも手牌は見せる（UIで判断）
        river: [],
        score: 25000,
        isRiichi: false,
        riichiTurn: 0,
        canRiichi: false, canTsumoAgari: false, canRon: false, canKan: false, canPon: false,
        melds: [],
      },
      cpu: {
        hand: cpuHand,
        river: [],
        score: 25000,
        isRiichi: false,
        riichiTurn: 0,
        canRiichi: false, canTsumoAgari: false, canRon: false, canKan: false, canPon: false,
        melds: [],
      },
      turnCount: 0,
      lastActionMessage: `${kyuushuuPlayer}が九種九牌のため流局しました。`,
      winner: null,
      gameWinner: undefined,
      winningHandInfo: undefined,
      totalRounds: 4,
      kanCount: 0,     // カンカウント初期化
    };
  }

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
    canPon: false, // 初期状態ではポン不可
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
    canPon: false,
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
    kanCount: 0,     // カンカウント初期化
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

  // アクションフラグを初期化
  playerState.canTsumoAgari = false;
  playerState.canRon = false;
  playerState.canRiichi = false;
  playerState.canKan = false;
  playerState.canPon = false;
  playerState.tileToPon = undefined;

  const completedHandForAnalysis = isTsumo ? playerState.hand : [...playerState.hand, agariTile];

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

  // リーチ可能かの判定 (ツモ時のみ)
  if (isTsumo) {
    playerState.canRiichi = analysis.shanten === 0 &&
                            !playerState.isRiichi &&
                            playerState.melds.every(m => !m.isOpen) &&
                            playerState.score >= 1000 &&
                            playerState.hand.length === 14; // リーチはツモ後14枚の状態で判断
  } else {
    playerState.canRiichi = false; // 打牌に対してはリーチ不可
  }

  // カン可能かの判定 (ツモ時のみ、かつリーチ中でない場合)
  if (isTsumo && !playerState.isRiichi && playerState.hand.length === 14) {
    // 暗槓: 手牌に同じ牌が4枚
    const counts = new Map<string, number>();
    playerState.hand.forEach(tile => counts.set(tile.id, (counts.get(tile.id) || 0) + 1));
    for (const count of counts.values()) {
      if (count === 4) {
        playerState.canKan = true;
        break;
      }
    }
    // 加槓: 既にポンしている刻子に1枚加える
    if (!playerState.canKan) {
      for (const meld of playerState.melds) {
        if (meld.type === 'koutsu' && meld.isOpen) { // ポンした刻子
          if (playerState.hand.find(tileInHand => isSameTile(tileInHand, meld.tiles[0]))) {
            playerState.canKan = true;
            break;
          }
        }
      }
    }
  } else {
    playerState.canKan = false;
  }

  // ポン可能かの判定 (相手の打牌時のみ、かつリーチ中でない場合)
  // agariTile が相手の捨て牌に相当する
  if (!isTsumo && !playerState.isRiichi && agariTile) {
    const sameTileCountInHand = playerState.hand.filter(tileInHand => isSameTile(tileInHand, agariTile)).length;
    if (sameTileCountInHand >= 2) {
      playerState.canPon = true;
      playerState.tileToPon = agariTile;
    }
  }

  // TODO: 大明槓の判定 (相手の打牌に対して)
  // ここで playerState.canKan も更新しうる

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

  // 規定局数終了判定の前に九種九牌などの流局をチェック
  if (nextState.phase === GamePhase.Draw) {
    // すでに流局（例：山切れ）と判断されていれば、そのまま次の局へ
  } else {
    // ここで次の局の配牌を行う前に九種九牌をチェック (proceedToNextRoundOrEndGame の責務)
    const tempYamaForKyuuCheck = createYama(); // チェックのため一時的な山を作成
    const { playerHand: nextPlayerHandKyuu, cpuHand: nextCpuHandKyuu } = dealInitialHands(tempYamaForKyuuCheck);

    if (isKyuushuuKyuuhai(nextPlayerHandKyuu) || isKyuushuuKyuuhai(nextCpuHandKyuu)) {
      const kyuushuuPlayer = isKyuushuuKyuuhai(nextPlayerHandKyuu) ? nextState.oya : (nextState.oya === PlayerID.Player ? PlayerID.CPU : PlayerID.Player) ; // 親から見て
      nextState.phase = GamePhase.Draw;
      nextState.lastActionMessage = `${kyuushuuPlayer}が九種九牌のため流局しました。本場を増やして継続します。`;
      nextState.honba++; // 九種九牌は本場を増やし、親は流れない
      // yama, player.hand, cpu.hand などは次のループの最初で再設定されるので、ここでは変更しない
      // (oyaも変わらない)
      // return proceedToNextRoundOrEndGame(nextState); // 再帰的に呼び出すか、フラグで制御
      // この後の通常の局開始処理で新しい手牌が配られるため、ここではメッセージ設定と本場追加のみ
    }
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
  nextState.kanCount = 0; // 新しい局でカンカウントをリセット

  // 九種九牌で流局した場合、このタイミングで手牌を再配布し、ゲームを再開する
  // ただし、上記で `nextState.phase = GamePhase.Draw` としているため、
  // `proceedToNextRoundOrEndGame` が再度呼ばれることを期待する。
  // もし `phase` が `Draw` であれば、手牌の再配布と親のツモから再開。
  if (currentState.phase === GamePhase.Draw && currentState.lastActionMessage?.includes("九種九牌")) {
      // 既にproceedToNextRoundOrEndGameの中で手牌は配られているはず
      // firstDraw の処理でツモも行われている
      // lastActionMessageで九種九牌だったことを記録してある
      // 特にここでは何もしない。
      // nextState.lastActionMessage = `${currentState.oya}が九種九牌で流局したため、局を再開します。`;
  }

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

      if (opponentPlayer.canRon && opponentPlayerId === PlayerID.Player) {
        // プレイヤーがロン可能な状態。プレイヤーのアクションを待つ。
        nextState.lastActionMessage += ` あなたはロン可能です。`;
        // この時点でCPUのツモ・打牌は行わない。プレイヤーのロン選択を待つ。
      } else if (opponentPlayer.canRon && opponentPlayerId === PlayerID.CPU) {
        // CPUがロン可能な場合、その情報を伝える (実際のロン実行は次のCPUのアクションで)
        nextState.lastActionMessage += ` CPUはロン可能です。`;
        // nextState = processAction(nextState, PlayerID.CPU, { type: ActionType.Ron }); // 再帰呼び出しは避ける
        // gameEndedThisTurn = true;
      } else if (nextState.yama.tiles.length > 0) {
        // ロンされず、山が残っていれば相手(CPU)のツモ
        const drawResult = drawTile(nextState.yama);
        nextState.yama = drawResult.updatedYama;
        if (drawResult.tile) {
          opponentPlayer.hand.push(drawResult.tile);
          opponentPlayer.hand.sort(compareTiles);
          opponentPlayer.lastDraw = drawResult.tile;
          updateActionFlagsForPlayer(opponentPlayer, nextState, drawResult.tile, true); // Tile型であることは保証されている
          nextState.lastActionMessage += ` ${opponentPlayerId === PlayerID.Player ? "あなた" : "CPU"}がツモりました。`;

          // CPUのターンであれば、ツモ後に打牌を行う
          if (opponentPlayerId === PlayerID.CPU) {
            if (opponentPlayer.canTsumoAgari) {
              // CPUはツモ和了を選択 (仮の即ツモAI)
              // TODO: CPUのツモ和了判断ロジックを後で高度化する
              nextState = processAction(nextState, PlayerID.CPU, { type: ActionType.TsumoAgari });
              gameEndedThisTurn = true;
            } else if (opponentPlayer.canRiichi && opponentPlayer.score >= 1000 && opponentPlayer.melds.every(m => !m.isOpen)) {
              // CPUがリーチ可能な場合、リーチを選択する (仮の即リーチAI)
              // TODO: CPUのリーチ判断ロジックを後で高度化する (例: 残り山、待ちの形など)
              // リーチ時に捨てる牌を選択 (現在のgetCpuDiscardロジックと同様の考え方)
              const cpuHandForRiichi = opponentPlayer.hand;
              let tileToDiscardForRiichi: Tile;
              if (cpuHandForRiichi.length > 0) {
                // ここで最も向聴数が進まない or 安全そうな牌を選ぶ (getCpuDiscardの簡易版)
                // 簡単のため、一旦ランダムでリーチ宣言牌を選択
                // 本来は analyzeHandShanten を使って、リーチしても待ちが変わらないように、かつ最適な打牌を選ぶ
                tileToDiscardForRiichi = cpuHandForRiichi[Math.floor(Math.random() * cpuHandForRiichi.length)];
              } else {
                console.error("CPU hand is empty before Riichi discard, should not happen.");
                tileToDiscardForRiichi = { id: '1m', name: '一萬', suit: TileSuit.MANZU, value: 1, isRedDora: false };
              }
              nextState = processAction(nextState, PlayerID.CPU, { type: ActionType.Riichi, tileToDiscard: tileToDiscardForRiichi! });
              // gameEndedThisTurn は processAction の中で処理されるのでここでは不要
            } else {
              // CPUの打牌選択
              // まずカンできるかチェック (暗槓のみ、リーチしてない場合)
              let performedKan = false;
              if (opponentPlayer.canKan && !opponentPlayer.isRiichi) {
                const counts = new Map<string, Tile[]>();
                for (const tile of opponentPlayer.hand) {
                  const tileList = counts.get(tile.id) || [];
                  tileList.push(tile);
                  counts.set(tile.id, tileList);
                }
                for (const [tileId, tileList] of counts.entries()) {
                  if (tileList.length === 4) {
                    // 暗槓実行
                    nextState = processAction(nextState, PlayerID.CPU, {
                        type: ActionType.Kan,
                        tile: tileList[0]!, // non-null assertion を追加
                        meldType: 'ankan'
                    });
                    performedKan = true;
                    // gameEndedThisTurn は processAction の中で処理される想定
                    break; // 1つカンしたら一旦終わり
                  }
                }
              }

              if (!performedKan) {
                // カンを実行しなかった場合、通常の打牌処理
                // TODO: route.tsのgetCpuDiscardを移植/参照する
                const cpuHand = opponentPlayer.hand;
                let cpuDiscardTile: Tile;
                if (cpuHand.length > 0) {
                  // ここに getCpuDiscard のロジックを簡易的に移植するか、ランダムにする
                  // 例: analyzeHandShanten を使って最も向聴数が進まない牌を選ぶなど
                  // 今回は一旦ランダムのままにしておく (外部のgetCpuDiscardに依存しないようにするため)
                  cpuDiscardTile = cpuHand[Math.floor(Math.random() * cpuHand.length)];
                } else {
                  // 手牌がない状況はありえないはずだが、フォールバック
                  console.error("CPU hand is empty before discard, which should not happen.");
                  // この場合、エラーを投げるか、ゲームを強制終了させるべきかもしれない
                  // ここではダミーの牌を生成してエラーを防ぐ (デバッグ用)
                  cpuDiscardTile = { id: '1m', name: '一萬', suit: TileSuit.MANZU, value: 1, isRedDora: false };
                }

                opponentPlayer.hand = removeTileFromPlayerHand(opponentPlayer.hand, cpuDiscardTile!);
                opponentPlayer.river.push({ ...cpuDiscardTile!, discardedBy: PlayerID.CPU, turn: nextState.turnCount });
                opponentPlayer.lastDiscard = cpuDiscardTile!;
                opponentPlayer.justKaned = false;
                nextState.turn = PlayerID.Player; // プレイヤーのターンに戻る

                // プレイヤーの打牌に対するロン判定 (CPUの捨て牌に対して)
                if (cpuDiscardTile) {
                  const confirmedCpuDiscardTile: Tile = cpuDiscardTile; // 型を明確にするためにローカル変数に代入
                  updateActionFlagsForPlayer(nextState.player, nextState, confirmedCpuDiscardTile, false);
                  if (nextState.player.canRon) {
                    nextState.lastActionMessage += ` あなたはロン可能です。`;
                  }
                }

                // プレイヤーのツモ処理 (ロンがなければ)
                if (!nextState.player.canRon && nextState.yama.tiles.length > 0) {
                  const playerDrawResult = drawTile(nextState.yama);
                  nextState.yama = playerDrawResult.updatedYama;
                  if (playerDrawResult.tile) {
                    nextState.player.hand.push(playerDrawResult.tile);
                    nextState.player.hand.sort(compareTiles);
                    nextState.player.lastDraw = playerDrawResult.tile;
                    updateActionFlagsForPlayer(nextState.player, nextState, playerDrawResult.tile, true);
                    nextState.lastActionMessage += ` あなたがツモりました。`;
                  } else {
                    nextState.phase = GamePhase.Draw;
                    nextState.winner = null;
                    gameEndedThisTurn = true;
                  }
                } else if (!nextState.player.canRon && nextState.yama.tiles.length === 0) {
                  // ロンもできず山もなし
                  nextState.phase = GamePhase.Draw;
                  nextState.winner = null;
                  gameEndedThisTurn = true;
                }
              }
            }
          }
        } else {
          // 山切れ (通常は発生しないはず、drawTileがnullを返すのは嶺上牌など特殊なケース)
          nextState.phase = GamePhase.Draw;
          nextState.winner = null;
          gameEndedThisTurn = true;
        }
      }
      break;

    case ActionType.Riichi:
      if (!action.tileToDiscard) {
        console.error("Riichi action in processAction without tileToDiscard", action);
        nextState.lastActionMessage = "エラー: リーチ時に捨てる牌が指定されていませんでした。(内部処理エラー)";
        break;
      }
      const tileToDiscardForRiichi = action.tileToDiscard;
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
      let isActuallyKan = false; // action.meldType が正しくカンを示しているか

      if (action.meldType === "ankan" && action.tile) { // 暗槓
          const tileForAnkan = action.tile;
          const count = actingPlayer.hand.filter(t => t.id === tileForAnkan.id).length;
          if (count === 4) {
              const ankanMeld: Meld = { type: 'kantsu', tiles: [tileForAnkan, tileForAnkan, tileForAnkan, tileForAnkan], isOpen: false };
              actingPlayer.melds.push(ankanMeld);
              actingPlayer.hand = actingPlayer.hand.filter(t => t.id !== tileForAnkan.id);
              kanSuccess = true;
              kanTypeMessage = "暗槓";
              isActuallyKan = true;
          }
      } else if (action.meldType === "kakan" && action.meld && action.tile) { // 加槓
          const tileForKakan = action.tile;
          const meldToUpgrade = action.meld;

          const koutsuToUpgrade = actingPlayer.melds.find(m =>
              m.type === 'koutsu' &&
              m.tiles.length === 3 &&
              isSameTile(m.tiles[0], meldToUpgrade.tiles[0])
          );
          const tileInHand = actingPlayer.hand.find(t => isSameTile(t, tileForKakan));

          if (koutsuToUpgrade && tileInHand) {
              if (!isSameTile(koutsuToUpgrade.tiles[0], tileForKakan)) {
                  console.error("Kakan error: Tile in hand does not match koutsu type for kakan.");
                  nextState.lastActionMessage = "エラー: 加槓する牌の種類が元の刻子と一致しません。";
                  break;
              }
              koutsuToUpgrade.type = 'kantsu';
              koutsuToUpgrade.tiles.push(tileForKakan);
              actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, tileForKakan));
              kanSuccess = true;
              kanTypeMessage = "加槓";
              isActuallyKan = true;
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
                  isActuallyKan = true;
              }
          }
      }

      if (kanSuccess && isActuallyKan) {
          nextState.kanCount++;
          nextState.yama = revealKanDora(nextState.yama);
          nextState.dora = getCurrentDora(nextState.yama);
          actingPlayer.justKaned = true;
          nextState.lastActionMessage = `${playerId === PlayerID.Player ? "あなた" : "CPU"}が ${action.tile?.id || action.meld?.tiles[0].id} で${kanTypeMessage}しました。嶺上牌をツモります。`;

          if (nextState.kanCount === 4) {
            // 四開槓による流局チェック (嶺上開花より優先するかどうかはルール次第)
            // ここでは、4回目のカン成立時点で、ツモアガリがなければ流局とする
            const rinshanDrawCheck = drawRinshanTile(nextState.yama); // ツモだけして戻すわけにはいかない
            let canRinshanAgari = false;
            if (rinshanDrawCheck.tile) {
                const tempHandForRinshan = [...actingPlayer.hand, rinshanDrawCheck.tile];
                const playerWindRinshan = playerId === nextState.oya ? HonorType.TON : HonorType.NAN;
                const rinshanAgariContext: AgariContext = {
                    agariTile: rinshanDrawCheck.tile,
                    isTsumo: true, isRiichi: actingPlayer.isRiichi, playerWind: playerWindRinshan, roundWind: HonorType.TON,
                    doraTiles: getCurrentDora(nextState.yama), uraDoraTiles: actingPlayer.isRiichi ? getCurrentUraDora(nextState.yama) : undefined,
                    turnCount: nextState.turnCount, isMenzen: actingPlayer.melds.every(m => !m.isOpen), isRinshan: true,
                };
                const rinshanAnalysis = analyzeHandShanten(tempHandForRinshan.filter(t => !isSameTile(t, rinshanDrawCheck.tile!)), actingPlayer.melds, rinshanAgariContext);
                if (rinshanAnalysis.shanten === -1 && rinshanAnalysis.agariResult && rinshanAnalysis.agariResult.score) {
                    canRinshanAgari = true;
                }
            }

            if (!canRinshanAgari) {
                nextState.phase = GamePhase.Draw;
                nextState.winner = null;
                nextState.lastActionMessage = `四開槓のため流局しました。 (${nextState.kanCount}回目のカン)`;
                // proceedToNextRoundOrEndGame へ続くので、本場などはそちらで処理
                gameEndedThisTurn = true; // これにより proceedToNextRoundOrEndGame が呼ばれる
                // この後の嶺上牌を引く処理はスキップされるべきだが、gameEndedThisTurn で制御
            }
          }

          if (!gameEndedThisTurn) { // 四開槓で流局していなければ嶺上牌を引く
            const rinshanDrawResult = drawRinshanTile(nextState.yama);
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
          }
      } else {
          nextState.lastActionMessage = "エラー: カンできませんでした。";
      }
      break;

    case ActionType.Pon:
      if (!opponentPlayer.lastDiscard || !action.targetTile || !isSameTile(opponentPlayer.lastDiscard, action.targetTile)) {
        nextState.lastActionMessage = "エラー: ポン対象の牌が正しくありません。相手の直前の捨て牌と一致しません。";
        break;
      }
      const targetPonTile = action.targetTile; // 相手の捨て牌

      const handTilesForPon = actingPlayer.hand.filter(t => isSameTile(t, targetPonTile));
      if (handTilesForPon.length < 2) {
        nextState.lastActionMessage = "エラー: ポンするための牌が手牌に足りません。";
        break;
      }
      if (actingPlayer.isRiichi) {
        nextState.lastActionMessage = "エラー: リーチ中にポンはできません。";
        break;
      }

      // ポン成功
      const ponMeld: Meld = {
        type: 'koutsu',
        tiles: [handTilesForPon[0], handTilesForPon[1], targetPonTile].sort(compareTiles),
        isOpen: true,
        fromWho: opponentPlayerId,
      };
      actingPlayer.melds.push(ponMeld);

      let removedCount = 0;
      actingPlayer.hand = actingPlayer.hand.filter(t => {
        if (removedCount < 2 && isSameTile(t, targetPonTile)) {
          removedCount++;
          return false;
        }
        return true;
      });
      actingPlayer.hand.sort(compareTiles);

      actingPlayer.justKaned = false;
      opponentPlayer.canRon = false; // ポンされたらロンはできない
      opponentPlayer.canPon = false; // 連続して相手はポンできない
      opponentPlayer.canKan = false; // 大明槓の機会も失う

      nextState.turn = playerId;
      nextState.lastActionMessage = `${playerId === PlayerID.Player ? "あなた" : "CPU"}が ${opponentPlayerId === PlayerID.Player ? "あなた" : "CPU"} の ${targetPonTile.id} をポンしました。打牌してください。`;

      // ポン後のアクションフラグ (打牌のみ可能、カンなどは次のツモ後)
      actingPlayer.canRiichi = false;
      actingPlayer.canTsumoAgari = false;
      actingPlayer.canRon = false;
      actingPlayer.canPon = false;
      actingPlayer.canKan = false; // ポン直後のカンは一旦考えない (UIシンプル化のため)
      // 実際には打牌前に暗槓・加槓の判定をしても良いが、今回は省略
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
