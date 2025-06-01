import { Tile, TileSuit, HonorType, isSameTile, compareTiles } from "./tiles";
import { Meld, HandPattern } from "./hand"; // hand.ts から Meld, HandPattern 型をインポート
import { PlayerID, GameState } from "./game_state"; // PlayerID, GameState をインポート

// 役の定義
export interface Yaku {
  name: string;          // 役名 (日本語)
  han: number;           // 基本の翻数 (食い下がり前の翻数)
  hanNaki: number;       // 食い下がり後の翻数 (0なら食い下がりなし、または鳴きでは成立しない)
  isYakuman?: boolean;   // 役満かどうか
}

// 役一覧 (今後追加していく)
export const ALL_YAKU: Record<string, Yaku> = {
  // 1翻役
  Riichi: { name: "立直", han: 1, hanNaki: 0 },
  Tsumo: { name: "門前清自摸和", han: 1, hanNaki: 0 }, // メンゼンツモ
  Pinfu: { name: "平和", han: 1, hanNaki: 0 },
  Tanyao: { name: "断幺九", han: 1, hanNaki: 1 }, // 食いタンあり
  Iipeikou: { name: "一盃口", han: 1, hanNaki: 0 },
  YakuhaiTonPlayer: { name: "役牌 (自風 東)", han: 1, hanNaki: 1 },
  YakuhaiNanPlayer: { name: "役牌 (自風 南)", han: 1, hanNaki: 1 },
  YakuhaiShaPlayer: { name: "役牌 (自風 西)", han: 1, hanNaki: 1 },
  YakuhaiPeiPlayer: { name: "役牌 (自風 北)", han: 1, hanNaki: 1 },
  YakuhaiTonRound: { name: "役牌 (場風 東)", han: 1, hanNaki: 1 },
  YakuhaiNanRound: { name: "役牌 (場風 南)", han: 1, hanNaki: 1 }, // 二人麻雀なので通常は東場のみだが念のため
  YakuhaiHaku: { name: "役牌 (白)", han: 1, hanNaki: 1 },
  YakuhaiHatsu: { name: "役牌 (發)", han: 1, hanNaki: 1 },
  YakuhaiChun: { name: "役牌 (中)", han: 1, hanNaki: 1 },
  RinshanKaihou: { name: "嶺上開花", han: 1, hanNaki: 1 },
  // TODO: 槍槓、海底摸月、河底撈魚など

  // 2翻役
  DoubleRiichi: { name: "ダブル立直", han: 2, hanNaki: 0 },
  Chiitoitsu: { name: "七対子", han: 2, hanNaki: 2 }, // 七対子は鳴けないが便宜上 hanNaki も2
  Toitoihou: { name: "対々和", han: 2, hanNaki: 2 },
  Sanankou: { name: "三暗刻", han: 2, hanNaki: 2 }, // 鳴いて成立する場合は2翻
  Sankantsu: { name: "三槓子", han: 2, hanNaki: 2 },
  Shousangen: { name: "小三元", han: 2, hanNaki: 2 },
  Honchantayao: { name: "混全帯幺九", han: 2, hanNaki: 1 }, // 鳴くと1翻
  Ikkitsuukan: { name: "一気通貫", han: 2, hanNaki: 1 }, // 鳴くと1翻
  SanshokuDoujun: { name: "三色同順", han: 2, hanNaki: 1 }, // 鳴くと1翻
  // TODO: 三色同刻

  // 3翻役
  Ryanpeikou: { name: "二盃口", han: 3, hanNaki: 0 },
  Honitsu: { name: "混一色", han: 3, hanNaki: 2 }, // 鳴くと2翻
  JunchanTayao: { name: "純全帯幺九", han: 3, hanNaki: 2 }, // 鳴くと2翻

  // 6翻役
  Chinitsu: { name: "清一色", han: 6, hanNaki: 5 }, // 鳴くと5翻

  // 役満
  KokushiMusou: { name: "国士無双", han: 13, hanNaki: 0, isYakuman: true }, // 国士無双 (13面待ちならダブル役満の場合もあるが、基本はシングル)
  Suuankou: { name: "四暗刻", han: 13, hanNaki: 0, isYakuman: true }, // 四暗刻 (単騎待ちならダブル役満の場合もあるが、基本はシングル)
  Daisangen: { name: "大三元", han: 13, hanNaki: 13, isYakuman: true },
  Shousuushii: { name: "小四喜", han: 13, hanNaki: 13, isYakuman: true },
  Daisuushii: { name: "大四喜", han: 26, hanNaki: 26, isYakuman: true }, // ダブル役満
  Tsuuiisou: { name: "字一色", han: 13, hanNaki: 13, isYakuman: true },
  Chinroutou: { name: "清老頭", han: 13, hanNaki: 13, isYakuman: true },
  Ryuuiisou: { name: "緑一色", han: 13, hanNaki: 13, isYakuman: true },
  ChuurenPoutou: { name: "九蓮宝燈", han: 13, hanNaki: 0, isYakuman: true }, // 純正九蓮宝燈ならダブル役満
  Suukantsu: { name: "四槓子", han: 13, hanNaki: 13, isYakuman: true },
  Tenhou: { name: "天和", han: 13, hanNaki: 0, isYakuman: true },
  Chiihou: { name: "地和", han: 13, hanNaki: 0, isYakuman: true },
};

