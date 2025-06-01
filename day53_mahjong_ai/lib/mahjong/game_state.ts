import { Tile, isSameTile, compareTiles, HonorType } from './tiles';
import { Yama, createYama, dealInitialHands, drawTile, getCurrentDora, drawRinshanTile } from './yama';
import { analyzeHandShanten, Meld, HandPattern } from './hand'; // Meld, HandPattern をインポート

export enum PlayerID {
  Player = "player",
  CPU = "cpu",
}

export enum GamePhase {
  Playing = "playing",
  PlayerWon = "player_won",
  CPUWon = "cpu_won",
  Draw = "draw", // 流局
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
  tile?: Tile; // 打牌、カンする牌など
  // TODO: カンの種類 (暗槓、加槓、大明槓) など、アクションに応じた追加情報
  // meld?: Meld; // カンや鳴きの場合の面子情報 (APIで構成しても良い)
}

export interface PlayerState {
  hand: Tile[];         // 手牌 (ツモ牌を含む場合は14枚、それ以外は13枚)
  river: Tile[];        // 捨て牌の履歴
  score: number;        // 現在の点数
  isRiichi: boolean;    // リーチしているか
  riichiTurn: number;   // リーチ宣言した巡目 (リーチ後のフリテン確認などに使用)
  // アクション可能フラグ (サーバーサイドで設定)
  canRiichi?: boolean;
  canTsumoAgari?: boolean;
  canRon?: boolean; // 相手の打牌に対してロン可能か
  canKan?: boolean; // カン可能か (暗槓、加槓、大明槓のいずれか)
  melds: Meld[];      // 副露した面子
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
  player: PlayerState;
  cpu: PlayerState;
  turnCount: number;       // 現在の局の総巡目 (誰かが打牌するたびに+1)
  lastActionMessage?: string; // 直前のアクションに関するメッセージ (例: "CPUが1萬を捨てました")
  winner?: PlayerID | null; // 和了者 (nullなら流局)
  winningHandInfo?: any;    // 和了時の手牌情報、役、点数など (詳細は後で)
  lastAction?: GameAction; // 最後に行われたアクション (主にCPUのロン判定用)
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
  // yama も更新
  let currentYama = firstPlayerTsumo.updatedYama;

  const initialPlayerState: PlayerState = {
    hand: playerHandWithTsumo, // ツモ牌込みの初期手牌
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

  const initialCpuState: PlayerState = {
    hand: cpuHand, // CPUは最初のツモはまだ
    river: [],
    score: 25000,
    isRiichi: false,
    riichiTurn: 0,
    canRiichi: false, // CPUのアクションフラグはCPUのターンで設定
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
    winningHandInfo: undefined,
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
      uraDoraTiles: playerState.isRiichi ? [] : undefined, // TODO: 裏ドラ実装
      turnCount: gameState.turnCount,
      isMenzen: playerState.melds.every(m => !m.isOpen)
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
  if (isTsumo && !playerState.isRiichi) { // ツモ時かつリーチしていない場合 (リーチ後の暗槓は条件付き)
    const counts = new Map<string, number>();
    for (const tile of playerState.hand) {
      counts.set(tile.id, (counts.get(tile.id) || 0) + 1);
    }
    for (const count of counts.values()) {
      if (count === 4) {
        canAnkan = true;
        break;
      }
    }
  }
  // TODO: 加槓の判定 (ポンした刻子と同じ牌を手牌に持っているか)
  // TODO: リーチ後の暗槓の条件 (待ちが変わらない、など)
  playerState.canKan = canAnkan; // 現状は暗槓のみ
}

// ゲーム状態を更新するメインロジック
export function processAction(currentState: GameState, playerId: PlayerID, action: GameAction): GameState {
  let nextState = JSON.parse(JSON.stringify(currentState)) as GameState; // Deep copy
  nextState.lastAction = action;

  const actingPlayer = playerId === PlayerID.Player ? nextState.player : nextState.cpu;
  const opponentPlayer = playerId === PlayerID.Player ? nextState.cpu : nextState.player;
  const opponentPlayerId = playerId === PlayerID.Player ? PlayerID.CPU : PlayerID.Player;

  switch (action.type) {
    case ActionType.Discard:
      if (!action.tile) throw new Error("Discard action requires a tile.");
      const discardedTile = action.tile;
      actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, discardedTile));
      actingPlayer.river.push(discardedTile);
      actingPlayer.canRiichi = false; // 打牌後はリーチ不可
      actingPlayer.canTsumoAgari = false; // 打牌後はツモアガリ不可
      actingPlayer.canKan = false; // 打牌後はカン不可 (通常)

      nextState.turn = opponentPlayerId;
      nextState.turnCount++;

      // 相手プレイヤーのロン判定
      updateActionFlagsForPlayer(opponentPlayer, nextState, discardedTile, false);
      // TODO: 大明槓の判定もここ？

      // 相手プレイヤーのツモ処理 (ロンされなかった場合)
      if (!opponentPlayer.canRon) {
        const drawResult = drawTile(nextState.yama);
        nextState.yama = drawResult.updatedYama;
        if (drawResult.tile) {
          opponentPlayer.hand.push(drawResult.tile);
          opponentPlayer.hand.sort(compareTiles);
          // ツモ後のアクションフラグ更新 (リーチ、ツモアガリ、カン)
          updateActionFlagsForPlayer(opponentPlayer, nextState, drawResult.tile, true);
        } else {
          nextState.phase = GamePhase.Draw; // 山切れで流局
        }
      }
      break;

    case ActionType.Riichi:
      if (!action.tile) throw new Error("Riichi action requires a tile to discard.");
      if (actingPlayer.canRiichi && actingPlayer.score >= 1000 && actingPlayer.hand.some(t => isSameTile(t, action.tile!))) {
        actingPlayer.isRiichi = true;
        actingPlayer.riichiTurn = nextState.turnCount;
        actingPlayer.score -= 1000; // 供託
        // nextState.kyotakuStick++; // 供託棒を増やす (今回は実装略)

        // リーチ宣言牌を打牌 (Discardアクションとして処理を移譲することも可能)
        const riichiDiscardTile = action.tile;
        actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, riichiDiscardTile));
        actingPlayer.river.push(riichiDiscardTile);
        actingPlayer.canRiichi = false;
        actingPlayer.canTsumoAgari = false;
        actingPlayer.canKan = false; // リーチ後は暗槓のみ可 (条件による)

