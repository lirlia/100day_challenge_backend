import { Tile, isSameTile, compareTiles, HonorType, TileSuit } from './tiles';
import { Yama, createYama, dealInitialHands, drawTile, getCurrentDora, revealKanDora, getCurrentUraDora, drawRinshanTile } from './yama';
import { analyzeHandShanten, Meld as HandMeld, HandPattern, AgariInfo, AgariContext, removeTileFromHand as removeTileFromPlayerHand, isKyuushuuKyuuhai, removeAllTilesFromHand, MachiPattern } from './hand';
import { checkYaku, YakuResult, HandContext as YakuHandContext } from './yaku';
import { calculateFu, FuCalculationResult } from './fu';
import { calculateScore, ScoreResult, ScoreOptions, getScoreNameAndPayments } from './score';
import type { AgariContext as OldAgariContext } from './hand';
import { decideCpuAction, decideCpuNakiAction } from './cpu_player'; // CPUロジックをインポート

export type PlayerIdentifier = 'player' | 'cpu';
// type PlayerID_Dev = 'player' | 'cpu'; // 新しい型名を定義
// export type { PlayerID_Dev as PlayerID }; // 新しい型名でエクスポート

export enum GamePhase {
  PLAYER_TURN = 'PLAYER_TURN',
  CPU_TURN = 'CPU_TURN',
  GAME_OVER = 'GAME_OVER', // ゲーム終了 (勝者決定または流局)
  ROUND_ENDED = 'ROUND_ENDED', // ラウンド終了
}

// アクションの種類を定義
export enum ActionType {
  Discard = "discard",
  Riichi = "riichi",
  Kan = "kan", // 暗槓・加槓・大明槓を包含。詳細はmeldTypeで
  TsumoAgari = "tsumo_agari",
  Ron = "ron",
  Pon = "pon",
  // TODO: チー (二人麻雀では通常なし)
}

export type Meld = HandMeld; // hand.ts の Meld を再エクスポート

export interface KanPossibility {
  type: 'ankan' | 'kakan' | 'daiminkan';
  tile: Tile; // 暗槓・大明槓の場合、カンする4枚の牌のうちの1枚, kakan: 加える牌
  meldToUpgrade?: Meld; // kakan の場合、対象のポンした刻子
}

export interface GameAction {
  type: ActionType;
  tile?: Tile; // discard, kan (ankan, daiminkan), kakan (加える牌)
  tileToDiscard?: Tile;   // リーチ時に捨てる牌
  meldType?: 'ankan' | 'kakan' | 'daiminkan' | 'pon'; // Kanアクションの詳細
  meld?: Meld;            // 加槓の場合の元の刻子
  targetTile?: Tile; // ポン、チーの対象となる相手の捨て牌 (Ponアクションで使用)
}

// 河の牌の型 (Tile に追加情報)
export interface TileInRiver extends Tile {
  discardedBy: PlayerIdentifier;
  turn: number;
  isRiichiDeclare?: boolean;
}
export interface PlayerState {
  hand: Tile[];         // 手牌 (ツモ牌を含む場合は14枚、それ以外は13枚)
  river: TileInRiver[];  // 捨て牌の履歴
  melds: Meld[];      // 副露した面子
  score: number;        // 現在の点数
  isRiichi: boolean;    // リーチしているか
  riichiTileIndex: number | null; // リーチ宣言牌が手牌の何番目か（リーチ後ツモ切り時に使用）
  riichiTurn: number;   // リーチ宣言した巡目 (フリテン確認などに使用)
  seatWind: HonorType; // 自風 (東:1, 南:2, 西:3, 北:4) を追加

  // アクション可能フラグ (サーバーサイドで設定)
  canRiichi?: boolean;
  canTsumoAgari?: boolean;
  canRon?: boolean;
  canKan?: boolean; // カン可能か (暗槓、加槓、大明槓のいずれか)
  possibleKans: KanPossibility[]; // 実行可能なカンのリスト
  canPon?: boolean; // ポン可能か
  tileToPon?: Tile; // ポン可能な牌

  justKaned?: boolean; // カン直後のツモか (嶺上開花判定用)
  lastDraw?: Tile;      // 最後にツモった牌
  lastDiscard?: Tile;   // 最後に捨てた牌 (主にロン判定用)
}

export interface GameState {
  gameId: string;          // ゲームの一意なID
  phase: GamePhase;        // 現在のゲームフェーズ
  turn: number;            // 何巡目か
  currentTurn: PlayerIdentifier;   // 現在誰のターンか
  dealer: PlayerIdentifier;         // 現在の局の親プレイヤー
  wind: HonorType; // 場風 (東風戦なら東固定) 文字列からHonorTypeに変更
  round: number;           // 現在の局 (例: 1 = 東1局, 2 = 東2局)
  honba: number;           // 本場 (積み棒の数)
  riichiSticks: number;    // リーチ棒の数
  dora: Tile[];            // 現在見えているドラ牌 (表示牌ではない)
  uraDora?: Tile[];         // 裏ドラ (リーチ和了時にセットされる)
  player: PlayerState;
  cpu: PlayerState;
  yama: Yama;              // 山の状態
  winner: PlayerIdentifier | 'draw' | null; // 勝者または流局
  gameWinner?: PlayerIdentifier | 'draw' | null; // ゲーム全体の勝者
  winningHandInfo?: AgariInfo;    // 和了時の手牌情報、役、点数など
  lastAction?: GameAction; // 最後に行われたアクション
  lastActionMessage?: string; // 直前のアクションに関するメッセージ (例: "CPUが1萬を捨てました")
  turnCount: number;       // 現在の局の総巡目 (誰かが打牌するたびに+1)
  kanCount: number;      // 現在の局で行われたカンの総数
  totalRounds: number; // ゲームの総局数 (例: 4局戦)
}

