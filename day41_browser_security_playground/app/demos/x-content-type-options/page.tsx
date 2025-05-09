'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState } from 'react';

const SNIFF_TEST_PATH_IMAGE_AS_HTML = '/api/demos/x-content-type-options/image-as-html';
const SNIFF_TEST_PATH_TEXT_AS_SCRIPT = '/api/demos/x-content-type-options/text-as-script';

export default function XContentTypeOptionsDemoPage() {
  const [nosniffEnabled, setNosniffEnabled] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleApplySetting = async (enabled: boolean) => {
    setIsApplying(true);
    setApplyError(null);
    try {
      const payload = {
        action: 'set',
        headerName: 'xContentTypeOptions',
        enabled: enabled, // true で 'nosniff', false でヘッダー削除 (null)
        headerValue: enabled ? 'nosniff' : null
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

  return (
    <div>
      <SecurityHeaderController
        featureKey="xContentTypeOptions"
        title="X-Content-Type-Options Demo"
        description="`X-Content-Type-Options: nosniff` ヘッダーを設定し、ブラウザによるMIMEタイプスニッフィングを抑止する効果を確認します。"
      />

      <div className="glass-card p-6 my-6">
        <h4 className="text-xl font-semibold mb-3 text-sky-300">設定エリア</h4>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="nosniffEnabled"
              checked={nosniffEnabled}
              onChange={(e) => setNosniffEnabled(e.target.checked)}
              className="h-4 w-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 disabled:opacity-70"
              disabled={isApplying}
            />
            <label htmlFor="nosniffEnabled" className="ml-2 block text-base">
              <code>X-Content-Type-Options: nosniff</code> を有効にする
            </label>
          </div>
          <button
            onClick={() => handleApplySetting(nosniffEnabled)}
            disabled={isApplying}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors disabled:bg-sky-800 disabled:cursor-not-allowed"
          >
            {isApplying ? '適用中...' : 'この設定を適用してリロード'}
          </button>
          {applyError && <p className="text-base text-red-400 mt-2">エラー: {applyError}</p>}
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md">
        <h4 className="text-xl font-semibold mb-4 text-sky-400">MIMEスニッフィング テスト</h4>
        <p className="text-base mb-4">
          以下のiframeは、サーバーから特定のContent-Typeで返されるリソースを読み込みます。
          `nosniff`が有効な場合と無効な場合で、ブラウザの解釈がどう変わるか確認してください。
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="border border-dashed border-gray-600 rounded-md p-4">
            <h5 className="text-lg font-medium mb-2">テスト1: Content-Type: image/jpeg だが中身はHTML</h5>
            <p className="text-base mb-2">サーバーは <code>Content-Type: image/jpeg</code> と共にHTML文字列 (<code>&lt;h1&gt;HTMLです&lt;/h1&gt;</code>) を返します。</p>
            <iframe
              src={SNIFF_TEST_PATH_IMAGE_AS_HTML}
              title="Image as HTML Test"
              className="w-full h-32 border border-gray-500 bg-gray-700"
              sandbox="allow-scripts" // nosniff無効時にスクリプト実行を許可するため(デモ用、通常非推奨)
            ></iframe>
            <p className="text-base mt-2">
              <strong>nosniff 無効時:</strong> ブラウザが内容をHTMLとスニッフィングし、表示する可能性があります (ブラウザ依存)。<br />
              <strong>nosniff 有効時:</strong> ブラウザはContent-Typeを信じ、画像として処理しようとして失敗するか、何も表示しないはずです。
            </p>
          </div>

          <div className="border border-dashed border-gray-600 rounded-md p-4">
            <h5 className="text-lg font-medium mb-2">テスト2: Content-Type: text/plain だが中身はJavaScript</h5>
            <p className="text-base mb-2">サーバーは <code>Content-Type: text/plain</code> と共にJavaScriptコード (<code>alert('Script executed as text!')</code>) を返します。</p>
            {/* scriptタグで外部ソースとして読み込む方がスニッフィングの影響を受けやすい */}
            {/* iframeで表示する場合、直接スクリプトが実行されるかはブラウザと設定による */}
            {/* ここではiframeのsrcに指定して、ブラウザがどう解釈するかを見る */}
            <iframe
              src={SNIFF_TEST_PATH_TEXT_AS_SCRIPT}
              title="Text as Script Test"
              className="w-full h-32 border border-gray-500 bg-gray-700"
              sandbox="allow-scripts" // nosniff無効時にスクリプト実行を許可するため(デモ用、通常非推奨)
            ></iframe>
            <p className="text-base mt-2">
              <strong>nosniff 無効時:</strong> ブラウザが内容をスクリプトとして解釈しようと試みる可能性があります。
              しかし、近年の主要ブラウザはセキュリティ強化のため、<code>text/plain</code> で提供されたコンテンツからスクリプトを直接実行することをデフォルトでブロックする傾向にあります。
              そのため、このデモでも <code>X-Content-Type-Options: nosniff</code> ヘッダーがない場合でも、スクリプトが実行されないことがあります。
              (より古いブラウザや特定の条件下ではスニッフィングによる実行リスクが残ります)<br />
              <strong>nosniff 有効時:</strong> ブラウザはContent-Typeを信じ、プレーンテキストとして表示するか、スクリプトとしては実行しないはずです。
              （コンソールでエラーが出るか確認してください）
            </p>
          </div>
        </div>
        <p className="text-base mt-4">注意: 実際のMIMEスニッフィングの挙動はブラウザの種類やバージョンによって異なる場合があります。</p>
      </div>
    </div>
  );
}
