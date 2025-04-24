import { ApplicationStatus } from '../generated/prisma';

// アクション名を定義（APIリクエストの action と一致させる）
export type ActionName =
  | 'SubmitApplication'
  | 'StartScreening'
  | 'RequestIdentityVerification'
  | 'CompleteIdentityVerification'
  | 'FailIdentityVerification'
  | 'StartCreditCheck'
  | 'PassCreditCheck'
  | 'RequireManualReview'
  | 'FailCreditCheck'
  | 'ApproveManually'
  | 'RejectManually'
  | 'StartCardIssuing'
  | 'CompleteCardIssuing'
  | 'ActivateCard'
  | 'CancelApplication'
  | 'RejectScreening'
  | 'BackToScreening';

// 状態遷移ルール: Map<現在の状態, Map<アクション名, 次の状態>>
const transitions = new Map<ApplicationStatus, Map<ActionName, ApplicationStatus>>();

// 各状態からの遷移を定義
transitions.set(ApplicationStatus.APPLIED, new Map([
  ['StartScreening', ApplicationStatus.SCREENING],
  ['CancelApplication', ApplicationStatus.CANCELLED],
]));

transitions.set(ApplicationStatus.SCREENING, new Map([
  ['RequestIdentityVerification', ApplicationStatus.IDENTITY_VERIFICATION_PENDING],
  ['StartCreditCheck', ApplicationStatus.CREDIT_CHECK], // 本人確認不要の場合
  ['RejectScreening', ApplicationStatus.REJECTED],
  ['CancelApplication', ApplicationStatus.CANCELLED],
]));

transitions.set(ApplicationStatus.IDENTITY_VERIFICATION_PENDING, new Map([
  ['CompleteIdentityVerification', ApplicationStatus.CREDIT_CHECK],
  ['FailIdentityVerification', ApplicationStatus.REJECTED],
  ['CancelApplication', ApplicationStatus.CANCELLED],
]));

transitions.set(ApplicationStatus.CREDIT_CHECK, new Map([
  ['PassCreditCheck', ApplicationStatus.APPROVED],
  ['RequireManualReview', ApplicationStatus.MANUAL_REVIEW],
  ['FailCreditCheck', ApplicationStatus.REJECTED],
  ['CancelApplication', ApplicationStatus.CANCELLED],
]));

transitions.set(ApplicationStatus.MANUAL_REVIEW, new Map([
  ['ApproveManually', ApplicationStatus.APPROVED],
  ['RejectManually', ApplicationStatus.REJECTED],
  ['BackToScreening', ApplicationStatus.SCREENING], // 差戻し
  ['CancelApplication', ApplicationStatus.CANCELLED],
]));

transitions.set(ApplicationStatus.APPROVED, new Map([
  ['StartCardIssuing', ApplicationStatus.CARD_ISSUING],
]));

transitions.set(ApplicationStatus.CARD_ISSUING, new Map([
  ['CompleteCardIssuing', ApplicationStatus.CARD_SHIPPED],
]));

transitions.set(ApplicationStatus.CARD_SHIPPED, new Map([
  ['ActivateCard', ApplicationStatus.ACTIVE],
]));

// ACTIVE, REJECTED, CANCELLED からの遷移は定義しない（終端状態）

/**
 * 指定されたアクションが現在の状態から可能か検証し、可能であれば次の状態を返す
 * @param currentStatus 現在の状態
 * @param action 実行しようとしているアクション
 * @returns 遷移可能な場合は次の状態、不可能な場合は null
 */
export function canTransition(
  currentStatus: ApplicationStatus,
  action: string // APIからは文字列で渡される想定
): ApplicationStatus | null {
  const possibleActions = transitions.get(currentStatus);
  if (!possibleActions) {
    // 現在の状態からの遷移ルールが存在しない (終端状態など)
    return null;
  }

  // 型安全性を確保するために ActionName 型にキャストしようとする
  // 不正な action 文字列が渡された場合も考慮
  const validAction = action as ActionName;
  if (possibleActions.has(validAction)) {
    return possibleActions.get(validAction) ?? null;
  }

  // 指定されたアクションが現在の状態から許可されていない
  return null;
}

/**
 * 指定された状態から実行可能なアクション名のリストを取得する
 * （UIでボタンを表示するために使用）
 * @param currentStatus 現在の状態
 * @returns 実行可能なアクション名の配列
 */
export function getAllowedActions(currentStatus: ApplicationStatus): ActionName[] {
    const possibleActions = transitions.get(currentStatus);
    return possibleActions ? Array.from(possibleActions.keys()) : [];
}
