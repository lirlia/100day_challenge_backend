import { Tile, TileSuit, HonorType, compareTiles, isSameTile } from "./tiles";

export type Meld = {
  type: "shuntsu" | "koutsu" | "kantsu"; // 面子の種類: 順子、刻子、槓子
  tiles: Tile[];         // 面子を構成する牌 (順子は3枚、刻子は3枚、槓子は4枚)
  isOpen: boolean;       // 副露しているか (trueなら鳴いた面子)
};

// 手牌の評価結果
export interface HandAnalysis {
  shanten: number; // 向聴数 (-1なら和了)
  isAgari: boolean; // 和了形かどうか
  // TODO: 役判定結果などを追加予定
}

/**
 * 手牌に牌を追加し、ソートする
 * @param hand 現在の手牌
 * @param tile 追加する牌
 * @returns 更新された手牌
 */
export function addTileToHand(hand: Tile[], tile: Tile): Tile[] {
  const newHand = [...hand, tile];
  newHand.sort(compareTiles);
  return newHand;
}

/**
 * 手牌から指定された牌を1枚削除する
 * @param hand 現在の手牌
 * @param tileToRemove 削除する牌
 * @returns 更新された手牌。牌が見つからなければ元の手牌を返す。
 */
export function removeTileFromHand(hand: Tile[], tileToRemove: Tile): Tile[] {
  const index = hand.findIndex(t => isSameTile(t, tileToRemove));
  if (index === -1) {
    return hand; // 牌が見つからない
  }
  const newHand = [...hand];
  newHand.splice(index, 1);
  return newHand;
}

/**
 * 手牌の牌の数をカウントする (例: {'1m': 2, '2m': 1, ...})
 * @param hand
 * @returns {Record<string, number>} 各牌の枚数のマップ
 */
function countTiles(hand: Tile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tile of hand) {
    counts[tile.id] = (counts[tile.id] || 0) + 1;
  }
  return counts;
}


/**
 * 基本的な和了判定 (4面子1雀頭)
 * 現時点では役は考慮しない。鳴きも考慮しない。
 * @param hand 14枚の手牌 (ソート済みであること)
 * @returns boolean 和了形ならtrue
 */
