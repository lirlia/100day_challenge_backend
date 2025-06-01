import { YakuResult, ALL_YAKU } from "./yaku";
import { Tile, HonorType, TileSuit } from "./tiles";
import { Meld } from "./hand";
import { PlayerID } from "./game_state";

// 点数計算のオプション (例: 切り上げ満貫など)
export interface ScoreOptions {
  kiriageMangan?: boolean; // 30符4翻、60符3翻を考慮 (今回は単純化のためtrue固定にするかも)
  kazoeYakuman?: boolean;  // 数え役満を認めるか (13翻以上)
}

// 点数計算結果
export interface ScoreResult {
  han: number;            // 合計翻数
  fu: number;             // 合計符 (今回は概算)
  basePoints: number;     // 基本点 (子のロン和了時の点数)
  ronPointsPlayer: number; // 親のロン和了点数
  ronPointsCPU: number;    // 子のロン和了点数
  tsumoPointsPlayerOya: number; // 親のツモ和了時の子1人あたりの支払い
  tsumoPointsPlayerKo: number;  // 子のツモ和了時の親の支払い
  tsumoPointsCPUOya: number;   // 親のツモ和了時の子1人あたりの支払い (CPUが親の場合)
  tsumoPointsCPUKo: number;    // 子のツモ和了時の親の支払い (CPUが子の場合)
  displayedPoint: number; // 和了者が実際に受け取る/支払う点数
  yakuList: YakuResult[]; // 成立した役のリスト
  error?: string;         // エラーメッセージ (役なしなど)
}

// 符計算の構成要素 (簡易版)
const FU_BASE_AGARI = 20;       // 和了り符 (副底)
const FU_MENZEN_RON = 10;       // 門前ロン加符
const FU_TSUMO = 2;             // ツモ符 (ピンフツモは通常0だが、ここでは簡略化)
// TODO: 面子による符、待ちによる符、雀頭による符などを追加
const FU_KOUTSU_CHUNCHAN_OPEN = 2;
const FU_KOUTSU_CHUNCHAN_CLOSED = 4;
const FU_KOUTSU_YAOCHUU_OPEN = 4;
const FU_KOUTSU_YAOCHUU_CLOSED = 8;
const FU_KANTSU_CHUNCHAN_OPEN = 8;
const FU_KANTSU_CHUNCHAN_CLOSED = 16;
const FU_KANTSU_YAOCHUU_OPEN = 16;
const FU_KANTSU_YAOCHUU_CLOSED = 32;

// 翻数と符から基本点を計算する表 (子のロン和了)
// 実際にはもっと複雑だが、ここでは代表的なケースを簡略化して示す
// キー: `${han}h${fu}f` (例: "1h30f")
const scoreTable: Record<string, number> = {
  // 1翻
  "1h30f": 1000, "1h40f": 1300, "1h50f": 1600, "1h60f": 2000, "1h70f": 2300, /* ... */
  // 2翻
  "2h25f": 1600, // 七対子は25符2翻固定 (実際はロンなら支払い2500, ツモなら親1300all, 子700/1300)
  "2h30f": 2000, "2h40f": 2600, "2h50f": 3200, "2h60f": 3900, /* ... */
  // 3翻
  "3h30f": 3900, "3h40f": 5200, "3h50f": 6400, "3h60f": 7700, // 60符3翻は切り上げ満貫考慮で8000
  // 4翻
  "4h30f": 7700, "4h40f": 8000, // 30符4翻は切り上げ満貫考慮で8000, 40符4翻以上は満貫
  // 満貫 (5翻)
  "5h": 8000,
  // 跳満 (6-7翻)
  "6h": 12000, "7h": 12000,
  // 倍満 (8-10翻)
  "8h": 16000, "9h": 16000, "10h": 16000,
  // 三倍満 (11-12翻)
  "11h": 24000, "12h": 24000,
  // 役満 (13翻以上)
  "13h": 32000, // シングル役満
  "26h": 64000, // ダブル役満
  // TODO: トリプル役満など
};

function ceilToNearest100(points: number): number {
    return Math.ceil(points / 100) * 100;
}

/**
 * 和了形と役リストから点数を計算する
 * @param yakuResults 成立した役のリスト
 * @param isOya 親かどうか
 * @param isTsumo ツモ和了かどうか
 * @param options 点数計算オプション
 * @returns {ScoreResult} 計算された点数情報
 */
