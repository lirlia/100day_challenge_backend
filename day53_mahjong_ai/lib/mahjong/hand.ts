import { Tile, TileSuit, HonorType, isSameTile, compareTiles, tileFromString, tilesFromStrings } from './tiles';
import { checkYaku, HandContext, YakuResult, ALL_YAKU } from './yaku'; // Yaku関連をインポート
import { calculateScore, ScoreResult, ScoreOptions } from './score'; // Score関連をインポート
import { GameState, PlayerID } from './game_state'; // GameStateの一部をインポート

// tiles.ts の HONOR 定義を参考に、手牌処理で必要な字牌リストを作成
const YAOCHUUHAI_ID_STRINGS = [
    "1m", "9m", "1s", "9s", "1p", "9p",
    "ton", "nan", "sha", "pei", "haku", "hatsu", "chun"
];
const YAOCHUUHAI_PROTOTYPES: Tile[] = tilesFromStrings(YAOCHUUHAI_ID_STRINGS);

export interface Meld {
  type: 'shuntsu' | 'koutsu' | 'kantsu'; // 面子の種類: 順子、刻子、槓子
  tiles: Tile[];        // 面子を構成する牌 (順子は昇順、刻子・槓子は同じ牌)
  isOpen: boolean;      // 鳴き面子かどうか (trueなら鳴き、falseなら暗刻・暗槓)
  fromWho?: PlayerID;   // 誰から鳴いたか (鳴き面子の場合)
}

export interface HandAnalysisResult {
  shanten: number; // 向聴数 (0なら聴牌、-1なら和了)
  agariResult?: AgariInfo; // 和了している場合、その詳細
  // TODO: 聴牌の場合の待ち牌リストなども追加できる
}

// 和了情報の詳細
export interface AgariInfo {
  handPattern: HandPattern; // 和了形 (通常手, 七対子, 国士無双)
  completedHand: Tile[];    // 和了形を構成する手牌 (ツモ牌/ロン牌を含む)
  agariTile: Tile;          // 和了牌
  melds: Meld[];            // 面子のリスト (暗刻・暗槓も含む)
  jantou?: Tile;            // 雀頭 (通常手の場合)
  score?: ScoreResult;      // 点数計算結果
  isTsumo: boolean;         // ツモ和了かどうか
  // TODO: フリテン情報なども追加可能
}

// analyzeHandShanten のためのコンテキスト情報 (和了判定時)
export interface AgariContext {
  agariTile: Tile;
  isTsumo: boolean;
  isRiichi: boolean;
  isDoubleRiichi?: boolean;
  playerWind: HonorType;
  roundWind: HonorType;
  doraTiles: Tile[];
  uraDoraTiles?: Tile[];
  turnCount: number;
  isMenzen?: boolean;
  isRinshan?: boolean;
}

export enum HandPattern {
  NORMAL = "Normal",          // 通常手 (4面子1雀頭)
  CHIITOITSU = "Chiitoitsu",  // 七対子
  KOKUSHI = "KokushiMusou", // 国士無双
}

// 手牌に牌を追加する (ソートも行う)
export function addTileToHand(hand: Tile[], tile: Tile): Tile[] {
  const newHand = [...hand, tile];
  newHand.sort(compareTiles);
  return newHand;
}

// 手牌から牌を削除する (最初に一致したもののみ)
export function removeTileFromHand(hand: Tile[], tileToRemove: Tile): Tile[] {
  const index = hand.findIndex(t => isSameTile(t, tileToRemove));
  if (index !== -1) {
    const newHand = [...hand];
    newHand.splice(index, 1);
    return newHand;
  }
  return hand;
}

// 手牌から指定された牌をすべて削除する
export function removeAllTilesFromHand(hand: Tile[], tilesToRemove: Tile[]): Tile[] {
  let newHand = [...hand];
  for (const tile of tilesToRemove) {
    const index = newHand.findIndex(t => isSameTile(t, tile));
    if (index !== -1) {
      newHand.splice(index, 1);
    }
  }
  return newHand;
}


// 牌の枚数をカウントするヘルパー関数
function countTiles(tiles: Tile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of tiles) {
    counts.set(tile.id, (counts.get(tile.id) || 0) + 1);
  }
  return counts;
}