export function isBasicAgari(hand: Tile[]): boolean {
  if (hand.length !== 14) return false; // 14枚でなければ和了ではない (副露考慮は後で)

  const counts = countTiles(hand);

  // 雀頭の候補を探す
  for (const tileId in counts) {
    if (counts[tileId] >= 2) {
      const remainingHand = [...hand];
      // 雀頭を除いた手牌を作成
      let removedCount = 0;
      for (let i = 0; i < remainingHand.length && removedCount < 2; ) {
        if (remainingHand[i].id === tileId) {
          remainingHand.splice(i, 1);
          removedCount++;
        } else {
          i++;
        }
      }

      // 残りの12枚で4面子を作れるか試す
      if (canMakeMelds(remainingHand, 4)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 残りの手牌で指定された数の面子を作れるか判定する (再帰関数)
 * @param hand 残りの手牌 (ソート済み)
 * @param meldsNeeded 必要な面子の数
 */
function canMakeMelds(hand: Tile[], meldsNeeded: number): boolean {
  if (meldsNeeded === 0) return hand.length === 0; // 全ての牌が面子になった
  if (hand.length < 3 * meldsNeeded) return false; // 牌が足りない

  const currentTile = hand[0];
  const counts = countTiles(hand);

  // 刻子チェック
  if (counts[currentTile.id] >= 3) {
    const nextHand = removeTilesById(hand, currentTile.id, 3);
    if (canMakeMelds(nextHand, meldsNeeded - 1)) {
      return true;
    }
  }

  // 順子チェック (字牌は順子を作れない)
  if (currentTile.suit !== TileSuit.JIHAI && currentTile.value <= 7) {
    const nextNum1 = hand.find(t => t.suit === currentTile.suit && t.value === currentTile.value + 1);
    const nextNum2 = hand.find(t => t.suit === currentTile.suit && t.value === currentTile.value + 2);
    if (nextNum1 && nextNum2) {
      let tempHand = [...hand];
      tempHand = removeTilesById(tempHand, currentTile.id, 1);
      tempHand = removeTilesById(tempHand, nextNum1.id, 1);
      tempHand = removeTilesById(tempHand, nextNum2.id, 1);
      if (canMakeMelds(tempHand, meldsNeeded - 1)) {
        return true;
      }
    }
  }
  return false; // この牌を開始点とする面子が見つからなかった
}

/**
 * 手牌から指定IDの牌をN枚削除するヘルパー関数
 */
function removeTilesById(hand: Tile[], tileId: string, count: number): Tile[] {
  const newHand = [...hand];
  let removed = 0;
  for (let i = 0; i < newHand.length && removed < count; ) {
    if (newHand[i].id === tileId) {
      newHand.splice(i, 1);
      removed++;
    } else {
      i++;
    }
  }
  return newHand;
}


/**
 * 七対子の判定
 * @param hand 14枚の手牌
 * @returns boolean 七対子ならtrue
 */
export function isChiitoitsu(hand: Tile[]): boolean {
  if (hand.length !== 14) return false;
  const counts = countTiles(hand);
  let pairCount = 0;
  for (const tileId in counts) {
    if (counts[tileId] === 2) {
      pairCount++;
    } else if (counts[tileId] !== 0 && counts[tileId] !== 2) {
        // 七対子は全ての牌が対子である必要がある (4枚使いは不可)
        return false;
    }
  }
  return pairCount === 7;
}

/**
 * 国士無双の判定
 * @param hand 13枚または14枚の手牌
 * @returns boolean 国士無双ならtrue
 */
export function isKokushiMusou(hand: Tile[]): boolean {
  if (hand.length !== 13 && hand.length !== 14) return false;

  const yaochuhaiIds = [
    "1m", "9m", "1s", "9s", "1p", "9p",
    "ton", "nan", "sha", "pei", "haku", "hatsu", "chun"
  ];
  const counts = countTiles(hand);
  let yaochuCount = 0;
  let hasPair = false;

  for (const yaochuId of yaochuhaiIds) {
    if (counts[yaochuId] === 1) {
      yaochuCount++;
    } else if (counts[yaochuId] === 2) {
      yaochuCount++;
      if (hasPair && hand.length === 13) return false; // 13枚聴牌で2つ目のペアはありえない
      hasPair = true;
    } else if (counts[yaochuId] > 2) {
      return false; // 同じ幺九牌が3枚以上は国士無双ではない
    }
  }
  // 13種の幺九牌が全てあり、そのうち1つが対子（14枚の場合） or 全て1枚ずつ（13枚聴牌の場合）
  const uniqueYaochuPresent = yaochuhaiIds.every(id => counts[id] >= 1);

  if (hand.length === 14) {
      return uniqueYaochuPresent && hasPair && yaochuCount === 13; // 13種全てあり、どれか1つが雀頭
  } else if (hand.length === 13) { // 国士13面待ち
      return uniqueYaochuPresent && !hasPair && yaochuCount === 13; // 13種全て1枚ずつ
  }
  return false;
}


/**
 * 向聴数計算 (簡易版 - まずは和了形のみ正確に)
 * TODO: より正確な向聴数計算ロジックを実装する
 * @param hand 13枚または14枚の手牌 (ソート済み)
 * @returns HandAnalysis
 */
export function analyzeHandShanten(hand: Tile[]): HandAnalysis {
  const handLength = hand.length;
  if (handLength !== 13 && handLength !== 14) {
    // 不正な手牌の長さ (副露を考慮するまでは13または14枚)
    return { shanten: 99, isAgari: false }; // 仮の値
  }

  if (isKokushiMusou(hand)) {
    return { shanten: handLength === 14 ? -1 : 0, isAgari: handLength === 14 }; // 13枚なら聴牌、14枚なら和了
  }
  if (isChiitoitsu(hand)) {
    return { shanten: -1, isAgari: true }; // 七対子は14枚で完成
  }
  if (handLength === 14 && isBasicAgari(hand)) {
    return { shanten: -1, isAgari: true };
  }

  // ここから先はより複雑な向聴数計算が必要
  // 現時点では、上記の特殊形以外は聴牌以上として扱うのは難しいので、
  // 簡単なチェックのみ行う。

  // 一般形 (4面子1雀頭) の向聴数を計算する (非常に簡易的な実装)
  // この部分は本格的なアルゴリズムが必要
  // ここではまず、雀頭候補と面子候補の数を数えてざっくりとした向聴数を出す試み

  let minShanten = 8; // 4面子1雀頭形の理論的最大向聴数 (バラバラの状態)

  // 13枚の手牌で計算 (14枚目はツモ牌として扱い、どれを捨てると向聴数が最小になるか)
  const baseHand = handLength === 14 ? hand.slice(0, 13) : [...hand]; // 14枚の場合は1枚余分なので、13枚で評価

  // 雀頭の探索
  const uniqueTiles = Array.from(new Set(baseHand.map(t => t.id))).map(id => baseHand.find(t => t.id === id)!);

  for (let i = 0; i <= uniqueTiles.length; i++) { // i = uniqueTiles.length は雀頭なしケース
    const tempHand = [...baseHand];
    let janto: Tile | null = null;
    let mentsuCount = 0;
    let taatsuCount = 0;

    if (i < uniqueTiles.length) {
        const jantoCandidate = uniqueTiles[i];
        const jantoTilesInHand = tempHand.filter(t => isSameTile(t, jantoCandidate));
        if (jantoTilesInHand.length >= 2) {
            janto = jantoCandidate;
            removeTilesById(tempHand, janto.id, 2); // 雀頭を除去
        }
    }

    // 残りの牌で面子と塔子を探す (非常に単純な方法)
    const currentCounts = countTiles(tempHand);
    const processed = new Set<string>();

    tempHand.sort(compareTiles); // 再ソート

    // 刻子を優先的に抜き出す
    for(const tile of tempHand) {
        if (processed.has(tile.id)) continue;
        if (currentCounts[tile.id] >= 3) {
            mentsuCount++;
            processed.add(tile.id);
            removeTilesById(tempHand, tile.id, 3);
            currentCounts[tile.id] -=3;
        }
    }

    // 順子を抜き出す
    for(let j=0; j < tempHand.length; j++) {
        const t1 = tempHand[j];
        if (processed.has(t1.id) || t1.suit === TileSuit.JIHAI || t1.value > 7) continue;

        const t2Index = tempHand.findIndex((t, idx) => idx > j && t.suit === t1.suit && t.value === t1.value + 1 && !processed.has(t.id));
        if (t2Index === -1) continue;
        const t2 = tempHand[t2Index];

        const t3Index = tempHand.findIndex((t, idx) => idx > t2Index && t.suit === t1.suit && t.value === t1.value + 2 && !processed.has(t.id));
        if (t3Index === -1) continue;

        mentsuCount++;
        processed.add(t1.id);
        processed.add(t2.id);
        processed.add(tempHand[t3Index].id); // t3

        removeTilesById(tempHand, t1.id, 1);
        removeTilesById(tempHand, t2.id, 1);
        removeTilesById(tempHand, tempHand[t3Index].id, 1);
        currentCounts[t1.id]--;
        currentCounts[t2.id]--;
        currentCounts[tempHand[t3Index].id]--;
        j = -1; // 配列が変わったので最初からスキャンし直す (非効率)
    }

    // 塔子(対子、辺張、嵌張、両面)を抜き出す
    // 対子
    for(const tile of tempHand) {
        if (processed.has(tile.id)) continue;
        if (currentCounts[tile.id] === 2) {
            taatsuCount++;
            processed.add(tile.id);
        }
    }
    // 両面・辺張・嵌張 (非常に雑な判定)
    for(let j=0; j < tempHand.length; j++) {
        const t1 = tempHand[j];
        if (processed.has(t1.id) || t1.suit === TileSuit.JIHAI) continue;

        const t2Index = tempHand.findIndex((t, idx) => idx > j && t.suit === t1.suit && (t.value === t1.value + 1 || t.value === t1.value + 2) && !processed.has(t.id));
        if (t2Index !== -1) {
            taatsuCount++;
            processed.add(t1.id);
            processed.add(tempHand[t2Index].id);
            j = t2Index; // スキップ
        }
    }


    let shantenForThisJanto = 8 - (mentsuCount * 2) - taatsuCount - (janto ? 1 : 0);
    if (mentsuCount + taatsuCount > 4) { // 面子と塔子の合計は最大4つまで
        shantenForThisJanto += (mentsuCount + taatsuCount - 4);
    }
    if (!janto && mentsuCount + taatsuCount < 4) { // 雀頭がなく、面子+塔子が4未満の場合、雀頭を作るための1を加算
         shantenForThisJanto++;
    }
     if (janto && mentsuCount === 4) { // 雀頭あり、4面子完成
        shantenForThisJanto = -1; // 和了
    }


    minShanten = Math.min(minShanten, shantenForThisJanto);
  }


  // 13枚手牌の場合の処理
  if (handLength === 13) {
      // 13枚の場合、計算結果が-1 (和了) になることはない。最小は0 (聴牌)。
      if (minShanten < 0) minShanten = 0;
  }
  // 14枚の場合、1枚捨てて向聴数が最小になるものを探す
  else if (handLength === 14) {
    let minShantenFor14 = 8; // 14枚から1枚捨てて13枚にしたときの最小向聴数+1
    for (let i = 0; i < hand.length; i++) {
      const tempHand13 = [...hand];
      tempHand13.splice(i, 1); // 1枚捨てる
      const analysis13 = analyzeHandShanten(tempHand13); // 13枚で評価
      // analysis13.shanten は13枚時点の向聴数なので、14枚目を持ってる状態では+1シャンテン扱い(捨てる牌を選ぶため)
      // ただし、analysis13.shanten が -1 (13枚でなぜか和了になってる)場合は、0として扱うべきか検討
      // ここは、13枚にした結果のシャンテン数に、打牌選択の1打を加味するイメージ。
      minShantenFor14 = Math.min(minShantenFor14, analysis13.shanten === -1 ? 1 : analysis13.shanten + 1);
    }
    // 上記の minShantenFor14 は「1打進めると何向聴になるか」の最小値
    // 現在の14枚の状態の向聴数としては、この値そのものではなく、
    // isBasicAgari(hand) で直接和了を判定し、そうでなければ minShantenFor14 を参照する形が適切。

    if (isBasicAgari(hand)) { // まず14枚で和了形か確認
        minShanten = -1;
    } else {
        // 和了でなければ、1枚捨てた場合の最小向聴数(minShantenFor14-1)を現在の向聴数とする
        // minShantenFor14は「1打進めた結果の向聴数」なので、現在の向聴数はそれより1少ない。
        // ただし、minShanten (一般形での計算結果) とも比較する。
        minShanten = Math.min(minShanten, minShantenFor14);
    }
  }

  minShanten = Math.max(minShanten, -1); // 和了は-1より小さくならない

  return {
    shanten: minShanten,
    isAgari: minShanten === -1,
  };
}
