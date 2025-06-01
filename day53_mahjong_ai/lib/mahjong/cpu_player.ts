import { GameState, PlayerState, ActionType, GameAction, Meld, KanPossibility } from './game_state';
import { Tile, TileSuit, compareTiles, isSameTile } from './tiles';
import { analyzeHandShanten, removeTileFromHand, addTileToHand, AgariContext, HandPattern } from './hand';
import { getCurrentDora, getCurrentUraDora } from './yama'; // getCurrentUraDora をインポート

// CPUのアクション選択ロジック
export function decideCpuAction(gameState: GameState): GameAction {
  const cpuState = gameState.cpu;
  const opponentState = gameState.player;

  // 1. ツモ和了可能かチェック
  if (cpuState.canTsumoAgari && cpuState.lastDraw) {
    return { type: ActionType.TsumoAgari };
  }

  // 2. リーチ可能かチェック (ツモ後)
  // analyzeHandShanten は canRiichi フラグを設定するために updateActionFlagsForPlayer で既に呼ばれている想定
  if (cpuState.canRiichi && cpuState.lastDraw) {
    // リーチできる場合、どの牌でリーチするか？
    // 最も向聴数を維持できる、またはより良くなる牌を捨てる
    // ここでは単純に lastDraw を切ってリーチするなどは危険なので、
    // リーチ宣言牌の選択ロジックが必要。
    // analyzeHandShanten で shanten === 0 になる組み合わせを探す。
    // 簡単のため、ここでは「リーチ可能ならとりあえずリーチ」という戦略は取らず、
    // 打牌選択の中でリーチ宣言牌を選ぶ。
    // ひとまず、リーチ可能な状態で安全な打牌があればリーチする、なければダマ。
    // 今回はまず打牌ロジックで対応し、リーチ判断は打牌後とする。
  }

  // 3. カン可能かチェック (ツモ後)
  if (cpuState.canKan && cpuState.possibleKans && cpuState.possibleKans.length > 0) {
    // どのカンを実行するか？ 暗槓があれば優先的に行う
    const ankan = cpuState.possibleKans.find(k => k.type === 'ankan');
    if (ankan) {
      return { type: ActionType.Kan, meldType: 'ankan', tile: ankan.tile };
    }
    const kakan = cpuState.possibleKans.find(k => k.type === 'kakan');
    if (kakan && kakan.meldToUpgrade) { // メルドがあることを確認
        return { type: ActionType.Kan, meldType: 'kakan', tile: kakan.tile, meld: kakan.meldToUpgrade };
    }
    // 大明槓は相手の打牌に対するアクションなのでここでは判断しない
  }


  // 4. 打牌選択
  //   - リーチしている場合: ツモ切り
  //   - リーチしていない場合: 向聴数を最小にする打牌
  if (cpuState.isRiichi && cpuState.lastDraw) {
    return { type: ActionType.Discard, tile: cpuState.lastDraw };
  }

  let bestDiscardAction: GameAction = { type: ActionType.Discard, tile: cpuState.lastDraw! }; // フォールバック
  if (!cpuState.lastDraw) {
      // lastDrawがない状況は基本的にはありえないが、万が一のため手牌から適当に一枚選ぶ
      if (cpuState.hand.length > 0) {
          bestDiscardAction = {type: ActionType.Discard, tile: cpuState.hand[cpuState.hand.length -1]};
      } else {
          // 手牌も空なら、これは異常事態
          console.error("CPU has no hand and no lastDraw to discard.");
          // ダミーのアクションを返すしかない
          const dummyTile: Tile = { suit: TileSuit.MANZU, value: 1, id: '1m', name: '一萬', isRedDora: false };
          return { type: ActionType.Discard, tile: dummyTile };
      }
  }


  let minShanten = 8; // 初期値は大きな値
  let optimalDiscardTile: Tile | undefined = cpuState.lastDraw; // ツモ切りをデフォルトとする
  let canDeclareRiichiWithThisDiscard = false;

  // 14枚の手牌から1枚ずつ捨てて向聴数を評価
  for (const tileToDiscard of cpuState.hand) {
    const tempHand = removeTileFromHand(cpuState.hand, tileToDiscard); // 13枚になる
    const shantenResult = analyzeHandShanten(tempHand, cpuState.melds); // agariContextなしで向聴数のみ

    if (shantenResult.shanten < minShanten) {
      minShanten = shantenResult.shanten;
      optimalDiscardTile = tileToDiscard;
      canDeclareRiichiWithThisDiscard = (minShanten === 0 && !cpuState.isRiichi && cpuState.melds.every(m => !m.isOpen) && cpuState.score >= 1000);
    } else if (shantenResult.shanten === minShanten) {
      // TODO: 同じ向聴数なら、より良い待ちや役につながる牌を残すなどの評価
      // 現状は最初に見つかったものを採用
      if (minShanten === 0 && !cpuState.isRiichi && cpuState.melds.every(m => !m.isOpen) && cpuState.score >= 1000) {
          canDeclareRiichiWithThisDiscard = true;
      }
    }
  }

  if (canDeclareRiichiWithThisDiscard && optimalDiscardTile) {
    return { type: ActionType.Riichi, tileToDiscard: optimalDiscardTile };
  }

  if (optimalDiscardTile) {
    bestDiscardAction = { type: ActionType.Discard, tile: optimalDiscardTile };
  }

  return bestDiscardAction;
}

// CPUの鳴き判断 (相手の捨て牌に対して)
export function decideCpuNakiAction(gameState: GameState, opponentDiscard: Tile): GameAction | null {
  const cpuState = gameState.cpu;

  // 1. ロン可能かチェック
  // canRon は updateActionFlagsForPlayer で設定されている想定
  // game_state の updateActionFlagsForPlayer で canRon は相手の捨て牌に対して評価済みのはず
  if (cpuState.canRon) {
    return { type: ActionType.Ron };
  }

  // 2. ポン可能かチェック
  if (cpuState.canPon && cpuState.tileToPon && isSameTile(cpuState.tileToPon, opponentDiscard)) {
    // TODO: ポンするかの詳細な判断ロジック (役につながるか、手が早くなるかなど)
    // ここでは単純に可能ならポンする
    return { type: ActionType.Pon, targetTile: opponentDiscard };
  }

  // 3. 大明槓可能かチェック
  const daiminkanPossibility = cpuState.possibleKans.find(k => k.type === 'daiminkan' && isSameTile(k.tile, opponentDiscard));
  if (daiminkanPossibility) {
      // TODO: 大明槓するかの詳細な判断ロジック
      return { type: ActionType.Kan, meldType: 'daiminkan', tile: opponentDiscard };
  }

  return null; // 鳴かない
}