export function createInitialGameState(
  gameId: string,
  playerHandTilesFromDeal: Tile[],
  cpuHandTilesFromDeal: Tile[],
  yamaFromDeal: Yama,
  dora: Tile[]
): GameState {
  const currentDealer: PlayerIdentifier = 'player'; // 東1局はプレイヤーが親と仮定

  const playerInitialSeatWind = HonorType.TON; // currentDealer が 'player' 固定なので
  const cpuInitialSeatWind = HonorType.NAN;    // currentDealer が 'player' 固定なので

  const playerKyuushuuCheckHand = [...playerHandTilesFromDeal];
  const cpuKyuushuuCheckHand = [...cpuHandTilesFromDeal];

  if (isKyuushuuKyuuhai(playerKyuushuuCheckHand) || isKyuushuuKyuuhai(cpuKyuushuuCheckHand)) {
    const kyuushuuPlayer = isKyuushuuKyuuhai(playerKyuushuuCheckHand) ? 'player' : 'cpu';
    const newYamaForKyuushuu = createYama();
    const newDoraForKyuushuu = getCurrentDora(newYamaForKyuushuu);
    // 九種九牌時は新規局扱いとする (本場+1, 点数リセットなし)
    // 本来は前の局の状態を引き継ぐべきだが、この関数の責務外とする
    return {
      gameId,
      phase: GamePhase.ROUND_ENDED,
      turn: 1,
      currentTurn: currentDealer,
      dealer: currentDealer,
      wind: HonorType.TON,
      round: 1,
      honba: 1, // 九種九牌は本場を1つ増やす (新規ゲームなら0+1)
      riichiSticks: 0, // リーチ棒はなし
      dora: newDoraForKyuushuu,
      // スコアは初期値のまま (この関数は新規ゲーム開始も兼ねるため)
      player: { hand: playerHandTilesFromDeal, river: [], melds: [], score: 25000, isRiichi: false, riichiTileIndex: null, riichiTurn: 0, possibleKans: [], seatWind: playerInitialSeatWind },
      cpu: { hand: cpuHandTilesFromDeal, river: [], melds: [], score: 25000, isRiichi: false, riichiTileIndex: null, riichiTurn: 0, possibleKans: [], seatWind: cpuInitialSeatWind },
      yama: newYamaForKyuushuu,
      winner: 'draw',
      lastActionMessage: `${kyuushuuPlayer === 'player' ? "あなた" : "CPU"}が九種九牌のため流局しました。本場を増やして同じ局を続けます。`,
      turnCount: 0,
      kanCount: 0,
      totalRounds: 4,
    };
  }

  const dealerInitialHand = [...playerHandTilesFromDeal];
  const nonDealerInitialHand = [...cpuHandTilesFromDeal];
  const dealerLastDraw = dealerInitialHand.length === 14 ? dealerInitialHand[dealerInitialHand.length - 1] : undefined;

  const initialPlayerState: PlayerState = {
    hand: dealerInitialHand,
    river: [], melds: [], score: 25000,
    isRiichi: false, riichiTileIndex: null, riichiTurn: 0,
    lastDraw: dealerLastDraw, // currentDealer が 'player' 固定なので、プレイヤーのツモ牌
    possibleKans: [],
    seatWind: playerInitialSeatWind,
  };

  const initialCpuState: PlayerState = {
    hand: nonDealerInitialHand,
    river: [], melds: [], score: 25000,
    isRiichi: false, riichiTileIndex: null, riichiTurn: 0,
    lastDraw: undefined, // currentDealer が 'player' 固定なので、CPUは最初はツモなし
    possibleKans: [],
    seatWind: cpuInitialSeatWind,
  };

  const initialGameState: GameState = {
    gameId,
    phase: GamePhase.PLAYER_TURN,
    turn: 1,
    currentTurn: currentDealer,
    dealer: currentDealer,
    wind: HonorType.TON,
    round: 1,
    honba: 0,
    riichiSticks: 0,
    dora,
    player: initialPlayerState,
    cpu: initialCpuState,
    yama: yamaFromDeal,
    winner: null,
    turnCount: 1,
    kanCount: 0,
    totalRounds: 4,
  };

  // currentDealer は 'player' 固定なので、最初の分岐のみ実行される
  if (dealerLastDraw) {
    updateActionFlagsForPlayer(initialGameState.player, initialGameState, dealerLastDraw, true);
  }
  // else if (currentDealer === 'cpu' && dealerLastDraw) { // このブロックは到達しない
  //    updateActionFlagsForPlayer(initialGameState.cpu, initialGameState, dealerLastDraw, true);
  // }
  return initialGameState;
}

/**
 * プレイヤーのアクション後に手牌と状況を分析し、可能なアクションフラグを更新する。
 * @param playerState 更新するプレイヤーの状態
 * @param gameState 現在のゲーム状態 (特に山、ドラなど)
 * @param agariTileForRon ツモ牌またはロン牌 (分析対象の14枚目の牌)
 * @param isTsumo ツモ和了の分析かどうか
 */
