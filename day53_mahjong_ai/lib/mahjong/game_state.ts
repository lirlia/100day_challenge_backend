import { Tile } from "./tiles";
import { Yama, getDoraFromIndicator } from "./yama";
import { Meld } from "./hand"; // hand.ts から Meld 型をインポート

export enum PlayerID {
  Player = "player",
  CPU = "cpu",
}

export enum GamePhase {
  InitialDeal = "initialDeal",       // 配牌直後
  PlayerTurnStart = "playerTurnStart",   // プレイヤーツモ直後
  PlayerDiscardWait = "playerDiscardWait", // プレイヤー打牌待ち
  CPUTurnStart = "cpuTurnStart",        // CPUツモ直後
  CPUDiscardWait = "cpuDiscardWait",      // CPU打牌待ち (内部処理)
  PlayerActionWait = "playerActionWait",  // プレイヤーのロン・ポン・チー・カン待ち
  RoundEnd = "roundEnd",            // 局終了 (和了または流局)
  GameEnd = "gameEnd",              // ゲーム終了
}

export interface PlayerState {
  id: PlayerID;
  hand: Tile[];         // 手牌 (ツモ牌を含む場合は14枚、それ以外は13枚)
  river: Tile[];        // 捨て牌の履歴
  melds: Meld[];        // 副露した面子
  score: number;        // 現在の点数
  isRiichi: boolean;    // リーチしているか
  riichiTurn: number;   // リーチ宣言した巡目 (リーチ後のフリテン確認などに使用)
}

export interface GameState {
  gameId: string;          // ゲームの一意なID (セッション管理用、今回は簡易的に)
  round: number;           // 現在の局 (例: 1 = 東1局, 2 = 東2局)
  honba: number;           // 本場 (積み棒の数)
  kyotaku: number;         // 供託リーチ棒の数
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
}

// 仮の初期状態生成関数 (APIで本格的に実装)
export function createInitialGameState(gameId: string, initialYama: Yama, playerHand: Tile[], cpuHand: Tile[]): GameState {
  const initialPlayerScore = 25000;
  const initialCpuScore = 25000;

  // yama.ts の getCurrentDora を使って初期ドラを設定 (API側で設定する方針へ変更したためここはシンプルに)
  // const initialDora = initialYama.doraIndicators.length > 0 && initialYama.wanpai[4]
  //   ? [getDoraFromIndicator(initialYama.wanpai[4])]
  //   : [];
  // API側(new/route.ts)で getCurrentDora(yamaAfterDeal) を呼び、その結果を gameState.dora に設定する。
  // そのため、ここでは空配列で初期化するか、あるいはAPI側で設定されたものをそのまま使う。
  // ここではAPI側で設定されることを期待し、doraプロパティは必須なので空配列で初期化しておく。
  const initialDora: Tile[] = [];

  return {
    gameId,
    round: 1,
    honba: 0,
    kyotaku: 0,
    oya: PlayerID.Player,
    turn: PlayerID.Player,
    phase: GamePhase.PlayerDiscardWait,
    yama: initialYama,
    dora: initialDora, // API側で上書きされる
    player: {
      id: PlayerID.Player,
      hand: playerHand,
      river: [],
      melds: [],
      score: initialPlayerScore,
      isRiichi: false,
      riichiTurn: -1,
    },
    cpu: {
      id: PlayerID.CPU,
      hand: cpuHand,
      river: [],
      melds: [],
      score: initialCpuScore,
      isRiichi: false,
      riichiTurn: -1,
    },
    turnCount: 1,
  };
}