export function calculateScore(
  yakuResults: YakuResult[],
  isOya: boolean,
  isTsumo: boolean,
  options: ScoreOptions = { kiriageMangan: true, kazoeYakuman: true },
  fuContext?: {
    handTiles: Tile[],
    agariTile: Tile,
    melds: Meld[],
    jantou?: Tile,
    playerWind: HonorType,
    roundWind: HonorType,
    isMenzen: boolean
  }
): ScoreResult {
  if (yakuResults.length === 0 || yakuResults.every(yr => yr.yaku.name.startsWith("ドラ"))) {
    return { han: 0, fu: 0, basePoints: 0, ronPointsPlayer: 0, ronPointsCPU: 0, tsumoPointsPlayerOya: 0, tsumoPointsPlayerKo: 0, tsumoPointsCPUOya: 0, tsumoPointsCPUKo: 0, displayedPoint: 0, yakuList: [], error: "役がありません" };
  }

  let totalHan = 0;
  let isYakuman = false;
  let yakumanMultiplier = 0;

  yakuResults.forEach(yr => {
    if (yr.yaku.isYakuman) {
      isYakuman = true;
      // 役満の複合を考慮 (例: 大四喜はダブル役満なのでhanが26)
      yakumanMultiplier += yr.yaku.han / 13; // 13翻を1役満単位とする
    }
    if (!isYakuman) { // 役満が成立している場合、他の役の翻は加算しない (ドラは除く場合があるが今回は加算しない)
      totalHan += yr.han;
    }
  });

  if (isYakuman) {
    totalHan = 13 * yakumanMultiplier; // 役満の場合、翻数を13の倍数に固定
  }

  // 数え役満
  if (options.kazoeYakuman && totalHan >= 13 && !isYakuman) {
    isYakuman = true;
    yakumanMultiplier = Math.floor(totalHan / 13); // 13翻以上ならその倍率の役満とする
    totalHan = 13 * yakumanMultiplier;
  }

  let fu = FU_BASE_AGARI;
  if (fuContext) {
      if (fuContext.isMenzen && !isTsumo) fu += FU_MENZEN_RON; // 門前ロン
      if (isTsumo) fu += FU_TSUMO; // ツモ符 (ピンフツモは0だがここでは簡略化)
      // TODO: 面子、雀頭、待ちの符計算を実装

      // 面子による符 (刻子・槓子)
      if (fuContext.melds) {
        for (const meld of fuContext.melds) {
          const isYaochuu = meld.tiles[0].suit === TileSuit.JIHAI || meld.tiles[0].value === 1 || meld.tiles[0].value === 9;
          if (meld.type === 'koutsu') {
            if (meld.isOpen) {
              fu += isYaochuu ? FU_KOUTSU_YAOCHUU_OPEN : FU_KOUTSU_CHUNCHAN_OPEN;
            } else {
              fu += isYaochuu ? FU_KOUTSU_YAOCHUU_CLOSED : FU_KOUTSU_CHUNCHAN_CLOSED;
            }
          } else if (meld.type === 'kantsu') {
            // TODO: 槓子の符計算を実装 (明槓・暗槓・加槓で異なる場合もあるが、ここでは集約)
            if (meld.isOpen) { // ここでの isOpen は鳴いた槓子かどうかの大まかな区別
              fu += isYaochuu ? FU_KANTSU_YAOCHUU_OPEN : FU_KANTSU_CHUNCHAN_OPEN;
            } else { // 暗槓
              fu += isYaochuu ? FU_KANTSU_YAOCHUU_CLOSED : FU_KANTSU_CHUNCHAN_CLOSED;
            }
          }
        }
      }
      // TODO: 雀頭による符 (役牌の対子など)
      // TODO: 待ちによる符 (ペンチャン・カンチャン・単騎待ちなど)

      // 七対子は25符固定
      if (yakuResults.some(yr => yr.yaku.name === "七対子")) {
          fu = 25;
      }
      fu = Math.ceil(fu / 10) * 10; // 10の倍数に切り上げ
      if (fu < 30 && !yakuResults.some(yr => yr.yaku.name === "七対子")) fu = 30; // 食い平和形などで20符になる場合を除き、最低30符
  } else {
      // fuContextがない場合は仮で30符とする（七対子以外）
      fu = yakuResults.some(yr => yr.yaku.name === "七対子") ? 25 : 30;
  }

  if (isYakuman) fu = 0; // 役満は符計算不要

  let basePoints = 0;

  if (isYakuman) {
    basePoints = scoreTable[`${totalHan}h`] || 0;
  } else if (totalHan >= 5) { // 満貫以上
    if (totalHan <= 5) basePoints = scoreTable["5h"];        // 満貫
    else if (totalHan <= 7) basePoints = scoreTable["7h"];   // 跳満 (6-7翻)
    else if (totalHan <= 10) basePoints = scoreTable["10h"]; // 倍満 (8-10翻)
    else if (totalHan <= 12) basePoints = scoreTable["12h"]; // 三倍満 (11-12翻)
    else basePoints = 0; // 数え役満は上で処理済み
  } else {
    // 4翻以下
    const key = `${totalHan}h${fu}f`;
    basePoints = scoreTable[key] || 0;
    // 切り上げ満貫の考慮 (3翻60符、4翻30符)
    if (options.kiriageMangan) {
        if ((totalHan === 3 && fu >= 60) || (totalHan === 4 && fu >= 30)) {
            basePoints = Math.max(basePoints, scoreTable["5h"]); // 満貫の点数にする
        }
    }
  }

  if (basePoints === 0 && totalHan > 0) {
      // スコアテーブルにない組み合わせの場合 (簡易的なフォールバック)
      // 非常に大雑把な計算: 基本点 = fu * 2^(2+han)
      // console.warn(`Score table missing for ${totalHan}h${fu}f. Using approximate calculation.`);
      // basePoints = fu * Math.pow(2, 2 + totalHan);
      // basePoints = ceilToNearest100(basePoints); // 100点未満切り上げ
      // 満貫キャップなども考慮すると複雑なので、ここではテーブルにないものはエラー扱いでも良い
      return { han: totalHan, fu, basePoints: 0, ronPointsPlayer: 0, ronPointsCPU: 0, tsumoPointsPlayerOya: 0, tsumoPointsPlayerKo: 0, tsumoPointsCPUOya: 0, tsumoPointsCPUKo: 0, displayedPoint: 0, yakuList: yakuResults, error: "点数表にない組み合わせです" };
  }

  let ronPointsPlayer = 0;
  let ronPointsCPU = 0;
  let tsumoPointsPlayerOya = 0; // 親ツモ時の子の支払 (x1)
  let tsumoPointsPlayerKo = 0;  // 子ツモ時の親の支払 (x1)
  let tsumoPointsCPUOya = 0;   // 親ツモ時の子の支払 (CPUが親)
  let tsumoPointsCPUKo = 0;    // 子ツモ時の親の支払い (CPUが子)

  // basePoints は子のロン和了時の点数 (満貫なら8000)
  const oyaRonPoint = ceilToNearest100(basePoints * 1.5); // 親のロン和了時の点数 (満貫なら12000)
  const koRonPoint = basePoints; // 子のロン和了時の点数 (満貫なら8000)

  // 二人麻雀の点数計算
  // 親のツモ和了: 相手(子)が基本点x2を支払う (例:親満貫ツモなら子は8000x1=8000点支払い)
  // ※ 通常の四人麻雀だと親満ツモは4000オールだが、二人麻雀では相手が全額負担。
  //   basePointsは子のロン基準なので、親ツモは basePoints x 1 で計算 (例: 満貫8000)
  const oyaTsumoTotal = koRonPoint;

  // 子のツモ和了: 相手(親)が基本点x2を支払う (例:子満貫ツモなら親は8000x1=8000点支払い)
  // ※ 通常の四人麻雀だと子満ツモは親4000,子2000だが、二人麻雀では相手が全額負担。
  //   basePointsは子のロン基準なので、子ツモは basePoints x 1 で計算 (例: 満貫8000)
  const koTsumoTotal = koRonPoint;

  let finalDisplayedPoint = 0;

  if (isOya) {
    if (isTsumo) { // 親のツモ
      tsumoPointsPlayerOya = oyaTsumoTotal;
      // tsumoPointsCPUOya = oyaTsumoKoPay; // 2人麻雀ではCPUは常に子（のはずだが、isOyaで判定しているのでこれで良い）
      finalDisplayedPoint = oyaTsumoTotal;
    } else { // 親のロン
      ronPointsPlayer = oyaRonPoint;
      finalDisplayedPoint = oyaRonPoint;
    }
  } else { // 子の場合
    if (isTsumo) { // 子のツモ
      tsumoPointsPlayerKo = koTsumoTotal; // 親からの支払い
      // tsumoPointsCPUKo = koTsumoCpuPay; // CPUがツモった場合の親の支払い
      finalDisplayedPoint = koTsumoTotal;
    } else { // 子のロン
      ronPointsCPU = koRonPoint;
      finalDisplayedPoint = koRonPoint;
    }
  }

  return {
    han: totalHan,
    fu,
    basePoints,
    ronPointsPlayer,
    ronPointsCPU,
    tsumoPointsPlayerOya,
    tsumoPointsPlayerKo,
    tsumoPointsCPUOya: isOya && isTsumo ? oyaTsumoTotal : 0, // CPUが親でツモった場合の支払い (相手は子)
    tsumoPointsCPUKo: !isOya && isTsumo ? koTsumoTotal : 0,   // CPUが子でツモった場合の支払い (相手は親)
    displayedPoint: finalDisplayedPoint,
    yakuList: yakuResults,
  };
}

// TODO: 符計算の詳細実装 (面子、雀頭、待ちなど)
// function calculateFuDetails(hand: Tile[], agariTile: Tile, melds: Meld[], playerWind: HonorType, roundWind: HonorType, isMenzen: boolean, isTsumo: boolean): number