export function updateActionFlagsForPlayer(playerState: PlayerState, gameState: GameState, agariTileForRon: Tile | undefined, isTsumo: boolean) {
  const playerWind = playerState === gameState.player ?
    (gameState.dealer === 'player' ? HonorType.TON : HonorType.NAN) :
    (gameState.dealer === 'cpu' ? HonorType.TON : HonorType.NAN);
  const roundWind = HonorType.TON;

  playerState.canTsumoAgari = false;
  playerState.canRon = false;
  playerState.canRiichi = false;
  playerState.canKan = false;
  playerState.canPon = false;
  playerState.tileToPon = undefined;
  playerState.possibleKans = [];

  const currentAgariTile: Tile | undefined = isTsumo ? playerState.lastDraw : agariTileForRon;

  if (!currentAgariTile) {
    // console.warn("No agari tile for analysis in updateActionFlags.");
    return;
  }

  // このスコープでは currentAgariTile は Tile 型
  const handForAnalysis = isTsumo ? [...playerState.hand] : [...playerState.hand, currentAgariTile];

  const analysisContext: AgariContext = {
    agariTile: currentAgariTile as Tile,
    isTsumo: isTsumo,
    isRiichi: playerState.isRiichi,
    playerWind: playerWind,
    roundWind: roundWind,
    doraTiles: gameState.dora,
    uraDoraTiles: playerState.isRiichi && (gameState.phase === GamePhase.ROUND_ENDED || gameState.phase === GamePhase.GAME_OVER) ? gameState.uraDora : undefined,
    turnCount: gameState.turnCount,
    isMenzen: playerState.melds.every(m => !m.isOpen),
    isRinshan: !!playerState.justKaned,
  };

  const analysis = analyzeHandShanten(
    handForAnalysis,
    playerState.melds,
    analysisContext
  );

  if (analysis.shanten === -1 && analysis.agariResult && analysis.agariResult.score && analysis.agariResult.score.yakuList.length > 0) {
    if (isTsumo) playerState.canTsumoAgari = true;
    else playerState.canRon = true;
  } else {
    if (isTsumo) playerState.canTsumoAgari = false;
    else playerState.canRon = false;
  }

  // リーチ可能かの判定 (ツモ時のみ、14枚手牌、メンゼン、1000点以上)
  if (isTsumo && playerState.hand.length === 14) {
    playerState.canRiichi = analysis.shanten === 0 &&
                            !playerState.isRiichi &&
                            playerState.melds.every(m => !m.isOpen) &&
                            playerState.score >= 1000;
  } else {
    playerState.canRiichi = false; // 打牌に対してはリーチ不可
  }

  // カン可能かの判定
  playerState.possibleKans = []; // 毎回リセット
  if (!playerState.isRiichi) { // リーチ中は（待ちが変わらない場合を除き）暗槓・加槓は通常不可。大明槓は常に不可。
    // 暗槓: 手牌に同じ牌が4枚
    if (isTsumo && playerState.hand.length === 14) { // ツモ時で14枚
        const counts = new Map<string, { tile: Tile, count: number }>();
        playerState.hand.forEach(tile => {
            const existing = counts.get(tile.id) || { tile, count: 0 };
            existing.count++;
            counts.set(tile.id, existing);
        });
        counts.forEach(({tile, count}) => {
            if (count === 4) {
                playerState.possibleKans.push({ type: 'ankan', tile });
            }
        });
    }
    // 加槓: ポンした刻子と同じ牌を手牌に持っている
    for (const meld of playerState.melds) {
      if (meld.type === 'koutsu' && meld.isOpen) { // ポンした刻子
        const tileInHand = playerState.hand.find(tileInHand => isSameTile(tileInHand, meld.tiles[0]));
        if (tileInHand) {
          playerState.possibleKans.push({ type: 'kakan', tile: tileInHand, meldToUpgrade: meld });
        }
      }
    }
    // 大明槓: 相手の捨て牌に対して手牌に同じ牌が3枚 (agariTile が相手の捨て牌に相当)
    // これは相手の打牌時に評価されるべきなので、ここでは評価しない。
    // canPon と同様に、相手の打牌時に updateActionFlagsForPlayer が呼ばれる際に評価される。
    // ただし、canKan フラグ自体はここで更新
  }
   if (!isTsumo && currentAgariTile && !playerState.isRiichi) { // 相手の打牌時、かつリーチ中でない
    const sameTileCountInHandForDaiminkan = playerState.hand.filter(tileInHand => isSameTile(tileInHand, currentAgariTile)).length;
    if (sameTileCountInHandForDaiminkan === 3) {
        playerState.possibleKans.push({ type: 'daiminkan', tile: currentAgariTile });
    }
  }

  playerState.canKan = playerState.possibleKans.length > 0;

  // ポン可能かの判定 (相手の捨て牌に対して)
  // isTsumo が false の場合、currentAgariTile は相手の捨て牌
  if (!isTsumo && !playerState.isRiichi && currentAgariTile) {
    const sameTileCountInHand = playerState.hand.filter(tileInHand => isSameTile(tileInHand, currentAgariTile)).length;
    if (sameTileCountInHand >= 2) {
      playerState.canPon = true;
      playerState.tileToPon = currentAgariTile;
    }
  }
}