// 基本的な和了形 (4面子1雀頭) かどうかを判定する
// この関数は向聴数計算の内部で使われ、より詳細な面子分割は shantenAnalysis で行う
export function isBasicAgari(handTiles: Tile[], existingMelds: Meld[] = []): boolean {
  const requiredBaseMelds = 4 - existingMelds.length;
  const requiredTilesForBase = requiredBaseMelds * 3 + 2; // 雀頭の2枚

  if (handTiles.length !== requiredTilesForBase) return false;
  if (requiredBaseMelds < 0) return false; // 既に4面子以上鳴いているのは異常
  if (requiredBaseMelds === 0) { // 4面子鳴いていれば、残り2枚が雀頭か
    const counts = countTiles(handTiles);
    return counts.size === 1 && counts.values().next().value === 2;
  }


  const counts = countTiles(handTiles);
  let pairs = 0;
  for (const count of counts.values()) {
    if (count >= 2) pairs++;
  }
  if (pairs === 0) return false; // 雀頭候補がない

  // 各雀頭候補で試す
  for (const [tileId, count] of counts) {
    if (count >= 2) {
      const tempHand = [...handTiles];
      // 雀頭を取り除く
      let removedCount = 0;
      for (let i = 0; i < 2; i++) {
        const idx = tempHand.findIndex(t => t.id === tileId);
        if (idx !== -1) tempHand.splice(idx, 1);
        removedCount++;
      }

      if (canMakeMelds(tempHand, requiredBaseMelds)) { // 必要な面子数を渡す
        return true;
      }
    }
  }
  return false;
}

// 残りの牌で指定数の面子を作れるか (再帰)
function canMakeMelds(tiles: Tile[], numMeldsNeeded: number): boolean {
  if (numMeldsNeeded === 0) return true;
  if (tiles.length < 3 * numMeldsNeeded) return false;

  tiles.sort(compareTiles);
  const currentTile = tiles[0];
  const remaining = tiles.slice(1);

  // 刻子として試す
  const koutsuCount = remaining.filter(t => isSameTile(t, currentTile)).length;
  if (koutsuCount >= 2) {
    const nextRemaining = removeFirstNTiles(tiles, currentTile, 3);
    if (canMakeMelds(nextRemaining, numMeldsNeeded - 1)) {
      return true;
    }
  }

  // 順子として試す
  if (currentTile.suit !== TileSuit.JIHAI && currentTile.value <= 7) {
    const next1 = { ...currentTile, value: currentTile.value + 1, id: `${currentTile.value+1}${currentTile.suit}`};
    const next2 = { ...currentTile, value: currentTile.value + 2, id: `${currentTile.value+2}${currentTile.suit}`};
    const idx1 = tiles.findIndex(t => isSameTile(t, next1));
    if (idx1 !== -1) {
      const tempTilesForShuntsu = [...tiles];
      tempTilesForShuntsu.splice(tempTilesForShuntsu.findIndex(t => isSameTile(t, currentTile)), 1);
      tempTilesForShuntsu.splice(tempTilesForShuntsu.findIndex(t => isSameTile(t, next1)), 1);
      const idx2 = tempTilesForShuntsu.findIndex(t => isSameTile(t, next2));
      if (idx2 !== -1) {
        tempTilesForShuntsu.splice(idx2, 1);
        if (canMakeMelds(tempTilesForShuntsu, numMeldsNeeded - 1)) {
          return true;
        }
      }
    }
  }
  return false;
}

// 牌の配列から先頭N個の指定牌を削除するヘルパー
function removeFirstNTiles(tiles: Tile[], targetTile: Tile, n: number): Tile[] {
  const result = [...tiles];
  let count = 0;
  for (let i = 0; i < result.length && count < n; ) {
    if (isSameTile(result[i], targetTile)) {
      result.splice(i, 1);
      count++;
    } else {
      i++;
    }
  }
  return result;
}


