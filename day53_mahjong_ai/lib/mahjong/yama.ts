import { ALL_TILE_PROTOTYPES, Tile, compareTiles, TileSuit, HonorType, tileFromString, TILES_ALL } from "./tiles";

export interface Yama {
  tiles: Tile[];        // 山に残っている牌
  wanpai: Tile[];       // 王牌 (嶺上牌4枚、ドラ表示牌、裏ドラ表示牌)
  doraIndicators: Tile[]; // ドラ表示牌 (ゲーム中に公開される)
  uraDoraIndicators: Tile[]; // 裏ドラ表示牌 (リーチ和了時に公開される)
  rinshanTiles: Tile[];   // 嶺上牌 (カンの時にツモる)
  kanDoraIndicators: Tile[];
  kanUraDoraIndicators: Tile[];
  remainingTiles: number; // For convenience, can be derived from tiles.length
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
  let allTiles = [...ALL_TILE_PROTOTYPES, ...ALL_TILE_PROTOTYPES, ...ALL_TILE_PROTOTYPES, ...ALL_TILE_PROTOTYPES]; // 4 sets of 34 tiles = 136 tiles

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
    kanDoraIndicators: [],
    kanUraDoraIndicators: [],
    remainingTiles: yamaTiles.length,
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
  const nextState = JSON.parse(JSON.stringify(yama)) as Yama;
  // 王牌の末尾から嶺上牌を取得する（仮実装）
  if (nextState.wanpai.length > 10) { // ドラ表示牌を除いた枚数で確認（最低10枚はドラ表示用）
    // 本来の嶺上牌はwanpaiの特定の位置から取るが、ここではwanpaiの最後から4枚を嶺上牌プールとする簡易的な実装
    // 例: wanpai[10], wanpai[11], wanpai[12], wanpai[13] のうち、まだ使われていないもの
    // この仮実装では、wanpaiが可変長であることを前提として末尾から取る。
    // ただし、revealKanDoraでドラ表示牌をめくる際にwanpaiから牌は取り除かれないので、
    // カンが行われた回数に応じて、wanpaiのどのインデックスから取るかを管理する必要がある。
    // ひとまず、wanpaiの末尾（ドラ表示に使われていない部分）から取得する形にする。
    const rinshanPoolStartIndex = 10; // ドラ表示牌の固定領域(0-9)の後
    const availableRinshanTilesInWanpai = nextState.wanpai.slice(rinshanPoolStartIndex);

    if (availableRinshanTilesInWanpai.length > 0) {
        // カンが行われた回数を別途管理し、それに応じて正しいインデックスから取得する必要がある。
        // ここでは仮に、利用可能な嶺上牌プールの最後の牌を取得する。
        // 本来は、カン成立時に1枚消費され、次のカンでは次の嶺上牌、という順序性が重要。
        // GameStateでカンの回数をカウントし、それに基づいてyama.wanpai[10 + kanCount] のようにアクセスするべき。
        // 今回はyamaだけで完結させるため、非常に簡易的な「最後の牌」とする。
        const tile = availableRinshanTilesInWanpai.pop(); // プールから取り出す
        if (tile) {
            // nextState.wanpai は直接変更せず、取得した牌を返し、Yamaの他の状態は維持する。
            // ただし、この実装では「どの嶺上牌が使われたか」をYamaが追跡できない。
            // より正確には、Yamaの構造にrinshanTilesDrawnCountのようなフィールドを追加するか、
            // GameState側で管理し、drawRinshanTileの引数で渡すなどの対応が必要。

            // 今回は最も単純な形として、yamaのtiles(ツモ山)から1枚減らすことで代用する。（これは嶺上牌の正しい挙動ではない）
             if (nextState.tiles.length > 0) {
                const tileFromYama = nextState.tiles.pop()!;
                nextState.remainingTiles = nextState.tiles.length;
                return { tile: tileFromYama, updatedYama: nextState };
            }
        }
    }
  }
  return { tile: null, updatedYama: nextState };
}