        nextState.turn = opponentPlayerId;
        nextState.turnCount++; // リーチ打牌で1巡進む

        // 相手プレイヤーのロン判定
        updateActionFlagsForPlayer(opponentPlayer, nextState, riichiDiscardTile, false);

        if (!opponentPlayer.canRon) {
          const drawResult = drawTile(nextState.yama);
          nextState.yama = drawResult.updatedYama;
          if (drawResult.tile) {
            opponentPlayer.hand.push(drawResult.tile);
            opponentPlayer.hand.sort(compareTiles);
            updateActionFlagsForPlayer(opponentPlayer, nextState, drawResult.tile, true);
          } else {
            nextState.phase = GamePhase.Draw;
          }
        }
      } else {
        // リーチ不可能な状況 (エラーハンドリングはAPI側で)
        console.warn("Cannot declare Riichi: conditions not met.");
      }
      break;

    case ActionType.TsumoAgari:
      if (actingPlayer.canTsumoAgari) {
        // TODO: 点数計算 (analyzeHandShantenの結果を使う)
        // const agariInfo = analyzeHandShanten(...).agariResult;
        // actingPlayer.score += calculatedScore;
        // opponentPlayer.score -= calculatedScore; (ツモられた分)
        nextState.phase = playerId === PlayerID.Player ? GamePhase.PlayerWon : GamePhase.CPUWon;
        nextState.winner = playerId;
        // nextState.winningHandInfo = agariInfo;
      } else {
        console.warn("Cannot declare TsumoAgari: conditions not met.");
      }
      break;

    case ActionType.Ron:
      // Ron は相手の打牌 (nextState.lastAction.tile) に対して行われる
      if (actingPlayer.canRon && nextState.lastAction && nextState.lastAction.type === ActionType.Discard && nextState.lastAction.tile) {
        const ronTile = nextState.lastAction.tile;
        // actingPlayer.hand.push(ronTile); // ロン牌を手牌に加える (表示用、analyzeHandShantenは14枚で受ける想定)
        // TODO: 点数計算
        // const agariInfo = analyzeHandShanten(actingPlayer.hand, actingPlayer.melds, { agariTile: ronTile, ...}).agariResult;
        // actingPlayer.score += calculatedScore;
        // opponentPlayer.score -= calculatedScore; (ロンされた分)
        nextState.phase = playerId === PlayerID.Player ? GamePhase.PlayerWon : GamePhase.CPUWon;
        nextState.winner = playerId;
        // nextState.winningHandInfo = agariInfo;
      } else {
        console.warn("Cannot declare Ron: conditions not met.");
      }
      break;

    case ActionType.Kan:
      if (actingPlayer.canKan && action.tile) { // action.tile はカンする牌の1枚を示す想定
        const tileToKan = action.tile;
        const countInHand = actingPlayer.hand.filter(t => isSameTile(t, tileToKan)).length;

        if (countInHand === 4 && !actingPlayer.isRiichi) { // 暗槓の条件 (仮)
          // 暗槓処理
          const ankanTiles = actingPlayer.hand.filter(t => isSameTile(t, tileToKan));
          actingPlayer.hand = actingPlayer.hand.filter(t => !isSameTile(t, tileToKan));

          actingPlayer.melds.push({
            type: 'kantsu',
            tiles: ankanTiles,
            isOpen: false, // 暗槓
          });

          // 嶺上牌をツモる
          const rinshanDraw = drawRinshanTile(nextState.yama);
          nextState.yama = rinshanDraw.updatedYama;
          if (rinshanDraw.tile) {
            actingPlayer.hand.push(rinshanDraw.tile);
            actingPlayer.hand.sort(compareTiles);
            // 嶺上開花の判定と、ツモ後のアクションフラグ更新
            // TODO: 嶺上開花役の判定と成立処理
            updateActionFlagsForPlayer(actingPlayer, nextState, rinshanDraw.tile, true);
            // カン成立後は打牌が必要なので、ターンはそのまま
            nextState.turn = playerId;
          } else {
            nextState.phase = GamePhase.Draw; // 山切れ
          }
          // TODO: 槓ドラ表示牌をめくる処理
        } else {
          // 加槓やリーチ後の暗槓のロジックはここに追加
          console.warn("Cannot declare Kan: conditions not met or type not implemented.");
        }
      } else {
        console.warn("Cannot declare Kan: conditions not met or tile not specified.");
      }
      break;
  }

  // プレイヤーとCPUの状態を更新し終わったので、nextStateの各プレイヤーに再代入
  if (playerId === PlayerID.Player) {
      nextState.player = actingPlayer;
      nextState.cpu = opponentPlayer;
  } else {
      nextState.cpu = actingPlayer;
      nextState.player = opponentPlayer;
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