// 七対子かどうかを判定
export function isChiitoitsu(handTiles: Tile[]): boolean {
  if (handTiles.length !== 14) return false; // 鳴いていない13枚 + ツモ1枚
  const counts = countTiles(handTiles);
  let pairCount = 0;
  for (const count of counts.values()) {
    if (count === 2) {
      pairCount++;
    }
  }
  return pairCount === 7;
}

// 国士無双かどうかを判定 (13面待ちも考慮)
export function isKokushiMusou(handTiles: Tile[]): boolean {
  if (handTiles.length !== 14) return false;
  const counts = countTiles(handTiles);
  const requiredTiles = YAOCHUUHAI_PROTOTYPES;

  let missingCount = 0;
  let hasPair = false;
  for (const reqTile of requiredTiles) {
    const count = counts.get(reqTile.id) || 0;
    if (count === 0) {
      missingCount++;
    } else if (count === 2) {
      hasPair = true;
    }
  }
  // 13面待ち: 全てのrequiredTilesが1枚ずつあり、どれか1つが対子になっている
  // 通常の国士: 12種が1枚ずつあり、1種が対子になっている (missingCount=0, hasPair=true)
  // 聴牌形: 13種が1枚ずつある (missingCount=0, hasPair=false) OR 12種があり1種が2枚 (missingCount=1, hasPair=true)
  // 和了形 (14枚): missingCount === 0 && hasPair === true
  return missingCount === 0 && hasPair;
}

/**
 * 手牌の向聴数を計算する (簡易版)
 * @param handTilesInput アガリ牌を含まない手牌 (13枚 or 10枚など)
 * @param existingMelds 副露した面子 (鳴き)
 * @param agariContext 和了判定に必要な追加情報
 * @returns {HandAnalysisResult} 向聴数と、和了している場合はその情報
 */