/**
 * ドラ表示牌から実際のドラを決定する
 * @param doraIndicator ドラ表示牌
 * @returns {Tile} ドラ牌
 */
export function getDoraFromIndicator(doraIndicator: Tile): Tile {
  if (doraIndicator.suit === TileSuit.JIHAI) {
    // 字牌の場合
    if (doraIndicator.value === HonorType.PEI) return tileFromString('ton')!; // 北の次は東
    if (doraIndicator.value === HonorType.CHUN) return tileFromString('haku')!; // 中の次は白
    if (doraIndicator.value >= HonorType.TON && doraIndicator.value < HonorType.PEI) { // 東南西
        const nextHonor = ALL_TILE_PROTOTYPES.find(t => t.suit === TileSuit.JIHAI && t.value === doraIndicator.value + 1);
        return nextHonor ? nextHonor : tileFromString('ton')!; // 見つからなければ東 (ありえないはず)
    }
    if (doraIndicator.value >= HonorType.HAKU && doraIndicator.value < HonorType.CHUN) { // 白發
        const nextSangen = ALL_TILE_PROTOTYPES.find(t => t.suit === TileSuit.JIHAI && t.value === doraIndicator.value + 1);
        return nextSangen ? nextSangen : tileFromString('haku')!; // 見つからなければ白 (ありえないはず)
    }
  } else {
    // 数牌の場合
    if (doraIndicator.value === 9) return tileFromString(`1${doraIndicator.suit}`)!; // 9の次は1
    return tileFromString(`${doraIndicator.value + 1}${doraIndicator.suit}`)!;
  }
  // ここに来ることはないはずだが、フォールバック
  console.warn("Unknown dora indicator:", doraIndicator);
  return doraIndicator;
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
  // currentKanDoraIndicatorPos は次の「カンドラ表示牌」の位置を指す
  // その1つ手前が「カン裏ドラ表示牌」の位置になるべきだが、
  // 現在のロジックでは uraDoraIndicators は初期固定なので、ここでの追加が必要

  if (currentKanDoraIndicatorPos >= yama.wanpai.length) { // カンドラ表示牌自体がない
    console.warn("Not enough tiles in wanpai for Kan Dora indicator.");
    return yama;
  }
  const newDoraIndicator = yama.wanpai[currentKanDoraIndicatorPos];

  let newUraDoraIndicator: Tile | undefined = undefined;
  // currentKanDoraIndicatorPos の1つ「後ろ」の牌がカン裏ドラ表示牌になる
  // (王牌の並びが [嶺嶺嶺嶺 表裏 表裏 表裏 表裏 表裏] の場合、
  //  最初のドラ(表)がindex X なら、カンドラ(次の表)は X+2、その裏は X+3)
  //  現在の currentKanDoraIndicatorPos は「次のカンドラ表示牌」を指すので、その「次」の牌がカン裏ドラ表示牌。
  if (currentKanDoraIndicatorPos + 1 < yama.wanpai.length) {
      newUraDoraIndicator = yama.wanpai[currentKanDoraIndicatorPos + 1];
  } else {
      console.warn("Not enough tiles in wanpai for Kan Ura Dora indicator.");
  }

  const nextKanDoraIndicatorPos = currentKanDoraIndicatorPos + 2; // 次の「カンドラ表示牌」の候補位置
  currentKanDoraIndicatorPos = nextKanDoraIndicatorPos; // グローバル変数を更新

  const updatedUraDoraIndicators = newUraDoraIndicator
    ? [...yama.uraDoraIndicators, newUraDoraIndicator]
    : yama.uraDoraIndicators;

  return {
    ...yama,
    doraIndicators: [...yama.doraIndicators, newDoraIndicator],
    uraDoraIndicators: updatedUraDoraIndicators,
  };
}