export function proceedToNextRoundOrEndGame(currentState: GameState): GameState {
  let nextState = JSON.parse(JSON.stringify(currentState)) as GameState;

  if (nextState.player.score <= 0) {
    nextState.phase = GamePhase.GAME_OVER;
    nextState.gameWinner = 'cpu';
    nextState.lastActionMessage = "プレイヤーの点数が0点以下になったため、CPUの勝利です。";
    return nextState;
  }
  if (nextState.cpu.score <= 0) {
    nextState.phase = GamePhase.GAME_OVER;
    nextState.gameWinner = 'player';
    nextState.lastActionMessage = "CPUの点数が0点以下になったため、あなたの勝利です。";
    return nextState;
  }

  let renchan = false;
  if (nextState.winner === nextState.dealer) {
    renchan = true;
    nextState.honba++;
  } else if (nextState.winner === 'draw') {
    // TODO: 親テンパイ判定 (isTenpai(nextState.dealer === 'player' ? nextState.player : nextState.cpu))
    // renchan = isTenpai(...);
    renchan = false; // 仮: 流局は親流れ
    nextState.honba++;
  } else {
    renchan = false;
    nextState.honba = 0;
  }

  let newDealer = nextState.dealer;
  if (!renchan) {
    newDealer = nextState.dealer === 'player' ? 'cpu' : 'player';
  }

  if (nextState.round >= nextState.totalRounds && !renchan) {
      nextState.phase = GamePhase.GAME_OVER;
      if (nextState.player.score > nextState.cpu.score) nextState.gameWinner = 'player';
      else if (nextState.cpu.score > nextState.player.score) nextState.gameWinner = 'cpu';
      else nextState.gameWinner = 'draw';
      nextState.lastActionMessage = `最終局(${nextState.wind === HonorType.TON ? '東' : '南'}${nextState.round}局 ${nextState.honba}本場)が終了しました。`;
      return nextState;
  }

  nextState.round = renchan ? nextState.round : nextState.round + 1;
  if (nextState.round > nextState.totalRounds && !renchan) {
      nextState.phase = GamePhase.GAME_OVER;
      if (nextState.player.score > nextState.cpu.score) nextState.gameWinner = 'player';
      else if (nextState.cpu.score > nextState.player.score) nextState.gameWinner = 'cpu';
      else nextState.gameWinner = 'draw';
      nextState.lastActionMessage = `最終局(${nextState.wind === HonorType.TON ? '東' : '南'}${nextState.round}局 ${nextState.honba}本場)が終了しました。`;
      return nextState;
  }

  nextState.dealer = newDealer;
  nextState.player.seatWind = nextState.dealer === 'player' ? HonorType.TON : HonorType.NAN;
  nextState.cpu.seatWind = nextState.dealer === 'cpu' ? HonorType.TON : HonorType.NAN;

  nextState.yama = createYama();
  nextState.dora = getCurrentDora(nextState.yama);
  nextState.uraDora = undefined;
  nextState.winner = null;
  nextState.winningHandInfo = undefined;
  nextState.turnCount = 1;
  nextState.kanCount = 0;

  [nextState.player, nextState.cpu].forEach(p => {
    p.hand = [];
    p.river = [];
    p.melds = [];
    p.isRiichi = false; p.riichiTileIndex = null; p.riichiTurn = 0;
    p.canRiichi = false; p.canTsumoAgari = false; p.canRon = false;
    p.canKan = false; p.possibleKans = []; p.canPon = false; p.tileToPon = undefined;
    p.justKaned = false; p.lastDraw = undefined; p.lastDiscard = undefined;
  });

  // dealInitialHands は dealer 情報を使わない (yama.ts 側で親決め固定)
  const { playerHand: newPlayerHand, cpuHand: newCpuHand, updatedYama: yamaAfterDeal } = dealInitialHands(nextState.yama);
  nextState.player.hand = newPlayerHand;
  nextState.cpu.hand = newCpuHand;
  nextState.yama = yamaAfterDeal;

  // 注意: dealInitialHands が親（プレイヤー）に14枚、子（CPU）に13枚配る前提。
  // もし dealer が CPU の場合、ここで手牌を入れ替えるか、dealInitialHands を修正する必要がある。
  // 現在の dealInitialHands はプレイヤー親固定なので、dealer が CPU の場合に不整合。
  if (nextState.dealer === 'cpu') {
      // CPUが親なので、CPUが14枚、プレイヤーが13枚になるように調整
      const tempPlayerHand = [...nextState.player.hand]; // 14枚のはず (dealInitialHandsの結果)
      const tempCpuHand = [...nextState.cpu.hand];   // 13枚のはず

      if (tempPlayerHand.length === 14 && tempCpuHand.length === 13) {
          nextState.cpu.hand = tempPlayerHand; // CPUに14枚
          nextState.player.hand = tempCpuHand; // Playerに13枚
      } else {
          console.error("Hand distribution mismatch when CPU is dealer in proceedToNextRoundOrEndGame");
      }
  }

  nextState.currentTurn = nextState.dealer;
  nextState.phase = nextState.currentTurn === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN;
  const activePlayerState = nextState.currentTurn === 'player' ? nextState.player : nextState.cpu;

  const firstTsumoTile = activePlayerState.hand.length > 0 && (activePlayerState.hand.length % 3 === 2)
                         ? activePlayerState.hand[activePlayerState.hand.length - 1]
                         : undefined; // 親は14枚、子は13枚のはず。ツモ牌は14枚目の牌。
  activePlayerState.lastDraw = firstTsumoTile;

  if (firstTsumoTile) {
      updateActionFlagsForPlayer(activePlayerState, nextState, firstTsumoTile, true);
  }
  nextState.lastActionMessage = `${nextState.currentTurn === 'player' ? "あなた" : "CPU"}の親番で${nextState.wind === HonorType.TON ? '東' : '南'}${nextState.round}局 ${nextState.honba}本場が開始されました。`;

  return nextState;
}