export function analyzeHandShanten(
  handTilesInput: Tile[], // アガリ牌を含まない手牌 (13枚 or 10枚など)
  existingMelds: Meld[] = [], // 副露した面子 (鳴き)
  agariContext?: AgariContext, // 型をエクスポートしたものに変更
  scoreOptions?: ScoreOptions,
): HandAnalysisResult {
  const handLengthForCheck = handTilesInput.length + (agariContext ? 1 : 0);
  if (handLengthForCheck !== 13 && handLengthForCheck !== 14 && !agariContext) {
    // agariContextなしで向聴数だけ見る場合、13枚を想定
    if (handTilesInput.length !== 13) return { shanten: 8 };
  }
  if (agariContext && handTilesInput.length + existingMelds.reduce((sum, m) => sum + m.tiles.length, 0) + 1 !== 14) {
      // 鳴き＋手牌＋アガリ牌 で14枚にならないのはおかしい
      console.warn("Invalid total tile count for agari check with melds.");
      return { shanten: 8 };
  }

  // アガリ牌を含む完成形の手牌 (ソート済み)
  const completedHand = agariContext ? [...handTilesInput, agariContext.agariTile].sort(compareTiles) : [...handTilesInput].sort(compareTiles);
  const completedHandLength = completedHand.length;

  // --- 特殊手の判定 (鳴きなし前提、完成形14枚で判定) ---
  if (agariContext && completedHandLength === 14 && existingMelds.length === 0) {
    if (isKokushiMusou(completedHand)) {
      const handCtx: HandContext = {
        handTiles: completedHand,
        agariTile: agariContext.agariTile,
        melds: [], // 国士無双は鳴きも手牌からの面子もない
        jantou: undefined, // 国士無双に雀頭の概念は通常適用しない
        handPattern: HandPattern.KOKUSHI,
        isTsumo: agariContext.isTsumo,
        isRiichi: agariContext.isRiichi,
        isDoubleRiichi: agariContext.isDoubleRiichi,
        playerWind: agariContext.playerWind,
        roundWind: agariContext.roundWind,
        doraTiles: agariContext.doraTiles,
        uraDoraTiles: agariContext.uraDoraTiles,
        turnCount: agariContext.turnCount,
        isMenzen: true,
        isRinshan: agariContext?.isRinshan,
      };
      const yakuResults = checkYaku(handCtx);
      const score = calculateScore(yakuResults, agariContext.playerWind === HonorType.TON, agariContext.isTsumo, scoreOptions, { handTiles:completedHand, agariTile: agariContext.agariTile, melds:[], playerWind: agariContext.playerWind, roundWind: agariContext.roundWind, isMenzen: true});
      return {
        shanten: -1,
        agariResult: {
          handPattern: HandPattern.KOKUSHI,
          completedHand: completedHand,
          agariTile: agariContext.agariTile,
          melds: [], // 国士は面子なし
          score: score.error ? undefined : score,
          isTsumo: agariContext.isTsumo,
        }
      };
    }
    if (isChiitoitsu(completedHand)) {
      const handCtx: HandContext = {
        handTiles: completedHand,
        agariTile: agariContext.agariTile,
        melds: [], // 七対子は鳴きも手牌からの面子もない
        jantou: undefined, // 七対子に雀頭の概念は通常適用しない
        handPattern: HandPattern.CHIITOITSU,
        isTsumo: agariContext.isTsumo,
        isRiichi: agariContext.isRiichi,
        isDoubleRiichi: agariContext.isDoubleRiichi,
        playerWind: agariContext.playerWind,
        roundWind: agariContext.roundWind,
        doraTiles: agariContext.doraTiles,
        uraDoraTiles: agariContext.uraDoraTiles,
        turnCount: agariContext.turnCount,
        isMenzen: true,
        isRinshan: agariContext?.isRinshan,
      };
      const yakuResults = checkYaku(handCtx);
       // 七対子の符は25符固定なので、fuContextは簡易的に設定
      const score = calculateScore(yakuResults, agariContext.playerWind === HonorType.TON, agariContext.isTsumo, scoreOptions, { handTiles:completedHand, agariTile: agariContext.agariTile, melds:[], playerWind: agariContext.playerWind, roundWind: agariContext.roundWind, isMenzen: true });
      return {
        shanten: -1,
        agariResult: {
          handPattern: HandPattern.CHIITOITSU,
          completedHand: completedHand,
          agariTile: agariContext.agariTile,
          melds: [], // 七対子は面子なし
          score: score.error ? undefined : score,
          isTsumo: agariContext.isTsumo,
        }
      };
    }
  }
  // --- 通常手の判定 ---
  if (agariContext) {
    // 鳴き面子を除いた純粋な手牌部分を計算
    let tilesForBaseAnalysis = [...completedHand];
    existingMelds.forEach(meld => {
        meld.tiles.forEach(tileInMeld => {
            const index = tilesForBaseAnalysis.findIndex(t => isSameTile(t, tileInMeld));
            if (index !== -1) tilesForBaseAnalysis.splice(index, 1);
        });
    });

    if (isBasicAgari(tilesForBaseAnalysis, existingMelds)) {
        const extractedParts = extractMeldsAndJantou(tilesForBaseAnalysis, existingMelds);
        if (extractedParts) {
            const isMenzenCheck = existingMelds.every(m => !m.isOpen) && extractedParts.melds.every(m => !m.isOpen);
            const finalMeldsForContext = [...existingMelds, ...extractedParts.melds];

            const handCtx: HandContext = {
                handTiles: completedHand, // 役判定には完成形14枚を渡す
                agariTile: agariContext.agariTile,
                melds: finalMeldsForContext,
                jantou: extractedParts.jantou,
                handPattern: HandPattern.NORMAL,
                isTsumo: agariContext.isTsumo,
                isRiichi: agariContext.isRiichi,
                isDoubleRiichi: agariContext.isDoubleRiichi,
                playerWind: agariContext.playerWind,
                roundWind: agariContext.roundWind,
                doraTiles: agariContext.doraTiles,
                uraDoraTiles: agariContext.uraDoraTiles,
                turnCount: agariContext.turnCount,
                isMenzen: isMenzenCheck,
                isRinshan: agariContext?.isRinshan,
            };
            const yakuResults = checkYaku(handCtx);

            if (yakuResults.length > 0) {
                const fuCtx = {
                    handTiles: completedHand,
                    agariTile: agariContext.agariTile,
                    melds: finalMeldsForContext,
                    jantou: extractedParts.jantou,
                    playerWind: agariContext.playerWind,
                    roundWind: agariContext.roundWind,
                    isMenzen: isMenzenCheck,
                };
                const scoreResult = calculateScore(yakuResults, agariContext.playerWind === HonorType.TON, agariContext.isTsumo, scoreOptions, fuCtx);
                return {
                    shanten: -1,
                    agariResult: {
                        handPattern: HandPattern.NORMAL,
                        completedHand: completedHand,
                        agariTile: agariContext.agariTile,
                        melds: finalMeldsForContext,
                        jantou: extractedParts.jantou,
                        score: scoreResult,
                        isTsumo: agariContext.isTsumo,
                    }
                };
            } else {
                // 役なし (ドラのみも含む)
                // この場合も和了とみなさない。向聴数0。
                console.warn("No yaku for basic agari (or dora only):", yakuResults);
            }
        } else {
            // 面子・雀頭の抽出に失敗 (isBasicAgari と矛盾するが、ロジック不備の可能性)
            console.warn("Failed to extract melds/jantou from basic agari hand.");
        }
    }
    // isBasicAgari が true だが、役や点数がつかない、または agariContext がない場合
    // 14枚で形だけ和了っている場合は向聴数0 (聴牌)として扱う
    // (ただし、shanten -1 で agariResult なしのケースは既にあるので、ここは通らないかも)
    if (completedHandLength === 14 && !agariContext) return { shanten: -1 }; // 和了形だが詳細不明
    if (completedHandLength === 14) return { shanten: 0 }; // 役なしなどで和了にならなかった聴牌
  }

  // 向聴数計算 (agariContextがない場合、または通常手で役なしだった場合)
  // ここでの向聴数計算は、入力の handTilesInput (アガリ牌を含まない) をベースに行う
  let shanten = 8; // Default shanten
  const currentTilesForShanten = [...handTilesInput].sort(compareTiles);
  const numTilesForShanten = currentTilesForShanten.length;

  // 簡易向聴数計算ロジック (既存のものを流用、鳴きも考慮する必要あり)
  // 8 - (2 * 面子候補数 + 塔子候補数 + 雀頭候補数)
  let mentsuCount = existingMelds.length; // 鳴き面子は確定面子
  let taatsuCount = 0;
  let jantouCount = 0;

  const tempHand = [...currentTilesForShanten]; // 副露牌は除外済みのはずだが、手牌のみ対象とする
  const counts = countTiles(tempHand);

  // 雀頭候補を探す
  for (const [tileId, count] of counts) {
    if (count >= 2) {
      jantouCount = 1; // 1つあれば十分 (最も効率の良いものを探すのは複雑)
      break;
    }
  }

  // 面子・塔子候補を探す (刻子優先)
  const remainingForMentsuTaatsu = [...tempHand];
  remainingForMentsuTaatsu.sort(compareTiles);

  // 暗刻・槓子候補
  const ankoChecked = new Set<string>();
  for (let i = 0; i < remainingForMentsuTaatsu.length; i++) {
    const tile = remainingForMentsuTaatsu[i];
    if (ankoChecked.has(tile.id)) continue;
    const numSame = remainingForMentsuTaatsu.filter(t => isSameTile(t, tile)).length;
    if (numSame >= 3 && mentsuCount < 4) { // 4面子まで
      mentsuCount++;
      // 刻子として使った牌を除く (3枚)
      let removed = 0;
      for (let j = remainingForMentsuTaatsu.length - 1; j >=0; j--) {
          if(isSameTile(remainingForMentsuTaatsu[j], tile) && removed < 3){
              remainingForMentsuTaatsu.splice(j,1);
              removed++;
          }
      }
      ankoChecked.add(tile.id);
      i = -1; // 配列が変わったので最初から走査しなおし (簡易)
    }
  }

  // 順子候補 (残りの牌で)
  const shuntsuCheckedIndices = new Set<number>();
  for (let i = 0; i < remainingForMentsuTaatsu.length; i++) {
    if (shuntsuCheckedIndices.has(i)) continue;
    const t1 = remainingForMentsuTaatsu[i];
    if (t1.suit !== TileSuit.JIHAI && t1.value <= 7 && mentsuCount < 4) {
      const t2Value = t1.value + 1;
      const t3Value = t1.value + 2;
      let idx2 = -1, idx3 = -1;

      for (let j = i + 1; j < remainingForMentsuTaatsu.length; j++) {
        if (shuntsuCheckedIndices.has(j)) continue;
        const currentTile = remainingForMentsuTaatsu[j];
        if (currentTile.suit === t1.suit && currentTile.value === t2Value) {
          idx2 = j;
          break;
        }
      }
      if (idx2 !== -1) {
        for (let k = idx2 + 1; k < remainingForMentsuTaatsu.length; k++) {
          if (shuntsuCheckedIndices.has(k)) continue;
          const currentTile = remainingForMentsuTaatsu[k];
          if (currentTile.suit === t1.suit && currentTile.value === t3Value) {
            idx3 = k;
            break;
          }
        }
      }

      if (idx2 !== -1 && idx3 !== -1) {
        mentsuCount++;
        shuntsuCheckedIndices.add(i);
        shuntsuCheckedIndices.add(idx2);
        shuntsuCheckedIndices.add(idx3);
        // 順子に使った牌は実際には取り除かないで次の候補を探す（より良い分割のため）
        // ただし、この簡易ロジックでは重複カウントの可能性あり。
        // 厳密には面子確定ごとに牌を取り除くべきだが、向聴数計算の複雑さが増す。
      }
    }
  }

  // 塔子候補 (残りの牌で、面子にならなかったものから)
  // 簡易的に、ペアとペンチャン・カンチャン・リャンメン形を探す
  // (この部分は非常に簡易的で、正確な向聴数とは乖離が大きい可能性あり)
  const remainingForTaatsu = [];
  for(let i=0; i<remainingForMentsuTaatsu.length; i++){
      if(!shuntsuCheckedIndices.has(i) && !ankoChecked.has(remainingForMentsuTaatsu[i].id)){
          remainingForTaatsu.push(remainingForMentsuTaatsu[i]);
      }
  }

  for (let i = 0; i < remainingForTaatsu.length; i++) {
    const t1 = remainingForTaatsu[i];
    // 対子塔子
    for (let j = i + 1; j < remainingForTaatsu.length; j++) {
      const t2 = remainingForTaatsu[j];
      if (isSameTile(t1, t2) && (mentsuCount + taatsuCount < 4)) {
        taatsuCount++;
        // TODO: 塔子に使った牌を除く処理 (簡易のため省略)
        break;
      }
    }
    // 辺張・嵌張・両面塔子
    if (t1.suit !== TileSuit.JIHAI && (mentsuCount + taatsuCount < 4)) {
      for (let j = i + 1; j < remainingForTaatsu.length; j++) {
        const t2 = remainingForTaatsu[j];
        if (t1.suit === t2.suit && Math.abs(t1.value - t2.value) <= 2 && Math.abs(t1.value - t2.value) > 0 ) {
          taatsuCount++;
           // TODO: 塔子に使った牌を除く処理 (簡易のため省略)
          break;
        }
      }
    }
    if (mentsuCount + taatsuCount >= 4) break; // 4ブロックあれば十分
  }

  // 向聴数の計算: 8 - (面子数 * 2 + 塔子数 + 雀頭数)
  // ただし、鳴いている場合は 8 - (鳴き面子数 * 2) からスタートし、手牌で不足分を補う
  // ここでは melds を mentsuCount の初期値として考慮済み
  shanten = 8 - (mentsuCount * 2 + taatsuCount + jantouCount);

  // 特殊形 (国士・七対子) の向聴数も計算し、最も良いものを採用
  // (国士無双: 13種 - (揃っている種類数) - (対子があれば-1) )
  // (七対子: 6 - (対子数) ) ※ 13枚の時は計算が異なる
  if (existingMelds.length === 0) { // 鳴いていない場合のみ
    // 国士無双向聴 (13枚/14枚)
    const kokushiCounts = countTiles(currentTilesForShanten);
    const requiredYaochuuhai = YAOCHUUHAI_PROTOTYPES;
    let yaochuuTypes = 0;
    let yaochuuHasPair = false;
    for (const req of requiredYaochuuhai) {
        if (kokushiCounts.has(req.id)) {
            yaochuuTypes++;
            if ((kokushiCounts.get(req.id) || 0) >= 2) yaochuuHasPair = true;
        }
    }
    // 13牌全てあれば聴牌 (13枚手牌なら向聴0、14枚手牌なら和了で-1)
    // 12種あり1種が対子なら聴牌 (13枚手牌なら向聴0、14枚手牌なら和了で-1)
    // それ以外は不足数
    let kokushiShanten = 13 - yaochuuTypes;
    if (yaochuuHasPair) kokushiShanten--; // 対子があれば1向聴減る
    if (completedHandLength === 13 && kokushiShanten < 0) kokushiShanten = 0; // 13枚の時は0が最小
    if (completedHandLength === 14 && kokushiShanten < -1) kokushiShanten = -1; // 14枚の時は-1が最小

    shanten = Math.min(shanten, kokushiShanten);

    // 七対子向聴 (13枚/14枚)
    const chiitoiCounts = countTiles(currentTilesForShanten);
    let pairCountForChiitoi = 0;
    let singleCountForChiitoi = 0;
    for(const count of chiitoiCounts.values()){
        if(count >= 2) pairCountForChiitoi++;
        if(count === 1) singleCountForChiitoi++;
    }
    // 13枚の場合: 6 - 対子数 + (7 - 対子数 - (13 - 対子*2) > 0 ? 7 - 対子数 - (13 - 対子*2) : 0)
    //   = 6 - 対子数 + (対子数 - 6 + singles > 0 ? ...)
    //   必要なのは (7-対子数) のシングル牌。それが手元にあればOK
    // 14枚の場合: 6 - 対子数
    let chiitoiShanten = 6 - pairCountForChiitoi;
    if (completedHandLength === 13) {
        // あと (7-pairCountForChiitoi) 個の対子が必要。
        // 残りの牌 (singleCountForChiitoi 個) からいくつ対子を作れるか。
        // 作れない場合は、その不足分が向聴数に加算される。
        // 例: 5対子1シングル3枚 -> あと2対子必要。シングル3枚からは1対子しか作れないので +1 で向聴1
        const neededPairs = 7 - pairCountForChiitoi;
        const availableSingles = singleCountForChiitoi;
        if (neededPairs > 0) {
            if (availableSingles < neededPairs) { // シングル牌が足りない場合は、その分向聴数増
                 chiitoiShanten += (neededPairs - availableSingles);
            }
        }
    }
    if (completedHandLength === 14 && chiitoiShanten < -1) chiitoiShanten = -1;
    if (completedHandLength === 13 && chiitoiShanten < 0) chiitoiShanten = 0;

    shanten = Math.min(shanten, chiitoiShanten);
  }

  // 最終的な向聴数がマイナスなら-1 (和了) にする
  // (ただし、isBasicAgari, isChiitoitsu, isKokushiMusou で既に-1を返している場合はそちらが優先される)
  if (shanten < -1) shanten = -1;
  if (shanten === -1 && completedHandLength === 13) shanten = 0; // 13枚の場合は和了形でも聴牌(0)扱い

  if (shanten === -1 && completedHandLength === 14 && !agariContext) {
      // 和了形だがagariContextがないので点数計算不可。shantenは-1のまま。
      return { shanten: -1 };
  }
  // shanten === -1 で agariContext があり、かつ isBasicAgari などで agariResult がまだ設定されていない場合
  // (これは通常発生しないはず。isBasicAgari などが先に agariResult を設定する)

  return { shanten };
}

