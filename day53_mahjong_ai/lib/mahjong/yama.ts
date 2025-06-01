import { ALL_TILE_PROTOTYPES, Tile, compareTiles, TileSuit, HonorType } from "./tiles";

export interface Yama {
  tiles: Tile[];        // 山に残っている牌
  wanpai: Tile[];       // 王牌 (嶺上牌4枚、ドラ表示牌、裏ドラ表示牌)
  doraIndicators: Tile[]; // ドラ表示牌 (ゲーム中に公開される)
  uraDoraIndicators: Tile[]; // 裏ドラ表示牌 (リーチ和了時に公開される)
  rinshanTiles: Tile[];   // 嶺上牌 (カンの時にツモる)
}

const TOTAL_TILES_IN_YAMA = 136;
const WANPAI_SIZE = 14; // 王牌の枚数 (嶺上牌4 + ドラ表示5 + 裏ドラ表示5)
const RINSHAN_SIZE = 4; // 嶺上牌の枚数
const DORA_INDICATOR_INITIAL_POS = 2; // 王牌の先頭から3枚目 (0-indexed)
let currentKanDoraIndicatorPos = DORA_INDICATOR_INITIAL_POS + 2; // 最初のカンドラ表示牌の位置 (ドラ表示の2つ隣)

/**
 * 新しい牌山を生成しシャッフルする
 * @returns {Yama} 初期化された牌山オブジェクト
 */
export function createYama(): Yama {
  let allTiles: Tile[] = [];
  // 各牌のプロトタイプから4枚ずつ牌を生成
  ALL_TILE_PROTOTYPES.forEach(prototype => {
    for (let i = 0; i < 4; i++) {
      // isRed は今回は全てfalse。もし赤5萬、赤5索、赤5筒を各1枚入れる場合はここで調整する。
      // 例: if (prototype.id === '5m' && i === 0) newTile.isRed = true;
      allTiles.push({ ...prototype, isRedDora: (prototype.id === '5m' || prototype.id === '5p' || prototype.id === '5s') && i === 0 });
    }
  });

  // シャッフル (Fisher-Yates algorithm)
  for (let i = allTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
  }

  const yamaTiles = allTiles.slice(0, TOTAL_TILES_IN_YAMA - WANPAI_SIZE);
  const wanpaiTiles = allTiles.slice(TOTAL_TILES_IN_YAMA - WANPAI_SIZE);

  // 王牌から嶺上牌とドラ表示牌をセット
  const rinshanTiles = wanpaiTiles.slice(0, RINSHAN_SIZE);
  // ドラ表示牌は王牌の後ろから5枚目 (wanpaiTiles[4]が最初のドラ表示牌)
  // 配牌時に最初のドラ表示牌を公開する
  const doraIndicators = [wanpaiTiles[DORA_INDICATOR_INITIAL_POS]];
  // 裏ドラ表示牌は、ドラ表示牌のすぐ下から5枚 (通常)
  const uraDoraIndicators = wanpaiTiles.slice(DORA_INDICATOR_INITIAL_POS + 1, DORA_INDICATOR_INITIAL_POS + 1 + 5);

  currentKanDoraIndicatorPos = DORA_INDICATOR_INITIAL_POS + 2; // グローバル変数をリセット

  return {
    tiles: yamaTiles,
    wanpai: wanpaiTiles, // 王牌全体も保持しておく
    doraIndicators,
    uraDoraIndicators,
    rinshanTiles,
  };
}

/**
 * 山から配牌を行う (親14枚、子13枚)
 * 二人麻雀なので、プレイヤーとCPUに配る
 * @param yama 対象の牌山
 * @returns {{ playerHand: Tile[], cpuHand: Tile[], updatedYama: Yama }}
 */
export function dealInitialHands(yama: Yama): {
  playerHand: Tile[];
  cpuHand: Tile[];
  updatedYama: Yama;
} {
  const mutableYamaTiles = [...yama.tiles];
  const playerHand: Tile[] = [];
  const cpuHand: Tile[] = [];

  // 二人麻雀なので、親(プレイヤーと仮定)13枚+1枚、子(CPU)13枚
  // 通常の配牌 (親は13枚+1枚,子は13枚)
  for (let i = 0; i < 13; i++) {
    playerHand.push(mutableYamaTiles.pop()!);
    cpuHand.push(mutableYamaTiles.pop()!);
  }
  playerHand.push(mutableYamaTiles.pop()!); // 親の最初のツモ

  playerHand.sort(compareTiles);
  cpuHand.sort(compareTiles);

  return {
    playerHand,
    cpuHand,
    updatedYama: { ...yama, tiles: mutableYamaTiles },
  };
}

/**
 * 山から1枚ツモる
 * @param yama 対象の牌山
 * @returns {{ tile: Tile | null, updatedYama: Yama }} ツモった牌と更新された山。山が空ならnull。
 */
