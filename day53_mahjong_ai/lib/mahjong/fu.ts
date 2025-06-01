import { Tile, TileSuit, HonorType, isYaochuuhai } from './tiles';
import { Meld, HandPattern, MachiPattern } from './hand';
import { HandContext, YakuResult } from './yaku';

export interface FuDetail {
  name: string;
  fu: number;
}

export interface FuCalculationResult {
  totalFu: number; // 切り上げ後の最終的な符
  rawFu: number; // 切り上げ前の符
  details: FuDetail[];
  isPinfuStyleAgari?: boolean; // 平和形での和了か（平和役がつかなくても、符計算上平和扱いになるケース用）
}

/**
 * 和了形に基づいて符を計算する
 * @param handContext 手牌と状況の情報
 * @param yakuResults 成立した役のリスト (平和や七対子の判定に使う)
 * @returns {FuCalculationResult} 計算された符情報
 */
export function calculateFu(
  handContext: HandContext,
  yakuResults: YakuResult[]
): FuCalculationResult {
  const details: FuDetail[] = [];
  let rawFu = 20; // 副底 (基本符)
  details.push({ name: '副底', fu: 20 });

  const isMenzen = handContext.melds.every(m => !m.isOpen);
  const hasPinfuYaku = yakuResults.some(yr => yr.yaku.name === '平和');
  const hasChiitoitsuYaku = yakuResults.some(yr => yr.yaku.name === '七対子');

  // 例外処理: 七対子
  if (hasChiitoitsuYaku) {
    details.push({ name: '七対子固定', fu: 5 }); // 副底20 + 七対子5 = 25
    return {
      totalFu: 25,
      rawFu: 25,
      details: [{ name: '七対子', fu: 25 }],
    };
  }

  // 和了方による符
  if (isMenzen && !handContext.isTsumo) {
    rawFu += 10;
    details.push({ name: '門前ロン', fu: 10 });
  } else if (handContext.isTsumo && !hasPinfuYaku) { // 平和ツモは符なし
    rawFu += 2;
    details.push({ name: 'ツモ和了', fu: 2 });
  }

  // 面子による符
  (handContext.melds || []).forEach(meld => {
    let meldFu = 0;
    const isYaochuMeld = isYaochuuhai(meld.tiles[0]);
    if (meld.type === 'shuntsu') {
      // 順子は符なし
    } else if (meld.type === 'koutsu') {
      meldFu = isYaochuMeld ? (meld.isOpen ? 4 : 8) : (meld.isOpen ? 2 : 4);
      meldFu *= 2; // 刻子は基礎符の2倍
      details.push({ name: `${meld.isOpen ? '明刻' : '暗刻'}(${meld.tiles[0].name})`, fu: meldFu });
    } else if (meld.type === 'kantsu') {
      meldFu = isYaochuMeld ? (meld.isOpen ? 16 : 32) : (meld.isOpen ? 8 : 16);
      meldFu *= 2; // 槓子は基礎符の4倍だが、刻子の2倍として計算 (刻子基礎符 * 4)
      details.push({ name: `${meld.isOpen ? '明槓' : '暗槓'}(${meld.tiles[0].name})`, fu: meldFu });
    }
    rawFu += meldFu;
  });

  // 雀頭による符
  if (handContext.jantou) {
    const jantou = handContext.jantou;
    let jantouFu = 0;
    if (jantou.suit === TileSuit.JIHAI) {
      if (
        jantou.value === HonorType.HAKU ||
        jantou.value === HonorType.HATSU ||
        jantou.value === HonorType.CHUN
      ) {
        jantouFu = 2;
        details.push({ name: `役牌雀頭(${jantou.name})`, fu: 2 });
      }
      if (jantou.value === handContext.roundWind) {
        jantouFu += 2;
        details.push({ name: `場風雀頭(${jantou.name})`, fu: jantouFu > 2 && jantou.value === handContext.playerWind ? 0 : 2 }); // ダブりの場合は2符追加だが、詳細は要確認
      }
      // 自風と場風が同じ場合(連風牌)は、場風で既にカウントされていれば追加しない、または4符とする
      if (jantou.value === handContext.playerWind && jantou.value !== handContext.roundWind) {
        jantouFu += 2;
        details.push({ name: `自風雀頭(${jantou.name})`, fu: 2 });
      }
      // 連風牌の場合 (場風と自風が同じ役牌)
      if (jantou.value === handContext.playerWind && jantou.value === handContext.roundWind && jantouFu < 4) {
        //既に場風で2符加算されている場合、さらに2符追加で合計4符、または単に4符とする
        //ここでは既に場風で2符、自風で2符と別々に加算されることを期待。もし重複加算なら調整
      }
    }
    rawFu += jantouFu;
  }

  // 待ちの形による符 (平和形でない場合)
  if (!hasPinfuYaku && handContext.machiPattern) {
    if (handContext.machiPattern === MachiPattern.KANCHAN ||
        handContext.machiPattern === MachiPattern.PENCHAN ||
        handContext.machiPattern === MachiPattern.TANKI) {
      rawFu += 2;
      details.push({ name: `待ちの形(${handContext.machiPattern})`, fu: 2 });
    }
  }

  // 平和形の特例 (平和役がなくても、符が平和形になる場合がある。例：鳴いた平和形は符計算)
  // ただし、今回の平和判定は門前のみなので、hasPinfuYakuで十分。
  // もし「食い平和」を符計算上平和扱いにするなら、isPinfuStyleAgari を別途判定する必要がある。

  // 合計符の切り上げ (平和ツモ以外)
  let totalFu = rawFu;
  if (hasPinfuYaku && handContext.isTsumo) {
    totalFu = 20; // 平和ツモは20符固定
    if (rawFu !== 20) { // 副底以外の符が加算されていたら調整
        details.push({name: "平和ツモのため20符固定", fu: 20 - rawFu});
    }
  } else if (hasPinfuYaku && !handContext.isTsumo) {
    totalFu = 30; // 平和ロンは30符固定
    if (rawFu !== 30 && isMenzen) { // 副底+門前ロン以外の符が加算されていたら調整
       details.push({name: "平和ロンのため30符固定", fu: 30 - rawFu});
    }
  } else {
    if (rawFu === 0) rawFu = 20; // ありえないが念のため副底保証
    totalFu = Math.ceil(rawFu / 10) * 10;
    if (totalFu === 0 && rawFu > 0) totalFu = 30; // 25符未満は30符 (七対子除く)
    if (totalFu < 30 && !hasPinfuYaku) totalFu = 30; // 一般的な最低符は30符 (20符になるのは平和ツモのみ)
    if (rawFu > 0 && totalFu < rawFu) totalFu = Math.ceil(rawFu / 10) * 10; // 切り上げミス防止
    if (totalFu < 20) totalFu = 20; // 最低20符は保証
  }
   // 特例: 符が20しかない場合、30符に切り上げる (平和ツモを除く)
  if (totalFu === 20 && !(hasPinfuYaku && handContext.isTsumo) && !hasChiitoitsuYaku) {
    totalFu = 30;
  }


  return {
    totalFu,
    rawFu,
    details,
    isPinfuStyleAgari: hasPinfuYaku
  };
}