interface ExtractedHandParts {
  melds: Meld[];
  jantou: Tile;
  remainingTiles: Tile[]; // 面子と雀頭を除いた残り (0枚のはず)
}

/**
 * 和了形の手牌 (14枚) から4面子1雀頭を抽出する試み (isBasicAgariがtrueである前提)
 * TODO: より網羅的で最適な分割を見つけるロジックが必要
 * @param handTiles 14枚のソート済み手牌
 * @returns {ExtractedHandParts | null} 面子と雀頭の組み合わせ、見つからなければnull
 */
function extractMeldsAndJantou(handTiles: Tile[], existingMelds: Meld[] = []): ExtractedHandParts | null {
  const requiredBaseMelds = 4 - existingMelds.length;
  const requiredTilesForBase = requiredBaseMelds * 3 + 2;

  if (handTiles.length !== requiredTilesForBase) return null;
  if (requiredBaseMelds < 0) return null; // 既に4面子以上鳴いている
  if (requiredBaseMelds === 0) { // 全て鳴いている場合、残りが雀頭
      const counts = countTiles(handTiles);
      if (counts.size === 1 && counts.values().next().value === 2) {
          const jantouTile = handTiles[0]; // どちらでも良い
          return {
              melds: [], // 手牌からは面子なし
              jantou: jantouTile,
              remainingTiles: []
          };
      }
      return null;
  }

  const counts = countTiles(handTiles);

  // 雀頭候補でループ
  for (const [jantouId, count] of counts) {
    if (count >= 2) {
      const jantouTile = handTiles.find(t => t.id === jantouId)!;
      const tempHandAfterJantou = removeAllTilesFromHand(handTiles, [jantouTile, jantouTile]);

      // 残り牌で必要な数の面子を探す
      const foundMeldsFromHand: Meld[] = [];
      if (findMeldsRecursive(tempHandAfterJantou, requiredBaseMelds, foundMeldsFromHand)) {
        return {
          melds: foundMeldsFromHand.map(m => ({ ...m, isOpen: false })), // 手牌からは全て暗刻/暗順子
          jantou: jantouTile,
          remainingTiles: [], // 成功すれば空のはず
        };
      }
    }
  }
  return null;
}