export function drawTile(yama: Yama): {
  tile: Tile | null;
  updatedYama: Yama;
} {
  if (yama.tiles.length === 0) {
    return { tile: null, updatedYama: yama }; // 山が空
  }
  const mutableYamaTiles = [...yama.tiles];
  const tile = mutableYamaTiles.pop()!;
  return {
    tile,
    updatedYama: { ...yama, tiles: mutableYamaTiles },
  };
}

/**
 * 嶺上牌を1枚ツモる
 * @param yama 対象の牌山
 * @returns {{ tile: Tile | null, updatedYama: Yama }} ツモった嶺上牌と更新された山。嶺上牌が空ならnull。
 */
export function drawRinshanTile(yama: Yama): {
  tile: Tile | null;
  updatedYama: Yama;
} {
  if (yama.rinshanTiles.length === 0) {
    return { tile: null, updatedYama: yama }; // 嶺上牌が空
  }
  const mutableRinshanTiles = [...yama.rinshanTiles];
  const tile = mutableRinshanTiles.pop()!;
  const mutableWanpai = [...yama.wanpai];

  // 王牌からも取り除く (整合性のため。実際には嶺上牌の配列だけで管理しても良い)
  const wanpaiIndex = mutableWanpai.findIndex(wp => wp.id === tile.id && wp.suit === tile.suit && wp.value === tile.value);
  if (wanpaiIndex !== -1) mutableWanpai.splice(wanpaiIndex, 1);

  // カン成立後、新しいドラ表示牌をめくる処理は processAction 内の revealKanDora で行うため、ここでは削除。
  // const newDoraIndicatorIndex = 4 + yama.doraIndicators.length;
  // if (newDoraIndicatorIndex < WANPAI_SIZE - RINSHAN_SIZE) {
  //   const newDoraIndicator = yama.wanpai[newDoraIndicatorIndex];
  //   if (newDoraIndicator) {
  //       yama.doraIndicators.push(newDoraIndicator);
  //   }
  // }

  return {
    tile,
    updatedYama: {
      ...yama,
      rinshanTiles: mutableRinshanTiles,
      wanpai: mutableWanpai,
      // doraIndicators はここでは変更しない
    },
  };
}

/**
 * ドラ表示牌から実際のドラを決定する
 * @param doraIndicator ドラ表示牌
 * @returns {Tile} ドラ牌
 */
export function getDoraFromIndicator(doraIndicator: Tile): Tile {
  let doraSuit = doraIndicator.suit;
  let doraValue = doraIndicator.value;

  if (doraIndicator.suit !== TileSuit.JIHAI) {
    doraValue = doraValue === 9 ? 1 : doraValue + 1;
  } else {
    switch (doraIndicator.value) {
      case HonorType.TON: doraValue = HonorType.NAN; break;
      case HonorType.NAN: doraValue = HonorType.SHA; break;
      case HonorType.SHA: doraValue = HonorType.PEI; break;
      case HonorType.PEI: doraValue = HonorType.TON; break; // 東南西北 -> 東
      case HonorType.HAKU: doraValue = HonorType.HATSU; break;
      case HonorType.HATSU: doraValue = HonorType.CHUN; break;
      case HonorType.CHUN: doraValue = HonorType.HAKU; break; // 白發中 -> 白
      default: break;
    }
  }
  // ALL_TILE_PROTOTYPES から対応する牌を見つけて返す
  const dora = ALL_TILE_PROTOTYPES.find(p => p.suit === doraSuit && p.value === doraValue);
  return dora ? { ...dora } : { ...doraIndicator }; // 見つからない場合は表示牌自身 (ありえないはず)
}

/**
 * 現在公開されている全てのドラ牌を取得する
 * @param yama
 * @returns {Tile[]}
 */
export function getCurrentDora(yama: Yama): Tile[] {
    return yama.doraIndicators.map(indicator => getDoraFromIndicator(indicator));
}

/**
 * 現在公開されている全ての裏ドラ牌を取得する (リーチ和了時用)
 * @param yama
 * @returns {Tile[]}
 */
export function getCurrentUraDora(yama: Yama): Tile[] {
    return yama.uraDoraIndicators.map(indicator => getDoraFromIndicator(indicator));
}

/**
 * カン成立時に新しいドラ表示牌をめくる
 * @param yama 現在の山の状態
 * @returns 更新された山の状態 (新しいドラ表示牌が追加されている)
 */
export function revealKanDora(yama: Yama): Yama {
  if (yama.doraIndicators.length >= 5) { // ドラは最大5枚まで (表ドラ1 + 槓ドラ4)
    console.warn("Max number of dora indicators reached.");
    return yama;
  }
  if (currentKanDoraIndicatorPos >= yama.wanpai.length) {
    console.warn("Not enough tiles in wanpai for Kan Dora.");
    return yama;
  }

  const newDoraIndicator = yama.wanpai[currentKanDoraIndicatorPos];
  currentKanDoraIndicatorPos += 2; // 次のカンドラ表示牌は2つ隣

  return {
    ...yama,
    doraIndicators: [...yama.doraIndicators, newDoraIndicator],
  };
}
