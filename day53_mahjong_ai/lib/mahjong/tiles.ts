/**
 * 麻雀牌の定義と操作
 */

// 牌の種類 (Suit)
export enum TileSuit {
  MANZU = 'm', // 萬子
  SOZU = 's',  // 索子
  PINZU = 'p', // 筒子
  JIHAI = 'z', // 字牌 (風牌、三元牌)
}

// 字牌の具体的な種類 (HonorType)
export enum HonorType {
  // 風牌 (Kaze)
  TON = 1,   // 東
  NAN = 2,   // 南
  SHA = 3,   // 西
  PEI = 4,   // 北
  // 三元牌 (Sangen)
  HAKU = 5,  // 白
  HATSU = 6, // 發
  CHUN = 7,  // 中
}

// 牌のインターフェース
export interface Tile {
  suit: TileSuit;      // 種類 (m, s, p, z)
  value: number;       // 数値 (1-9) または字牌の種類 (HonorType)
  id: string;          // ユニークなID (例: '1m', '5s', 'ton', 'haku')
  name: string;        // 表示名 (例: '一萬', '五索', '東', '白')
  isRed: boolean;      // 赤ドラかどうか (今回はfalse固定)
  isTsumogiri?: boolean; // ツモ切りかどうか (捨て牌の時に使用)
}

// 数牌 (1-9)
const SUITS: TileSuit[] = [TileSuit.MANZU, TileSuit.SOZU, TileSuit.PINZU];
const NUMBERS: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// 字牌 (東南西北白發中)
const HONORS: { type: HonorType; id: string; name: string }[] = [
  { type: HonorType.TON, id: 'ton', name: '東' },
  { type: HonorType.NAN, id: 'nan', name: '南' },
  { type: HonorType.SHA, id: 'sha', name: '西' },
  { type: HonorType.PEI, id: 'pei', name: '北' },
  { type: HonorType.HAKU, id: 'haku', name: '白' },
  { type: HonorType.HATSU, id: 'hatsu', name: '發' },
  { type: HonorType.CHUN, id: 'chun', name: '中' },
];

// 全ての牌の原型 (各4枚ずつ生成する元)
export const ALL_TILE_PROTOTYPES: Tile[] = [];

// 数牌の生成
SUITS.forEach(suit => {
  NUMBERS.forEach(value => {
    ALL_TILE_PROTOTYPES.push({
      suit,
      value,
      id: `${value}${suit}`,
      name: `${value}${suit === TileSuit.MANZU ? '萬' : suit === TileSuit.SOZU ? '索' : '筒'}`,
      isRed: false, // 赤ドラは後で対応
    });
  });
});

// 字牌の生成
HONORS.forEach(honor => {
  ALL_TILE_PROTOTYPES.push({
    suit: TileSuit.JIHAI,
    value: honor.type,
    id: honor.id,
    name: honor.name,
    isRed: false,
  });
});

/**
 * 牌をソートするための比較関数 (手牌の整理などで使用)
 * 1. 種類 (萬子→索子→筒子→字牌)
 * 2. 数値 (1-9 または 東南西北白發中)
 */
export function compareTiles(a: Tile, b: Tile): number {
  const suitOrder = [TileSuit.MANZU, TileSuit.SOZU, TileSuit.PINZU, TileSuit.JIHAI];
  if (a.suit !== b.suit) {
    return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
  }
  return a.value - b.value;
}

/**
 * 文字列から牌オブジェクトを生成する (主にテスト用)
 * @param tileStr 例: "1m", "5s", "ton"
 */
export function tileFromString(tileStr: string): Tile | undefined {
  const found = ALL_TILE_PROTOTYPES.find(p => p.id === tileStr);
  if (found) {
    return { ...found }; // 新しいインスタンスを返す
  }
  // 簡易的な数牌のパース (例: "1m", "9p")
  const match = tileStr.match(/^([1-9])([msp])$/);
  if (match) {
    const value = parseInt(match[1], 10);
    const suit = match[2] as TileSuit;
    if (SUITS.includes(suit) && NUMBERS.includes(value)) {
      return ALL_TILE_PROTOTYPES.find(p => p.suit === suit && p.value === value);
    }
  }
  return undefined;
}

/**
 * 牌の配列を文字列の配列に変換 (主にテスト用)
 */
export function tilesToStrings(tiles: Tile[]): string[] {
  return tiles.map(t => t.id);
}

/**
 * 文字列の配列から牌の配列を生成 (主にテスト用)
 */
export function tilesFromStrings(tileStrings: string[]): Tile[] {
  return tileStrings.map(ts => tileFromString(ts)).filter(t => t !== undefined) as Tile[];
}

/**
 * 牌が同じかどうかを判定 (赤ドラは考慮しない)
 */
export function isSameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value;
}
