import { Tile, HonorType } from './tiles';
import { YakuResult, HandContext } from './yaku';
import { FuCalculationResult } from './fu';
import { PlayerID } from './game_state';

export interface ScoreResult {
  han: number;
  fu: number;
  rawFu: number;
  totalScore: number;
  oyaPayment?: number;
  koPayment?: number;
  ronPlayerPayment?: number;
  yakuList: YakuResult[];
  fuDetails: FuCalculationResult["details"];
  isYakuman: boolean;
  yakumanCount: number;
  error?: string;
}

export interface ScoreOptions {
  isOya: boolean;
  isTsumo: boolean;
  honba: number;
  riichiSticks: number;
}

const YAKUMAN_BASE_SCORE_KO = 32000;
const YAKUMAN_BASE_SCORE_OYA = 48000;

export function calculateScore(
  han: number,
  fuResult: FuCalculationResult,
  options: ScoreOptions,
  yakuResults: YakuResult[],
  handContext: HandContext
): ScoreResult {
  const fu = fuResult.totalFu;
  let isYakuman = false;
  let yakumanCount = 0;

  yakuResults.forEach(yr => {
    if (yr.yaku.isYakuman) {
      isYakuman = true;
      yakumanCount += yr.yaku.han >= 26 ? 2 : 1; // 役満の翻数が26以上なら2倍役満とする (仮)
    }
  });

  let calculatedBaseScore = 0;
  let finalTotalScore = 0;
  let oyaPayment = 0;
  let koPayment = 0;
  let ronPlayerPayment = 0;

  if (isYakuman) {
    calculatedBaseScore = (options.isOya ? YAKUMAN_BASE_SCORE_OYA : YAKUMAN_BASE_SCORE_KO) * yakumanCount;
  } else {
    if (han >= 13) {
      calculatedBaseScore = options.isOya ? YAKUMAN_BASE_SCORE_OYA : YAKUMAN_BASE_SCORE_KO;
    } else if (han >= 11) {
      calculatedBaseScore = options.isOya ? 36000 : 24000;
    } else if (han >= 8) {
      calculatedBaseScore = options.isOya ? 24000 : 16000;
    } else if (han >= 6) {
      calculatedBaseScore = options.isOya ? 18000 : 12000;
    } else if (han >= 5 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) {
      calculatedBaseScore = options.isOya ? 12000 : 8000;
    } else {
      let tempBase = fu * Math.pow(2, han + 2);
      calculatedBaseScore = Math.ceil(tempBase / 100) * 100;
      if (options.isOya && calculatedBaseScore > 12000) calculatedBaseScore = 12000;
      if (!options.isOya && calculatedBaseScore > 8000) calculatedBaseScore = 8000;
      if (calculatedBaseScore < (options.isOya ? 1500: 1000) && han > 0) { // 最低点の保証 (例: 親30符1翻=1500点)
        // calculatedBaseScore = options.isOya ? 1500 : 1000; // この保証は支払い計算後に行うべきか
      }
    }
  }

  if (options.isTsumo) {
    if (options.isOya) {
      koPayment = Math.ceil(calculatedBaseScore / 100) * 100; // 二人麻雀: 親ツモは子が全額
      finalTotalScore = koPayment;
    } else {
      oyaPayment = Math.ceil(calculatedBaseScore / 100) * 100; // 二人麻雀: 子ツモは親が全額
      finalTotalScore = oyaPayment;
    }
  } else {
    ronPlayerPayment = Math.ceil(calculatedBaseScore / 100) * 100;
    finalTotalScore = ronPlayerPayment;
  }

  const honbaPoints = options.honba * 300;
  finalTotalScore += honbaPoints;
  if (options.isTsumo) {
    if (options.isOya) koPayment += honbaPoints;
    else oyaPayment += honbaPoints;
  } else {
    ronPlayerPayment += honbaPoints;
  }

  finalTotalScore += options.riichiSticks * 1000;

  return {
    han,
    fu,
    rawFu: fuResult.rawFu,
    totalScore: finalTotalScore,
    oyaPayment: options.isTsumo && !options.isOya ? oyaPayment : undefined,
    koPayment: options.isTsumo && options.isOya ? koPayment : undefined,
    ronPlayerPayment: !options.isTsumo ? ronPlayerPayment : undefined,
    yakuList: yakuResults,
    fuDetails: fuResult.details,
    isYakuman,
    yakumanCount,
  };
}

export function getScoreNameAndPayments(
  scoreResult: ScoreResult,
  isOyaAgari: boolean
): { name: string; paymentsText: string; totalPointsText: string } {
  let name = "";
  if (scoreResult.isYakuman) {
    name = `${scoreResult.yakumanCount > 1 ? `${scoreResult.yakumanCount}倍` : ""}役満`;
  } else if (scoreResult.han >= 13) {
    name = "数え役満";
  } else if (scoreResult.han >= 11) {
    name = "三倍満";
  } else if (scoreResult.han >= 8) {
    name = "倍満";
  } else if (scoreResult.han >= 6) {
    name = "跳満";
  } else if (scoreResult.han >= 5 || (scoreResult.han === 4 && scoreResult.fu >= 40) || (scoreResult.han === 3 && scoreResult.fu >= 70)) {
    name = "満貫";
  } else {
    name = `${scoreResult.han}翻${scoreResult.fu}符`;
  }

  let paymentsText = "";
  if (scoreResult.ronPlayerPayment !== undefined) {
    paymentsText = `ロン: ${scoreResult.ronPlayerPayment}点`;
  } else if (scoreResult.oyaPayment !== undefined && !isOyaAgari) { // 子ツモで親が支払う
    paymentsText = `ツモ (親支払い: ${scoreResult.oyaPayment}点)`;
  } else if (scoreResult.koPayment !== undefined && isOyaAgari) { // 親ツモで子が支払う
    paymentsText = `ツモ (子支払い: ${scoreResult.koPayment}点)`;
  }

  return {
    name: name,
    paymentsText: paymentsText,
    totalPointsText: `${name} ${scoreResult.totalScore}点`
  };
}
