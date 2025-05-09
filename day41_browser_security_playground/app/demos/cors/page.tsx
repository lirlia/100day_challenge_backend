'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState } from 'react';

export default function CorsDemoPage() {
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const externalApiUrl = 'https://jsonplaceholder.typicode.com/todos/1'; // CORSテスト用の外部API

  const fetchExternalApi = async () => {
    setIsLoading(true);
    setApiResponse(null);
    try {
      // このリクエストは、ブラウザから直接外部APIに送信されるため、
      // サーバー側のCORS設定（Access-Control-Allow-Originなど）と
      // ここで設定するCORS関連ヘッダー（もしあれば）の両方の影響を受ける。
      // ただし、ブラウザが送信するリクエストヘッダーをこちらから細かく制御するのは難しいため、
      // 主にサーバー側のレスポンスヘッダー（Access-Control-Allow-Originなど）を
      // プレイグラウンドのMiddlewareでどう設定するかがCORSデモの焦点になる。
      // Next.js Middleware で Access-Control-Allow-Origin などを動的に設定する例を示す。

      // ここでのfetchはあくまで「ブラウザからのクロスオリジンリクエスト」のシミュレーション
      const res = await fetch(externalApiUrl);
      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}. Check console for CORS errors.`);
      }
      const data = await res.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (error: any) {
      console.error("CORS API fetch error:", error);
      setApiResponse(`Error: ${error.message}. Check the browser console for CORS policy errors.`);
    }
    setIsLoading(false);
  };

  // CORS設定自体は、主にAPIレスポンスヘッダー (Access-Control-Allow-Origin など) で行われるため、
  // このページで設定する項目は限定的かもしれない。
  // 代わりに、Middlewareで設定されたCORSヘッダーがどう影響するかを見るのが主目的。
  // ここでは、CORS関連の "リクエスト" ヘッダーを擬似的に設定するUIは作らず、
  // 「外部APIを叩いてみる」ボタンで、現在のサーバーCORS設定下での動作を確認する。

  return (
    <div>
      <SecurityHeaderController
        featureKey="all" // CORSは複数のヘッダーが関連するため'all'で現在の全般設定を見るか、専用キーを設ける
        title="Cross-Origin Resource Sharing (CORS) Demo"
        description="異なるオリジンからのリソースリクエストがどのように処理されるかを確認します。サーバー側のレスポンスヘッダー (例: Access-Control-Allow-Origin) の設定が重要です。この設定は主に middleware.ts で行います。"
      />

      <div className="glass-card p-6 my-6">
        <h4 className="text-xl font-semibold mb-3 text-sky-300">CORS テストエリア</h4>
        <p className="text-sm text-gray-400 mb-4">
          以下のボタンをクリックすると、ブラウザから直接外部API (<code>{externalApiUrl}</code>) にリクエストを送信します。
          成功すればAPIレスポンスが、CORSエラーでブロックされればエラーメッセージが表示されます。
          Next.jsのMiddleware (<code>middleware.ts</code>) で <code>Access-Control-Allow-Origin</code> などのCORS関連ヘッダーを適切に設定することで、このリクエストの成否を制御できます。
        </p>
        <button
          onClick={fetchExternalApi}
          disabled={isLoading}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors disabled:bg-sky-800"
        >
          {isLoading ? 'Fetching...' : '外部APIにリクエスト送信'}
        </button>
        {apiResponse && (
          <div className="mt-4 p-3 bg-gray-700 bg-opacity-50 rounded">
            <p className="text-sm font-medium text-gray-300 mb-1">API レスポンス:</p>
            <pre className={`text-xs whitespace-pre-wrap break-all ${apiResponse.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {apiResponse}
            </pre>
          </div>
        )}
        <div className="mt-4 text-xs text-gray-500">
          <p>CORSエラーが発生した場合の典型的なコンソールメッセージ:</p>
          <p><code>Access to fetch at '{externalApiUrl}' from origin 'http://localhost:3001' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.</code></p>
          <p>このプレイグラウンドでは、<code>middleware.ts</code> で <code>response.headers.set('Access-Control-Allow-Origin', '*');</code> のような設定を試すことで、このエラーを解消/発生させることができます。(現在はコメントアウトされています)</p>
        </div>
      </div>
    </div>
  );
}
