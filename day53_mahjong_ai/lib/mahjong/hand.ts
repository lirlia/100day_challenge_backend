import { Tile, TileSuit, HonorType, isSameTile, compareTiles, tileFromString, tilesFromStrings } from './tiles';
import { checkYaku, HandContext, YakuResult, ALL_YAKU } from './yaku'; // Yaku関連をインポート
import { calculateScore, ScoreResult, ScoreOptions } from './score'; // Score関連をインポート
import { GameState, PlayerIdentifier as PlayerID } from './game_state'; // GameStateの一部をインポート

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
  machiPattern?: MachiPattern; // 待ちの形
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

// 待ちの形を表す Enum
export enum MachiPattern {
  RYANMEN = "Ryanmen",      // 両面待ち (例: 23 で 1-4待ち)
  KANCHAN = "Kanchan",      // 嵌張待ち (例: 24 で 3待ち)
  PENCHAN = "Penchan",      // 辺張待ち (例: 12 で 3待ち, 89 で 7待ち)
  SHABO = "Shabo",          // 双碰待ち (例: 東東 西西 で 東か西待ち)
  TANKI = "Tanki",          // 単騎待ち (例: 123456789東東南南西 で 西待ち)
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
  // if (handLengthForCheck !== 13 && handLengthForCheck !== 14 && !agariContext) {
  //     // agariContextなしで向聴数だけ見る場合、13枚を想定
  //     if (handTilesInput.length !== 13) return { shanten: 8 };
  // }
  // if (agariContext && handTilesInput.length + existingMelds.reduce((sum, m) => sum + m.tiles.length, 0) + 1 !== 14) {
  //     // 鳴き＋手牌＋アガリ牌 で14枚にならないのはおかしい
  //     console.warn("Invalid total tile count for agari check with melds.");
  //     return { shanten: 8 };
  // }

  let completedHand: Tile[] = [];
  if (agariContext) {
    completedHand = [...handTilesInput, agariContext.agariTile].sort(compareTiles);
  }

  // 1. 国士無双のチェック (和了形のみ)
  if (agariContext && completedHand.length === 14 && isKokushiMusou(completedHand)) {
    const agariInfo: AgariInfo = {
      handPattern: HandPattern.KOKUSHI,
      completedHand,
      agariTile: agariContext.agariTile,
      melds: [], // 国士は面子なし
      isTsumo: agariContext.isTsumo,
      machiPattern: MachiPattern.TANKI,
    };
    return { shanten: -1, agariResult: agariInfo };
  }

  // 2. 七対子のチェック (和了形のみ)
  if (agariContext && completedHand.length === 14 && isChiitoitsu(completedHand) && existingMelds.length === 0) {
    const agariInfo: AgariInfo = {
      handPattern: HandPattern.CHIITOITSU,
      completedHand,
      agariTile: agariContext.agariTile,
      melds: [],
      isTsumo: agariContext.isTsumo,
      machiPattern: MachiPattern.TANKI,
    };
    return { shanten: -1, agariResult: agariInfo };
  }

  let bestShanten = 8;
  let bestAgariInfo: AgariInfo | undefined = undefined;

  const handForAnalysis = agariContext ? completedHand : handTilesInput;

  if (agariContext && handForAnalysis.length === 14) {
    const extractedParts = extractMeldsAndJantou(handForAnalysis, existingMelds);
    if (extractedParts) {
      let determinedMachiPattern: MachiPattern | undefined = determineMachiPattern(
        extractedParts.melds,
        extractedParts.jantou,
        agariContext.agariTile,
        existingMelds
      );

      const agariInfo: AgariInfo = {
        handPattern: HandPattern.NORMAL,
        completedHand: handForAnalysis,
        agariTile: agariContext.agariTile,
        melds: extractedParts.melds,
        jantou: extractedParts.jantou,
        isTsumo: agariContext.isTsumo,
        machiPattern: determinedMachiPattern,
      };
      bestShanten = -1;
      bestAgariInfo = agariInfo;
      return { shanten: bestShanten, agariResult: bestAgariInfo };
    }
  }

  if (bestShanten > 0) {
    const currentShanten = calculateShantenNormal(handTilesInput, existingMelds);
    bestShanten = currentShanten;
  }