// 手牌の解析に必要な情報
export interface HandContext {
  handTiles: Tile[];        // 手牌 (和了牌を含む14枚、または門前の場合は13枚+和了牌)
  agariTile: Tile;          // 和了牌
  melds: Meld[];            // 副露 (鳴いた面子) および手牌から構成される面子
  jantou?: Tile;           // 雀頭 (通常手の解析時に設定)
  handPattern?: HandPattern; // 手牌の形 (通常手、七対子、国士無双)
  isTsumo: boolean;         // ツモ和了かどうか
  isRiichi: boolean;        // リーチしているかどうか
  isDoubleRiichi?: boolean; // ダブルリーチかどうか (オプション)
  playerWind: HonorType;    // 自風 (東:1, 南:2, 西:3, 北:4)
  roundWind: HonorType;     // 場風
  doraTiles: Tile[];        // ドラ牌 (表示牌ではない)
  uraDoraTiles?: Tile[];    // 裏ドラ牌 (リーチ時のみ)
  turnCount: number;        // 巡目
  isMenzen?: boolean;      // 門前かどうか (checkYaku内部で判定されるが、hand.tsから渡すように変更)
  isRinshan?: boolean;     // 嶺上開花かどうか
  // TODO: 一発、海底/河底、槍槓、嶺上開花などの状況フラグ
}

// 判定結果
export interface YakuResult {
  yaku: Yaku;
  han: number; // 実際に適用される翻数
}

/**
 * 手牌と状況から成立する役を全て判定する
 * @param context 手牌と状況の情報
 * @returns {YakuResult[]} 成立した役のリスト
 */