export function processAction(currentState: GameState, playerId: PlayerIdentifier, action: GameAction): GameState {
  let nextState = JSON.parse(JSON.stringify(currentState)) as GameState;
  nextState.lastAction = action;
  nextState.lastActionMessage = ""; // メッセージを初期化

  const actingPlayer = playerId === 'player' ? nextState.player : nextState.cpu;
  const opponentPlayer = playerId === 'player' ? nextState.cpu : nextState.player;
  const opponentPlayerId = playerId === 'player' ? 'cpu' : 'player';

  let gameEndedThisTurn = false; // このアクションで局が終了したか
  let playerAutoPasses = false; // プレイヤーが自動的にパスしたか (CPUのリーチ宣言など)

  const currentWind = playerId === nextState.dealer ? HonorType.TON : HonorType.NAN; // 仮 東家/南家 (二人麻雀)
  const roundWind = HonorType.TON; // 二人麻雀の場風は常に東

  switch (action.type) {
    case ActionType.Discard:
      if (!action.tile) {
        console.error("Discard action without tile", action);
        nextState.lastActionMessage = "エラー: 捨てる牌が指定されていません。";
        break;
      }
      const discardedTile = action.tile;
      console.log(`[Discard Pre] ${playerId} hand length: ${actingPlayer.hand.length}, discarding: ${discardedTile.id}`);
      actingPlayer.hand = removeTileFromPlayerHand(actingPlayer.hand, discardedTile);
      console.log(`[Discard Post] ${playerId} hand length: ${actingPlayer.hand.length}`);
      actingPlayer.river.push({ ...discardedTile, discardedBy: playerId, turn: nextState.turnCount });
      actingPlayer.lastDiscard = discardedTile;
      actingPlayer.justKaned = false; // カン直後フラグをリセット
      nextState.lastActionMessage = `${playerId === 'player' ? "あなた" : "CPU"}が ${discardedTile.id} を捨てました。`;

      // 捨て牌に対する相手のアクションフラグ更新 (ロン、ポン、カンなど)
      updateActionFlagsForPlayer(opponentPlayer, nextState, discardedTile, false);

      // CPUが相手の場合、鳴きを判断
      if (opponentPlayerId === 'cpu') {
        const nakiAction = decideCpuNakiAction(nextState, discardedTile);
        if (nakiAction) {
          nextState.lastActionMessage += ` CPUが${nakiAction.type === ActionType.Ron ? "ロン" : nakiAction.type === ActionType.Pon ? "ポン" : "カン"}します。`;
          return processAction(nextState, 'cpu', nakiAction); // CPUのアクションを処理
        }
      }

      if (opponentPlayer.canRon) {
        nextState.lastActionMessage += ` ${opponentPlayerId === 'player' ? "あなた" : "CPU"}はロン可能です。`;
        // プレイヤーにロンの選択をさせるため、ターンはまだ移動しない。UIからの応答待ち。
        nextState.phase = opponentPlayerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN; // ロン選択待ち
      } else if (opponentPlayer.canPon || (opponentPlayer.possibleKans.find(k => k.type === 'daiminkan'))) {
        nextState.lastActionMessage += ` ${opponentPlayerId === 'player' ? "あなた" : "CPU"}はポンまたはカンが可能です。`;
        nextState.phase = opponentPlayerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN; // ポン/カン選択待ち
      } else {
        // ロンもポンもカンもなければ、相手のツモ番へ
        nextState.currentTurn = opponentPlayerId;
        nextState.turnCount++; // 巡目を進める
        if (nextState.yama.tiles.length > 0) {
          const drawResult = drawTile(nextState.yama);
          nextState.yama = drawResult.updatedYama;
          if (drawResult.tile) {
            console.log(`[Draw Pre] ${opponentPlayerId} hand length: ${opponentPlayer.hand.length}, drawing: ${drawResult.tile?.id}`);
            opponentPlayer.hand.push(drawResult.tile);
            console.log(`[Draw Post] ${opponentPlayerId} hand length: ${opponentPlayer.hand.length}`);
            opponentPlayer.hand.sort(compareTiles);
            opponentPlayer.lastDraw = drawResult.tile;
            nextState.lastActionMessage += ` ${opponentPlayerId === 'player' ? "あなた" : "CPU"}がツモりました。`;
            updateActionFlagsForPlayer(opponentPlayer, nextState, drawResult.tile, true);
            // CPUの自動ツモアガリ/リーチ判断はここでは行わず、CPUの打牌処理に含める
            nextState.phase = opponentPlayerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN;

            // CPUのターンの場合、自動でアクションを決定して処理
            if (opponentPlayerId === 'cpu' && nextState.phase === GamePhase.CPU_TURN) {
              const cpuAction = decideCpuAction(nextState);
              return processAction(nextState, 'cpu', cpuAction);
            }
          } else {
            nextState.lastActionMessage += "山がなくなりました。";
            nextState.winner = 'draw'; // 山切れ流局
            nextState.phase = GamePhase.ROUND_ENDED;
            gameEndedThisTurn = true;
          }
        } else {
          nextState.lastActionMessage += "山がなくなりました。";
          nextState.winner = 'draw'; // 山切れ流局
          nextState.phase = GamePhase.ROUND_ENDED;
          gameEndedThisTurn = true;
        }
      }
      break;

    case ActionType.Riichi:
      if (!action.tileToDiscard) {
        console.error("Riichi action without tileToDiscard", action);
        nextState.lastActionMessage = "エラー: リーチ時に捨てる牌が指定されていません。";
        break;
      }
      if (!actingPlayer.canRiichi) {
        console.warn("Riichi declared but not possible.");
        nextState.lastActionMessage = "エラー: 現在リーチできません。";
        break;
      }

      const tileToDiscardForRiichi = action.tileToDiscard;
      actingPlayer.isRiichi = true;
      actingPlayer.riichiTurn = nextState.turnCount;
      actingPlayer.score -= 1000; // 供託金
      nextState.riichiSticks++;

      // リーチ宣言牌を捨てる (Discardと同じ処理)
      console.log(`[Discard Pre Riichi] ${playerId} hand length: ${actingPlayer.hand.length}, discarding: ${tileToDiscardForRiichi.id}`);
      actingPlayer.hand = removeTileFromPlayerHand(actingPlayer.hand, tileToDiscardForRiichi);
      console.log(`[Discard Post Riichi] ${playerId} hand length: ${actingPlayer.hand.length}`);
      actingPlayer.river.push({ ...tileToDiscardForRiichi, discardedBy: playerId, turn: nextState.turnCount, isRiichiDeclare: true });
      actingPlayer.lastDiscard = tileToDiscardForRiichi;
      actingPlayer.canRiichi = false; // リーチ後はリーチできない
      nextState.lastActionMessage = `${playerId === 'player' ? "あなた" : "CPU"}がリーチを宣言し、${tileToDiscardForRiichi.id} を捨てました。`;

      // リーチ宣言牌に対する相手のアクションフラグ更新
      updateActionFlagsForPlayer(opponentPlayer, nextState, tileToDiscardForRiichi, false);

      if (opponentPlayer.canRon) {
        nextState.lastActionMessage += ` ${opponentPlayerId === 'player' ? "あなた" : "CPU"}はロン可能です。`;
        nextState.phase = opponentPlayerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN; // ロン選択待ち
      } else {
        // ロンがなければ、相手のツモ番へ
        nextState.currentTurn = opponentPlayerId;
        nextState.turnCount++;
        if (nextState.yama.tiles.length > 0) {
          const drawResult = drawTile(nextState.yama);
          nextState.yama = drawResult.updatedYama;
          if (drawResult.tile) {
            console.log(`[Draw Pre Riichi] ${opponentPlayerId} hand length: ${opponentPlayer.hand.length}, drawing: ${drawResult.tile?.id}`);
            opponentPlayer.hand.push(drawResult.tile);
            console.log(`[Draw Post Riichi] ${opponentPlayerId} hand length: ${opponentPlayer.hand.length}`);
            opponentPlayer.hand.sort(compareTiles);
            opponentPlayer.lastDraw = drawResult.tile;
            nextState.lastActionMessage += ` ${opponentPlayerId === 'player' ? "あなた" : "CPU"}がツモりました。`;
            updateActionFlagsForPlayer(opponentPlayer, nextState, drawResult.tile, true);
            nextState.phase = opponentPlayerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN;

            // CPUのターンの場合、自動でアクションを決定して処理
            if (opponentPlayerId === 'cpu' && nextState.phase === GamePhase.CPU_TURN) {
              const cpuAction = decideCpuAction(nextState);
              return processAction(nextState, 'cpu', cpuAction);
            }
          } else {
            nextState.lastActionMessage += "山がなくなりました。";
            nextState.winner = 'draw';
            nextState.phase = GamePhase.ROUND_ENDED;
            gameEndedThisTurn = true;
          }
        } else {
          nextState.lastActionMessage += "山がなくなりました。";
          nextState.winner = 'draw';
          nextState.phase = GamePhase.ROUND_ENDED;
          gameEndedThisTurn = true;
        }
      }
      break;

    case ActionType.TsumoAgari:
      if (currentState.currentTurn !== playerId) throw new Error("Not your turn to declare Tsumo Agari.");
      if (!actingPlayer.canTsumoAgari) throw new Error("Cannot Tsumo Agari now.");
      if (!actingPlayer.lastDraw) throw new Error("No last draw tile for Tsumo Agari in processAction.");

      const agariContextForTsumo: AgariContext = {
        agariTile: actingPlayer.lastDraw,
        isTsumo: true,
        isRiichi: actingPlayer.isRiichi,
        playerWind: currentWind,
        roundWind: roundWind,
        doraTiles: nextState.dora,
        uraDoraTiles: actingPlayer.isRiichi ? getCurrentUraDora(nextState.yama) : undefined,
        turnCount: nextState.turnCount,
        isMenzen: actingPlayer.melds.every(m => !m.isOpen),
        isRinshan: !!actingPlayer.justKaned,
      };

      const tsumoAnalysis = analyzeHandShanten(actingPlayer.hand, actingPlayer.melds, agariContextForTsumo);
      if (tsumoAnalysis.shanten === -1 && tsumoAnalysis.agariResult) {
        const handContextForYakuAndFu: YakuHandContext = {
          handTiles: tsumoAnalysis.agariResult.completedHand,
          agariTile: agariContextForTsumo.agariTile,
          melds: tsumoAnalysis.agariResult.melds,
          jantou: tsumoAnalysis.agariResult.jantou,
          handPattern: tsumoAnalysis.agariResult.handPattern,
          machiPattern: tsumoAnalysis.agariResult.machiPattern,
          isTsumo: agariContextForTsumo.isTsumo,
          isRiichi: agariContextForTsumo.isRiichi,
          playerWind: agariContextForTsumo.playerWind,
          roundWind: agariContextForTsumo.roundWind,
          doraTiles: agariContextForTsumo.doraTiles,
          uraDoraTiles: agariContextForTsumo.uraDoraTiles,
          turnCount: agariContextForTsumo.turnCount,
          isMenzen: agariContextForTsumo.isMenzen,
          isRinshan: agariContextForTsumo.isRinshan,
        };
        const yakuResults = checkYaku(handContextForYakuAndFu);

        if (yakuResults.length > 0 && !yakuResults.every(yr => yr.yaku.name.startsWith("ドラ"))) {
          const fuResult = calculateFu(handContextForYakuAndFu, yakuResults);
          const scoreOpts: ScoreOptions = {
            isOya: playerId === nextState.dealer,
            isTsumo: true,
            honba: nextState.honba,
            riichiSticks: nextState.riichiSticks,
          };
          const totalHan = yakuResults.reduce((sum, yr) => sum + yr.han, 0);
          const scoreResult = calculateScore(totalHan, fuResult, scoreOpts, yakuResults, handContextForYakuAndFu);

          nextState.winner = playerId;
          nextState.winningHandInfo = { ...tsumoAnalysis.agariResult, score: scoreResult };
          nextState.phase = GamePhase.ROUND_ENDED;
          const scoreDisplay = getScoreNameAndPayments(scoreResult, playerId === nextState.dealer);
          nextState.lastActionMessage = `${playerId === 'player' ? 'あなた' : 'CPU'}がツモ和了 (${scoreDisplay.name} ${scoreDisplay.totalPointsText})。`;

          if (playerId === 'player') {
            nextState.player.score += scoreResult.totalScore;
            if (scoreResult.koPayment) nextState.cpu.score -= scoreResult.koPayment;
          } else {
            nextState.cpu.score += scoreResult.totalScore;
            if (scoreResult.oyaPayment) nextState.player.score -= scoreResult.oyaPayment;
          }
          nextState.riichiSticks = 0;
        } else {
          nextState.lastActionMessage = "役がありません (ドラのみは和了不可)。";
        }
      } else {
        throw new Error("和了形ではありません (TsumoAgari)。");
      }
      break;

    case ActionType.Ron:
      if (currentState.currentTurn === playerId) throw new Error("Cannot Ron on your own discard (use Tsumo Agari or discard).");
      if (!opponentPlayer.lastDiscard) throw new Error("No last discard from opponent to Ron in processAction.");
      if (!actingPlayer.canRon) throw new Error("Cannot Ron now.");

      const tileToRon = opponentPlayer.lastDiscard;
      const agariContextForRon: AgariContext = {
        agariTile: tileToRon,
        isTsumo: false,
        isRiichi: actingPlayer.isRiichi,
        playerWind: currentWind,
        roundWind: roundWind,
        doraTiles: nextState.dora,
        uraDoraTiles: actingPlayer.isRiichi ? getCurrentUraDora(nextState.yama) : undefined,
        turnCount: nextState.turnCount,
        isMenzen: actingPlayer.melds.every(m => !m.isOpen),
        isRinshan: false,
      };

      const handForRonAnalysis = [...actingPlayer.hand, tileToRon];
      const ronAnalysis = analyzeHandShanten(handForRonAnalysis, actingPlayer.melds, agariContextForRon);

      if (ronAnalysis.shanten === -1 && ronAnalysis.agariResult) {
        const handContextForYakuAndFuRon: YakuHandContext = {
          handTiles: ronAnalysis.agariResult.completedHand,
          agariTile: agariContextForRon.agariTile,
          melds: ronAnalysis.agariResult.melds,
          jantou: ronAnalysis.agariResult.jantou,
          handPattern: ronAnalysis.agariResult.handPattern,
          machiPattern: ronAnalysis.agariResult.machiPattern,
          isTsumo: agariContextForRon.isTsumo,
          isRiichi: agariContextForRon.isRiichi,
          playerWind: agariContextForRon.playerWind,
          roundWind: agariContextForRon.roundWind,
          doraTiles: agariContextForRon.doraTiles,
          uraDoraTiles: agariContextForRon.uraDoraTiles,
          turnCount: agariContextForRon.turnCount,
          isMenzen: agariContextForRon.isMenzen,
          isRinshan: agariContextForRon.isRinshan,
        };
        const yakuResults = checkYaku(handContextForYakuAndFuRon);

        if (yakuResults.length > 0 && !yakuResults.every(yr => yr.yaku.name.startsWith("ドラ"))) {
          const fuResult = calculateFu(handContextForYakuAndFuRon, yakuResults);
          const scoreOpts: ScoreOptions = {
            isOya: playerId === nextState.dealer,
            isTsumo: false,
            honba: nextState.honba,
            riichiSticks: nextState.riichiSticks,
          };
          const totalHan = yakuResults.reduce((sum, yr) => sum + yr.han, 0);
          const scoreResult = calculateScore(totalHan, fuResult, scoreOpts, yakuResults, handContextForYakuAndFuRon);

          nextState.winner = playerId;
          nextState.winningHandInfo = { ...ronAnalysis.agariResult, score: scoreResult };
          nextState.phase = GamePhase.ROUND_ENDED;
          const ronScoreDisplay = getScoreNameAndPayments(scoreResult, playerId === nextState.dealer);
          nextState.lastActionMessage = `${playerId === 'player' ? 'あなた' : 'CPU'}が${opponentPlayerId === 'player' ? "あなた" : "CPU"}からロン和了 (${ronScoreDisplay.name} ${ronScoreDisplay.totalPointsText})。`;

          if (playerId === 'player') {
            nextState.player.score += scoreResult.totalScore;
            if (scoreResult.ronPlayerPayment) nextState.cpu.score -= scoreResult.ronPlayerPayment;
          } else {
            nextState.cpu.score += scoreResult.totalScore;
            if (scoreResult.ronPlayerPayment) nextState.player.score -= scoreResult.ronPlayerPayment;
          }
          nextState.riichiSticks = 0;
        } else {
          nextState.lastActionMessage = "役がありません (ドラのみは和了不可)。";
        }
      } else {
        throw new Error("和了形ではありません (Ron)。");
      }
      break;

    case ActionType.Kan:
      const tileToKan = action.tile;
      const meldToUpgrade = action.meld;
      const kanType = action.meldType;

      if (!tileToKan && !meldToUpgrade) {
        nextState.lastActionMessage = "エラー: カンする牌が指定されていません。";
        break;
      }
      if (!actingPlayer.canKan ||
          (kanType === 'ankan' && !actingPlayer.possibleKans.find(k => k.type === 'ankan' && isSameTile(k.tile, tileToKan!))) ||
          (kanType === 'kakan' && !actingPlayer.possibleKans.find(k => k.type === 'kakan' && isSameTile(k.tile, tileToKan!) && k.meldToUpgrade?.tiles.some(t => isSameTile(t, meldToUpgrade?.tiles[0]!)))) ||
          (kanType === 'daiminkan' && !actingPlayer.possibleKans.find(k => k.type === 'daiminkan' && isSameTile(k.tile, tileToKan!))) ) {
        console.warn("Kan declared but not possible or tile mismatch.", action, actingPlayer.possibleKans);
        nextState.lastActionMessage = "エラー: 現在そのカンはできません。";
        break;
      }

      let kanSuccess = false;
      let kanMeld: Meld | undefined = undefined;

      if (kanType === 'ankan' && tileToKan) {
        const ankanTiles = actingPlayer.hand.filter(t => isSameTile(t, tileToKan));
        if (ankanTiles.length === 4) {
          kanMeld = { type: 'kantsu', tiles: [...ankanTiles], isOpen: false };
          actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, tileToKan));
          kanSuccess = true;
          nextState.lastActionMessage = `${playerId === 'player' ? "あなた" : "CPU"}が${tileToKan.id}を暗槓しました。`;
        }
      } else if (kanType === 'kakan' && tileToKan && meldToUpgrade) {
        const existingMeld = actingPlayer.melds.find(m =>
            m.type === 'koutsu' &&
            m.isOpen &&
            m.tiles.length === 3 &&
            isSameTile(m.tiles[0], meldToUpgrade.tiles[0])
        );
        if (existingMeld && isSameTile(existingMeld.tiles[0], tileToKan)) { // 加槓する牌と刻子の牌が同じ種類であること
          existingMeld.type = 'kantsu';
          existingMeld.tiles.push(tileToKan);
          existingMeld.tiles.sort(compareTiles);
          kanMeld = existingMeld;
          actingPlayer.hand = removeTileFromPlayerHand(actingPlayer.hand, tileToKan);
          kanSuccess = true;
          nextState.lastActionMessage = `${playerId === 'player' ? "あなた" : "CPU"}が${tileToKan.id}を加槓しました。`;
        }
      } else if (kanType === 'daiminkan' && tileToKan && opponentPlayer.lastDiscard && isSameTile(opponentPlayer.lastDiscard, tileToKan)) {
        const daiminkanTilesInHand = actingPlayer.hand.filter(t => isSameTile(t, tileToKan));
        if (daiminkanTilesInHand.length === 3) {
          kanMeld = { type: 'kantsu', tiles: [...daiminkanTilesInHand, opponentPlayer.lastDiscard].sort(compareTiles), isOpen: true, fromWho: opponentPlayerId };
          actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, tileToKan));
          opponentPlayer.canRon = false; // 大明槓されたらロンはできない
          opponentPlayer.canPon = false;
          kanSuccess = true;
          nextState.lastActionMessage = `${playerId === 'player' ? "あなた" : "CPU"}が${opponentPlayerId === 'player' ? "相手" : "CPU"}の${tileToKan.id}を大明槓しました。`;
        }
      }

      if (kanSuccess && kanMeld) {
        actingPlayer.melds.push(kanMeld);
        actingPlayer.justKaned = true;
        nextState.kanCount++;

        // 四開槓判定 (仮: 一人のプレイヤーが4回カンしたら)
        if (nextState.kanCount === 4) {
            nextState.winner = 'draw';
            nextState.phase = GamePhase.ROUND_ENDED;
            nextState.lastActionMessage += " 四開槓のため流局します。";
            gameEndedThisTurn = true;
        }

        if (!gameEndedThisTurn) {
            nextState.yama = revealKanDora(nextState.yama); // ドラ表示牌をめくる
            nextState.dora = getCurrentDora(nextState.yama);
            nextState.lastActionMessage += " 新しいドラが表示されました。嶺上牌をツモります。";

            // nextState.yama.rinshanTiles が存在し、空でないことを確認
            if (nextState.yama.rinshanTiles && nextState.yama.rinshanTiles.length > 0) {
                const rinshanDrawResult = drawRinshanTile(nextState.yama);
                nextState.yama = rinshanDrawResult.updatedYama;
                if (rinshanDrawResult.tile) {
                    actingPlayer.hand.push(rinshanDrawResult.tile);
                    actingPlayer.hand.sort(compareTiles);
                    actingPlayer.lastDraw = rinshanDrawResult.tile;
                    updateActionFlagsForPlayer(actingPlayer, nextState, rinshanDrawResult.tile, true);
                    nextState.lastActionMessage += ` ${rinshanDrawResult.tile.id} を嶺上牌としてツモりました。`;
                    if (actingPlayer.canTsumoAgari) {
                        // 嶺上開花の場合は即アガリ (CPUの場合も)
                        // gameEndedThisTurn = true; // processAction(nextState, playerId, {type: ActionType.TsumoAgari}) で処理される
                        return processAction(nextState, playerId, {type: ActionType.TsumoAgari}); // 再帰呼び出しでツモアガリ処理
                    }
                     // 大明槓以外は打牌へ、大明槓は続けてツモか打牌
                    if (kanType !== 'daiminkan') {
                        nextState.currentTurn = playerId; // カンしたプレイヤーが続けて打牌
                        nextState.phase = playerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN;
                        if (playerId === 'cpu' && nextState.phase === GamePhase.CPU_TURN) {
                            const cpuAction = decideCpuAction(nextState);
                            return processAction(nextState, 'cpu', cpuAction);
                        }
                    } else {
                         // 大明槓の場合、続けてアクション。ツモアガリでなければ打牌。
                        nextState.currentTurn = playerId;
                        nextState.phase = playerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN;
                        if (playerId === 'cpu' && nextState.phase === GamePhase.CPU_TURN) {
                            const cpuAction = decideCpuAction(nextState);
                            return processAction(nextState, 'cpu', cpuAction);
                        }
                    }
                } else {
                    nextState.winner = 'draw'; // 嶺上牌が引けない＝流局
                    nextState.phase = GamePhase.ROUND_ENDED;
                    nextState.lastActionMessage += " 嶺上牌が引けませんでした。流局します。";
                    gameEndedThisTurn = true;
                }
            } else {
                nextState.winner = 'draw'; // 山に牌がない＝流局
                nextState.phase = GamePhase.ROUND_ENDED;
                nextState.lastActionMessage += " 山に牌がありません。流局します。";
                gameEndedThisTurn = true;
            }
        }
      } else if (!kanSuccess) {
        nextState.lastActionMessage = "エラー: カンに失敗しました。";
      }
      break;

    case ActionType.Pon:
      const tileToPon = action.targetTile;
      if (!tileToPon || !opponentPlayer.lastDiscard || !isSameTile(opponentPlayer.lastDiscard, tileToPon)) {
        nextState.lastActionMessage = "エラー: ポンする牌が相手の捨て牌と一致しません。";
        break;
      }
      if (!actingPlayer.canPon || !actingPlayer.tileToPon || !isSameTile(actingPlayer.tileToPon, tileToPon)) {
        console.warn("Pon declared but not possible or tile mismatch", action, actingPlayer.tileToPon);
        nextState.lastActionMessage = "エラー: 現在そのポンはできません。";
        break;
      }

      const ponTilesInHand = actingPlayer.hand.filter(t => isSameTile(t, tileToPon));
      if (ponTilesInHand.length >= 2) {
        const meldTiles = [ponTilesInHand[0], ponTilesInHand[1], tileToPon].sort(compareTiles);
        const ponMeld: Meld = { type: 'koutsu', tiles: meldTiles, isOpen: true, fromWho: opponentPlayerId };
        actingPlayer.melds.push(ponMeld);
        actingPlayer.hand = removeAllTilesFromHand(actingPlayer.hand, [ponTilesInHand[0], ponTilesInHand[1]]);

        actingPlayer.canPon = false;
        actingPlayer.tileToPon = undefined;
        actingPlayer.canRon = false; // ポンしたらロンの権利は消える
        actingPlayer.justKaned = false;

        opponentPlayer.canRon = false; // ポンされたらロンはできない
        opponentPlayer.canPon = false; // ポンされたらポンはできない (次のツモまでは)

        nextState.currentTurn = playerId; // ポンしたプレイヤーのターン
        nextState.phase = playerId === 'player' ? GamePhase.PLAYER_TURN : GamePhase.CPU_TURN;
        nextState.lastActionMessage = `${playerId === 'player' ? "あなた" : "CPU"}が${opponentPlayerId === 'player' ? "相手" : "CPU"}の${tileToPon.id}をポンしました。打牌してください。`;

        // CPUがポンした場合、続けて打牌
        if (playerId === 'cpu') {
            const cpuAction = decideCpuAction(nextState);
            return processAction(nextState, 'cpu', cpuAction);
        }
      } else {
        nextState.lastActionMessage = "エラー: ポンするための牌が手牌に足りません。";
      }
      break;
  }

  // 最終的なCPUのターン処理 (上記で処理されなかった場合、例えばプレイヤーがパスした後など)
  if (nextState.currentTurn === 'cpu' && nextState.phase === GamePhase.CPU_TURN && !gameEndedThisTurn) {
    const cpuAction = decideCpuAction(nextState);
    return processAction(nextState, 'cpu', cpuAction);
  }

  if (gameEndedThisTurn && nextState.phase !== GamePhase.GAME_OVER) {
    nextState = proceedToNextRoundOrEndGame(nextState);
  }

  return nextState;
}