  return { shanten: bestShanten, agariResult: bestAgariInfo };
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

// 手牌が九種九牌（キュウシュキュウハイ）か判定する関数
export function isKyuushuuKyuuhai(hand: Tile[]): boolean {
  if (hand.length < 13) return false; // 配牌時を想定

  const yaochuuTiles = hand.filter(tile =>
    (tile.suit === TileSuit.MANZU || tile.suit === TileSuit.SOZU || tile.suit === TileSuit.PINZU) && (tile.value === 1 || tile.value === 9) ||
    (tile.suit === TileSuit.JIHAI)
  );

  const uniqueYaochuuTypes = new Set(yaochuuTiles.map(tile => tile.id));

  return uniqueYaochuuTypes.size >= 9;
}

// 待ちの形を判定するヘルパー関数 (要実装)
function determineMachiPattern(
  completedMelds: Meld[],
  jantou: Tile,
  agariTile: Tile,
  existingMelds: Meld[]
): MachiPattern | undefined {
  const handOnlyMelds = completedMelds.filter(m =>
    !existingMelds.some(em =>
        em.tiles.length === m.tiles.length &&
        em.tiles.every((et, i) => isSameTile(et, m.tiles[i]))
    )
  );

  if (isSameTile(jantou, agariTile)) {
    const tempHand = removeTileFromHand(completedMelds.flatMap(m => m.tiles), agariTile);
    if (canMakeMelds(tempHand, completedMelds.length)) {
         return MachiPattern.TANKI;
    }
  }

  for (const meld of handOnlyMelds) {
    if (meld.type === 'koutsu' && meld.tiles.some(t => isSameTile(t, agariTile))) {
      const otherTiles = meld.tiles.filter(t => !isSameTile(t, agariTile));
      if (otherTiles.length === 2 && isSameTile(otherTiles[0], otherTiles[1])) {
        return MachiPattern.SHABO;
      }
    }
  }

  for (const meld of handOnlyMelds) {
    if (meld.type === 'shuntsu' && meld.tiles.some(t => isSameTile(t, agariTile))) {
      if (agariTile.suit === TileSuit.JIHAI) continue;
      const sortedMeldTiles = [...meld.tiles].sort(compareTiles);
      const agariIndex = sortedMeldTiles.findIndex(t => isSameTile(t, agariTile));

      if (agariTile.value === 1 && agariIndex === 0 && sortedMeldTiles[1].value === 2 && sortedMeldTiles[2].value === 3) return MachiPattern.PENCHAN; // 123 の 1 (ペン3待ちの片割れ扱いだが、平和ではOK)
      if (agariTile.value === 9 && agariIndex === 2 && sortedMeldTiles[0].value === 7 && sortedMeldTiles[1].value === 8) return MachiPattern.PENCHAN; // 789 の 9 (ペン7待ちの片割れ扱いだが、平和ではOK)
      if (agariTile.value === 3 && agariIndex === 2 && sortedMeldTiles[0].value === 1 && sortedMeldTiles[1].value === 2) return MachiPattern.PENCHAN; // 12 で 3待ち
      if (agariTile.value === 7 && agariIndex === 0 && sortedMeldTiles[1].value === 8 && sortedMeldTiles[2].value === 9) return MachiPattern.PENCHAN; // 89 で 7待ち

      if (agariIndex === 1) {
        if (sortedMeldTiles[0].value === agariTile.value - 1 && sortedMeldTiles[2].value === agariTile.value + 1) {
          return MachiPattern.KANCHAN;
        }
      }

      if (agariIndex === 0 && sortedMeldTiles[1].value === agariTile.value + 1 && sortedMeldTiles[2].value === agariTile.value + 2) {
        if (agariTile.value >= 1 && agariTile.value <= 7) return MachiPattern.RYANMEN;
      }
      if (agariIndex === 2 && sortedMeldTiles[0].value === agariTile.value - 2 && sortedMeldTiles[1].value === agariTile.value - 1) {
        if (agariTile.value >= 3 && agariTile.value <= 9) return MachiPattern.RYANMEN;
      }
    }
  }
  return undefined;
}

function calculateShantenNormal(handTiles: Tile[], existingMelds: Meld[]): number {
  if (isBasicAgari(handTiles, existingMelds)) return 0;
  // TODO: Implement a more accurate shanten calculation for normal hands.
  // This is a very simplified placeholder.
  // Count isolated tiles, pairs, taatsu (proto-shuntsu/koutsu)
  // and apply standard shanten formula (8 - 2*num_melds - num_taatsu - num_pairs)
  // For now, return a high number if not immediately tenpai.
  let shanten = 8;
  const baseMelds = existingMelds.length;
  let pairs = 0;
  let taatsu = 0;
  let koutsuCandidates = 0;

  const counts = countTiles(handTiles);
  const uniqueTiles = Array.from(counts.keys()).map(id => tileFromString(id)!).sort(compareTiles);

  // Count pairs and koutsu from hand
  for(const tileId of counts.keys()){
      if(counts.get(tileId)! >= 2) pairs++;
      if(counts.get(tileId)! >= 3) koutsuCandidates++;
  }
  shanten -= pairs; // Simplified pair contribution
  shanten -= koutsuCandidates * 2; // Simplified koutsu contribution

  // Count taatsu (proto-shuntsu)
  for (let i = 0; i < uniqueTiles.length; i++) {
    const t1 = uniqueTiles[i];
    if (t1.suit === TileSuit.JIHAI) continue;
    // Check for ryanmen/kanchan type taatsu
    const t2_val = t1.value + 1;
    const t3_val = t1.value + 2;
    if (counts.has(`${t2_val}${t1.suit}`) && t2_val <=9) taatsu++;
    else if (counts.has(`${t3_val}${t1.suit}`) && t3_val <=9) taatsu++;
  }
  shanten -= taatsu; // Simplified taatsu contribution
  shanten -= baseMelds * 2;

  return Math.max(0, shanten); // Shanten cannot be negative here (unless agari)
}