export function checkYaku(context: HandContext): YakuResult[] {
  const results: YakuResult[] = [];
  const isMenzen = context.melds.every(m => !m.isOpen);
  let hanForDora = 0;

  // ドラ、赤ドラ、裏ドラの計算
  const allTilesInHandAndMelds = [...context.handTiles, ...context.melds.flatMap(m => m.tiles)];
  context.doraTiles.forEach(dora => {
    hanForDora += allTilesInHandAndMelds.filter(t => isSameTile(t, dora) && !t.isRedDora).length;
  });
  if (context.isRiichi && context.uraDoraTiles) {
    context.uraDoraTiles.forEach(uraDora => {
      hanForDora += allTilesInHandAndMelds.filter(t => isSameTile(t, uraDora) && !t.isRedDora).length;
    });
  }
  // 赤ドラのカウント (isRedDora フラグを持つ牌)
  hanForDora += allTilesInHandAndMelds.filter(t => t.isRedDora).length;

  if (hanForDora > 0) {
    results.push({ yaku: { name: `ドラ ${hanForDora}`, han: hanForDora, hanNaki: hanForDora }, han: hanForDora });
  }

  // 特殊役の判定 (国士無双、七対子)
  if (context.handPattern === HandPattern.KOKUSHI) {
    results.push({ yaku: ALL_YAKU.KokushiMusou, han: ALL_YAKU.KokushiMusou.han });
    // 国士の場合は他の役は複合しない（ドラは別で加算）
  } else if (context.handPattern === HandPattern.CHIITOITSU) {
    results.push({ yaku: ALL_YAKU.Chiitoitsu, han: ALL_YAKU.Chiitoitsu.han });
    // 七対子の場合も他の一般役とは複合しない（ドラは別）
  } else {
    // 通常手の場合のみ、以下の一般役を判定
    // 立直
    if (context.isRiichi) {
      results.push({ yaku: ALL_YAKU.Riichi, han: ALL_YAKU.Riichi.han });
      if (context.isDoubleRiichi) {
        results.push({ yaku: ALL_YAKU.DoubleRiichi, han: ALL_YAKU.DoubleRiichi.han });
      }
    }

    // 門前清自摸和 (メンゼンツモ)
    if (isMenzen && context.isTsumo) {
      results.push({ yaku: ALL_YAKU.Tsumo, han: ALL_YAKU.Tsumo.han });
    }

    // 嶺上開花
    if (context.isRinshan && context.isTsumo) { // カンによるツモ和了
      results.push({ yaku: ALL_YAKU.RinshanKaihou, han: ALL_YAKU.RinshanKaihou.han });
    }

    // 断幺九 (タンヤオ)
    const allTilesForTanyao = [...context.handTiles, ...context.melds.flatMap(m => m.tiles)];
    const isTanyao = allTilesForTanyao.every(t =>
      t.suit !== TileSuit.JIHAI && t.value >=2 && t.value <=8
    );
    if (isTanyao) {
      results.push({
        yaku: ALL_YAKU.Tanyao,
        han: isMenzen ? ALL_YAKU.Tanyao.han : ALL_YAKU.Tanyao.hanNaki
      });
    }

    // 役牌
    const koutsuTiles: Tile[] = [];
    if (context.jantou && context.jantou.suit === TileSuit.JIHAI) {
        // 雀頭が役牌の場合は、役牌判定では考慮しない (符計算で考慮)
        // ここでは面子になっている役牌のみを見る
    }
    context.melds.forEach(m => {
        if (m.type === 'koutsu' || m.type === 'kantsu') {
            if (m.tiles[0].suit === TileSuit.JIHAI) koutsuTiles.push(m.tiles[0]);
        }
    });
    // 手牌中の暗刻の役牌 (context.melds には手牌からの暗刻も含まれる想定だが、重複しないように)
    // findKoutsu は hand.ts にある。ここでは context.melds に手牌の面子も入っている前提で進める。
    // → hand.ts の extractMeldsAndJantou で isOpen: false で面子を作っているので、それで判定可能。

    const uniqueKoutsuTileIds = new Set<string>();
    koutsuTiles.forEach(k => uniqueKoutsuTileIds.add(k.id));

    const playerWindTileId = windToTileId(context.playerWind);
    if (uniqueKoutsuTileIds.has(playerWindTileId)) {
      const yakuKey = context.playerWind === HonorType.TON ? "YakuhaiTonPlayer" :
                      context.playerWind === HonorType.NAN ? "YakuhaiNanPlayer" :
                      context.playerWind === HonorType.SHA ? "YakuhaiShaPlayer" :
                      "YakuhaiPeiPlayer";
      if (ALL_YAKU[yakuKey]) {
        results.push({ yaku: ALL_YAKU[yakuKey], han: ALL_YAKU[yakuKey].han });
      }
    }
    const roundWindTileId = windToTileId(context.roundWind);
    // 自風と場風が同じ場合は既に加算されているので、重複カウントしない
    if (uniqueKoutsuTileIds.has(roundWindTileId) && playerWindTileId !== roundWindTileId) {
      const yakuKey = context.roundWind === HonorType.TON ? "YakuhaiTonRound" :
                      "YakuhaiNanRound"; // 二人麻雀では基本的に場風は東のみだが、定義に合わせておく
      if (ALL_YAKU[yakuKey]) {
        results.push({ yaku: ALL_YAKU[yakuKey], han: ALL_YAKU[yakuKey].han });
      }
    }
    if (uniqueKoutsuTileIds.has("haku")) results.push({ yaku: ALL_YAKU.YakuhaiHaku, han: ALL_YAKU.YakuhaiHaku.han });
    if (uniqueKoutsuTileIds.has("hatsu")) results.push({ yaku: ALL_YAKU.YakuhaiHatsu, han: ALL_YAKU.YakuhaiHatsu.han });
    if (uniqueKoutsuTileIds.has("chun")) results.push({ yaku: ALL_YAKU.YakuhaiChun, han: ALL_YAKU.YakuhaiChun.han });

    // TODO: 平和、一盃口などの判定 (context.melds と context.jantou を使う)
    if (isMenzen) { // 門前限定の役
      // 平和 (Pinfu)
      let isPinfu = true;
      // 1. 4面子が全て順子
      if (context.melds.length !== 4 || !context.melds.every(m => m.type === 'shuntsu')) {
        isPinfu = false;
      }
      // 2. 雀頭が役牌でない
      if (context.jantou) {
        const jantou = context.jantou;
        if (jantou.suit === TileSuit.JIHAI) {
          if (jantou.value === HonorType.HAKU || jantou.value === HonorType.HATSU || jantou.value === HonorType.CHUN) {
            isPinfu = false; // 三元牌
          }
          if (jantou.value === context.roundWind || jantou.value === context.playerWind) {
            isPinfu = false; // 場風または自風
          }
        }
      } else { // 雀頭がないのはありえないが念のため
        isPinfu = false;
      }
      // 3. 両面待ち (判定が複雑なので、ここではアガリ牌が順子の一部で、かつ端牌でないことを簡易的にチェック)
      // isBasicAgari の時点で面子と雀頭は確定しているので、アガリ牌がどの順子を完成させたか、その待ちが両面だったかを見る
      // context.agariTile が context.melds のいずれかの順子に数字として含まれ、かつその順子が両面待ちを形成しうるか
      // 例: [2,3,アガリ牌(4)]m で 1-4待ち、[アガリ牌(3),4,5]m で 3-6待ちなど
      // 非常に簡略化: アガリ牌が数牌で、1でも9でもなく、かつそれが順子の一部であること。
      // かつ、その順子を構成する他の2枚との関係で両面待ちになっていたことを確認する必要がある。
      // これは extractMeldsAndJantou や analyzeHandShanten 側で待ちの形を判定して HandContext に含める必要があるかもしれない。
      // 今回は「4面子順子」「非役牌雀頭」のみでピンフとしてしまう。(待ちの判定は複雑なため一旦省略)
      // TODO: 正確な両面待ち判定
      let isRyanmenMachi = false;
      if (context.agariTile.suit !== TileSuit.JIHAI && context.agariTile.value !== 1 && context.agariTile.value !== 9) {
        // アガリ牌が melds の shuntsu の一部であるか確認
        for (const meld of context.melds) {
          if (meld.type === 'shuntsu' && meld.tiles.some(t => isSameTile(t, context.agariTile))) {
            // さらに、この順子が両面待ちを形成しうるか？
            // 例: アガリ牌が4mで、面子が[2m,3m,4m]ならOK、[4m,5m,6m]ならOK
            // 簡略化のため、アガリ牌が真ん中(ペンチャン)や端(カンチャン)でないことを期待
            const tileValues = meld.tiles.map(t => t.value).sort((a,b) => a-b);
            if ( (isSameTile(meld.tiles[0], context.agariTile) && tileValues[1] === tileValues[0] + 1 && tileValues[2] === tileValues[1] + 1 && context.agariTile.value <=7 ) || // x, x+1, x+2 (xがアガリ)
                 (isSameTile(meld.tiles[2], context.agariTile) && tileValues[1] === tileValues[2] - 1 && tileValues[0] === tileValues[1] - 1 && context.agariTile.value >=3 )    // x-2, x-1, x (xがアガリ)
            ) {
                 isRyanmenMachi = true;
                 break;
            }
          }
        }
      }
      if (!isRyanmenMachi) isPinfu = false; // 両面待ちでない場合はピンフではない

      if (isPinfu) {
        results.push({ yaku: ALL_YAKU.Pinfu, han: ALL_YAKU.Pinfu.han });
      }

      // 一盃口 (Iipeikou)
      let iipeikouCount = 0;
      const shuntsuCounts: Record<string, number> = {};
      const closedShuntsu = context.melds.filter(m => m.type === 'shuntsu' && !m.isOpen);
      if (closedShuntsu.length >= 2) {
        for (const shuntsu of closedShuntsu) {
          const shuntsuId = shuntsu.tiles.map(t => t.id).sort().join(',');
          shuntsuCounts[shuntsuId] = (shuntsuCounts[shuntsuId] || 0) + 1;
          if (shuntsuCounts[shuntsuId] === 2) {
            iipeikouCount++; // 2つ揃えば1つの一盃口
            // 二盃口も考慮するなら、ここで shuntsuCounts[shuntsuId] = 0; (使ったものとして) とするか、別途カウント
          }
        }
      }
      if (iipeikouCount === 1) { // 1つだけなら一盃口
        results.push({ yaku: ALL_YAKU.Iipeikou, han: ALL_YAKU.Iipeikou.han });
      }
      // TODO: 二盃口 (Ryanpeikou) の判定 (iipeikouCount === 2 の場合)
    }

    // 三色同順 (Sanshoku Doujun)
    const shuntsuBySuitAndStart: { [suit: string]: Set<number> } = { m: new Set(), p: new Set(), s: new Set() };
    context.melds.forEach(meld => {
      if (meld.type === 'shuntsu' && meld.tiles[0].suit !== TileSuit.JIHAI) {
        const suit = meld.tiles[0].suit as string;
        const startValue = meld.tiles[0].value;
        shuntsuBySuitAndStart[suit].add(startValue);
      }
    });
    for (let i = 1; i <= 7; i++) { // 123 から 789 まで
      if (shuntsuBySuitAndStart.m.has(i) && shuntsuBySuitAndStart.p.has(i) && shuntsuBySuitAndStart.s.has(i)) {
        results.push({
          yaku: ALL_YAKU.SanshokuDoujun,
          han: isMenzen ? ALL_YAKU.SanshokuDoujun.han : ALL_YAKU.SanshokuDoujun.hanNaki
        });
        break; // 三色同順は1つ成立すればOK
      }
    }

    // 一気通貫 (Ikkitsuukan)
    const shuntsuBySuit: { [suit: string]: { s123: boolean, s456: boolean, s789: boolean } } = {
      m: { s123: false, s456: false, s789: false },
      p: { s123: false, s456: false, s789: false },
      s: { s123: false, s456: false, s789: false },
    };
    context.melds.forEach(meld => {
      if (meld.type === 'shuntsu' && meld.tiles[0].suit !== TileSuit.JIHAI) {
        const suit = meld.tiles[0].suit as string;
        const startValue = meld.tiles[0].value;
        if (startValue === 1) shuntsuBySuit[suit].s123 = true;
        else if (startValue === 4) shuntsuBySuit[suit].s456 = true;
        else if (startValue === 7) shuntsuBySuit[suit].s789 = true;
      }
    });
    for (const suit of ['m', 'p', 's']) {
      if (shuntsuBySuit[suit].s123 && shuntsuBySuit[suit].s456 && shuntsuBySuit[suit].s789) {
        results.push({
          yaku: ALL_YAKU.Ikkitsuukan,
          han: isMenzen ? ALL_YAKU.Ikkitsuukan.han : ALL_YAKU.Ikkitsuukan.hanNaki
        });
        break; // 一気通貫は1つ成立すればOK (複数スーツではありえない)
      }
    }
  }

  // 役がない場合はエラーまたは和了不可とする (最低1翻必要。ただしドラのみはNG)
  const hasNonDoraYaku = results.some(r => !r.yaku.name.startsWith("ドラ"));
  if (results.length === 0 || (!hasNonDoraYaku && results.every(r => r.yaku.name.startsWith("ドラ")))) {
      return [];
  }

  return results;
}