/**
 * 残りの牌から指定数の面子を再帰的に見つける (暗刻・順子のみ)
 * @param tiles 残りの牌 (ソート済み)
 * @param numMeldsNeeded 必要な面子の数
 * @param foundMelds 発見した面子を格納する配列 (副作用で変更)
 * @returns boolean 全ての面子が見つかればtrue
 */
function findMeldsRecursive(tiles: Tile[], numMeldsNeeded: number, foundMelds: Meld[]): boolean {
  if (numMeldsNeeded === 0) return tiles.length === 0;
  if (tiles.length < 3 * numMeldsNeeded) return false;

  tiles.sort(compareTiles); // 毎回のソートは非効率だが、ロジックの単純化のため
  const currentTile = tiles[0];

  // 刻子として試す
  const koutsuCount = tiles.filter(t => isSameTile(t, currentTile)).length;
  if (koutsuCount >= 3) {
    const koutsu: Meld = { type: 'koutsu', tiles: [currentTile, currentTile, currentTile], isOpen: false };
    const remainingAfterKoutsu = removeAllTilesFromHand(tiles, koutsu.tiles);
    foundMelds.push(koutsu);
    if (findMeldsRecursive(remainingAfterKoutsu, numMeldsNeeded - 1, foundMelds)) {
      return true;
    }
    foundMelds.pop(); // バックトラック
  }

  // 順子として試す
  if (currentTile.suit !== TileSuit.JIHAI && currentTile.value <= 7) {
    const next1Tile = tiles.find(t => t.suit === currentTile.suit && t.value === currentTile.value + 1);
    if (next1Tile) {
      const next2Tile = tiles.find(t => t.suit === currentTile.suit && t.value === currentTile.value + 2 && !isSameTile(t, next1Tile)); // 2枚目が同じ牌でないことを保証
       if (next2Tile) {
        const shuntsuTiles = [currentTile, next1Tile, next2Tile].sort(compareTiles);
        const shuntsu: Meld = { type: 'shuntsu', tiles: shuntsuTiles, isOpen: false };
        const remainingAfterShuntsu = removeAllTilesFromHand(tiles, shuntsu.tiles);
        foundMelds.push(shuntsu);
        if (findMeldsRecursive(remainingAfterShuntsu, numMeldsNeeded - 1, foundMelds)) {
          return true;
        }
        foundMelds.pop(); // バックトラック
      }
    }
  }
  return false;
}


// TODO: より正確な面子分割ロジック (全ての組み合わせを試すなど)
// function findBestMeldCombination(hand: Tile[]): { melds: Meld[], jantou?: Tile } | null
