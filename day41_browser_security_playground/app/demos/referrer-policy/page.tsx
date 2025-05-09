'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState } from 'react';

const REFERRER_INSPECT_PATH = '/api/demos/referrer-policy/inspect-referrer';

type ReferrerPolicyOption =
  | '' // ヘッダーなし (ブラウザのデフォルト) または "no-referrer" を指定しない場合
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'same-origin'
  | 'origin'
  | 'strict-origin'
  | 'origin-when-cross-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

const referrerPolicies: { value: ReferrerPolicyOption; label: string }[] = [
  { value: '', label: 'ヘッダーなし (ブラウザデフォルト)' },
  { value: 'no-referrer', label: 'no-referrer' },
  { value: 'no-referrer-when-downgrade', label: 'no-referrer-when-downgrade' },
  { value: 'same-origin', label: 'same-origin' },
  { value: 'origin', label: 'origin' },
  { value: 'strict-origin', label: 'strict-origin' },
  { value: 'origin-when-cross-origin', label: 'origin-when-cross-origin' },
  { value: 'strict-origin-when-cross-origin', label: 'strict-origin-when-cross-origin (推奨)' },
  { value: 'unsafe-url', label: 'unsafe-url' },
];

export default function ReferrerPolicyDemoPage() {
  const [selectedPolicy, setSelectedPolicy] = useState<ReferrerPolicyOption>('strict-origin-when-cross-origin');
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [inspectionResult, setInspectionResult] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  const handleApplySetting = async (policy: ReferrerPolicyOption) => {
    setIsApplying(true);
    setApplyError(null);
    try {
      const payload = {
        action: 'set',
        headerName: 'referrerPolicy',
        enabled: !!policy, // 空文字も false 扱いになるが、API側は headerValue を見る
        headerValue: policy === '' ? null : policy, // 空文字はヘッダー削除として扱う
      };
      const res = await fetch('/api/set-security-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(`設定適用エラー: ${errorData.message}`);
      }
      window.location.reload();
    } catch (e: any) {
      setApplyError(e.message);
      setIsApplying(false);
    }
  };

  const inspectReferrer = async () => {
    setIsInspecting(true);
    setInspectionResult(null);
    try {
      const res = await fetch(REFERRER_INSPECT_PATH, {
        referrerPolicy: selectedPolicy // selectedPolicy は ReferrerPolicyOption なのでそのまま渡せる
      });
      if (!res.ok) {
        throw new Error(`検査APIエラー: ${res.statusText}`);
      }
      const data = await res.json();
      setInspectionResult(data.referer || 'Refererヘッダーなし (または空文字列)');
    } catch (e: any) {
      setInspectionResult(`エラー: ${e.message}`);
    }
    setIsInspecting(false);
  };

  return (
    <div>
      <SecurityHeaderController
        featureKey="referrerPolicy"
        title="Referrer-Policy Demo"
        description="`Referrer-Policy` ヘッダーを設定し、リクエスト時に送信されるリファラ情報をどのように制御するかを確認します。"
      />

      <div className="glass-card p-6 my-6">
        <h4 className="text-xl font-semibold mb-3 text-sky-300">設定エリア</h4>
        <div className="space-y-4">
          <div>
            <label htmlFor="referrerPolicySelect" className="block text-base font-medium text-gray-300 mb-1">
              Referrer-Policyヘッダーの値を選択:
            </label>
            <select
              id="referrerPolicySelect"
              value={selectedPolicy}
              onChange={(e) => setSelectedPolicy(e.target.value as ReferrerPolicyOption)}
              className="w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-gray-200 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-70"
              disabled={isApplying}
            >
              {referrerPolicies.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => handleApplySetting(selectedPolicy)}
            disabled={isApplying}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors disabled:bg-sky-800 disabled:cursor-not-allowed"
          >
            {isApplying ? '適用中...' : 'この設定を適用してリロード'}
          </button>
          {applyError && <p className="text-base text-red-400 mt-2">エラー: {applyError}</p>}
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md">
        <h4 className="text-xl font-semibold mb-4 text-sky-400">リファラ検査テスト</h4>
        <p className="text-base text-gray-400 mb-2">
          以下のボタンをクリックすると、このページ (<code>{typeof window !== 'undefined' ? window.location.href : ''}</code>) から
          <code>{REFERRER_INSPECT_PATH}</code> へリクエストを送信し、その際に送信された <code>Referer</code> ヘッダーの内容を表示します。
        </p>
        <button
          onClick={inspectReferrer}
          disabled={isInspecting}
          className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-md transition-colors disabled:bg-teal-800"
        >
          {isInspecting ? '検査中...' : '送信されたリファラ情報を確認'}
        </button>
        {inspectionResult && (
          <div className="mt-4 p-3 bg-gray-700 bg-opacity-50 rounded">
            <p className="text-base font-medium text-gray-300 mb-1">受信した Referer ヘッダー:</p>
            <pre className={`text-base whitespace-pre-wrap break-all ${inspectionResult.startsWith('エラー') ? 'text-red-400' : 'text-green-400'}`}>
              {inspectionResult}
            </pre>
          </div>
        )}
        <div className="text-base text-gray-500 mt-3">
          <p><strong>解説 (主な値):</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>no-referrer:</strong> リファラ情報を送信しません。</li>
            <li><strong>no-referrer-when-downgrade:</strong> HTTPSからHTTPへの遷移時以外はオリジン、パス、クエリを送信します。</li>
            <li><strong>same-origin:</strong> 同一オリジンへのリクエストにのみリファラを送信します。</li>
            <li><strong>strict-origin-when-cross-origin:</strong> HTTPS-&gt;HTTPでは送信せず、同一オリジンへはフルパス、クロスオリジンへはオリジンのみ。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