// ヘルパー関数: 刻子を見つける (手牌と副露から)
function findKoutsu(hand: Tile[], melds: Meld[]): Tile[] {
  const koutsu: Tile[] = [];
  // 副露からの刻子・槓子
  melds.forEach(m => {
    if (m.type === "koutsu" || m.type === "kantsu") {
      koutsu.push(m.tiles[0]); // 代表牌
    }
  });
  // 手牌からの暗刻 (槓子は別途判定が必要な場合あり)
  const counts = tileCounts(hand);
  for (const tileId in counts) {
    if (counts[tileId] >= 3) {
      const tileProto = hand.find(t => t.id === tileId);
      if (tileProto) koutsu.push(tileProto);
    }
  }
  return koutsu;
}

// ヘルパー関数: 牌の枚数をカウント
function tileCounts(tiles: Tile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tile of tiles) {
    counts[tile.id] = (counts[tile.id] || 0) + 1;
  }
  return counts;
}

// ヘルパー関数: 風牌のHonorTypeからTile IDへ変換
function windToTileId(wind: HonorType): string {
    switch(wind) {
        case HonorType.TON: return "ton";
        case HonorType.NAN: return "nan";
        case HonorType.SHA: return "sha";
        case HonorType.PEI: return "pei";
        default: return ""; // ありえない
    }
}

// ヘルパー関数: 文字列の最初の文字を大文字に
function capitalizeFirstLetter(string: string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// TODO: さらに多くの役判定ロジックをここに追加していく
