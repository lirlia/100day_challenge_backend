import { GameState, PlayerState, ActionType, GameAction, Meld, KanPossibility } from './game_state';
import { Tile, TileSuit, compareTiles, isSameTile } from './tiles';
import { analyzeHandShanten, removeTileFromHand, addTileToHand, AgariContext, HandPattern } from './hand';
import { getCurrentDora, getCurrentUraDora } from './yama'; // getCurrentUraDora をインポート

// 打牌評価のための補助関数 (例)
interface DiscardOption {
  tile: Tile;
  shanten: number;
  // patterns: HandPattern[]; // どのような待ちや構成になるか
  // safety: number; // 安全度 (0-10, 高いほど安全)
  // value: number; // 打点期待値
  canRiichi: boolean;
}

function evaluateDiscardOptions(
  hand: Tile[], // 14枚の手牌
  melds: Meld[],
  currentScore: number,
  isRiichi: boolean, // プレイヤーが現在リーチしているか
  doraTiles: Tile[],
  // opponentRiver: Tile[], // 相手の捨て牌 (安全性評価用)
  // remainingTiles: number // 残り牌数
): DiscardOption[] {
  const options: DiscardOption[] = [];
  // 手牌中のユニークな牌に対して評価 (14枚全てを評価対象とする)
  const uniqueTilesInHandMap = new Map<string, Tile>();
  hand.forEach(t => uniqueTilesInHandMap.set(t.id, t));
  const tilesToConsiderDiscarding = Array.from(uniqueTilesInHandMap.values());


  for (const tileToDiscard of tilesToConsiderDiscarding) {
    const tempHand = removeTileFromHand([...hand], tileToDiscard); // 13枚にする
    if (tempHand.length !== hand.length -1 && hand.length > 0) { //正しく1枚減ったか確認
        //手牌にない牌を捨てようとした場合など
        console.warn('Failed to remove ' + tileToDiscard.id + ' from hand for evaluation. Skipping.', hand);
        continue;
    }
    const shantenResult = analyzeHandShanten(tempHand, melds);

    const canDeclareRiichi = shantenResult.shanten === 0 &&
                             melds.every(m => !m.isOpen) &&
                             currentScore >= 1000 &&
                             !isRiichi;

    options.push({
      tile: tileToDiscard,
      shanten: shantenResult.shanten,
      canRiichi: canDeclareRiichi,
    });
  }

  return options.sort((a, b) => {
    if (a.shanten !== b.shanten) {
      return a.shanten - b.shanten;
    }
    if (a.canRiichi !== b.canRiichi) {
        return a.canRiichi ? -1 : 1;
    }
    // TODO: 安全性、待ちの良さなどでソート
    // 例: 危険牌を優先的に捨てる (ここでは単純化)
    // ヤオチュー牌 > 字牌 > 中張牌の順で危険度が低いとして、安全なものを残す（危険なものを切る）
    const getSafetyScore = (tile: Tile) => {
        if (tile.suit === TileSuit.JIHAI) return 1; // 字牌
        if (tile.value === 1 || tile.value === 9) return 2; // ヤオチュー数牌
        return 3; // 中張牌
    };
    return getSafetyScore(a.tile) - getSafetyScore(b.tile); // 危険な牌(スコア大)を先に捨てる
  });
}


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
