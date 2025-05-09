'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState } from 'react';

export default function CorsDemoPage() {
  const [externalApiResponse, setExternalApiResponse] = useState<string | null>(null);
  const [isExternalLoading, setIsExternalLoading] = useState(false);
  const corsErrorApiUrl = 'https://cors-test.appspot.com/test'; // 確実にCORSエラーを返す外部API

  const [jsonplaceholderApiResponse, setJsonplaceholderApiResponse] = useState<string | null>(null);
  const [isJsonplaceholderLoading, setIsJsonplaceholderLoading] = useState(false);
  const jsonplaceholderApiUrl = 'https://jsonplaceholder.typicode.com/todos/1'; // CORS許可済みの外部API

  const fetchApi = async (
    url: string,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    setResponse: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch(url);
      // res.ok が false でも、CORSエラーの場合は通常 fetch が例外を投げるので、ここは通過しないことが多い
      // CORSエラー以外（404など）で res.ok が false になる可能性はある
      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${res.statusText}. (If this is a CORS error, it might be caught below)`);
      }
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error: any) {
      console.error("API fetch error:", error);
      // CORSエラーの場合、error.message は "Failed to fetch" などになることが多い
      setResponse(`Error: ${error.message}. Check the browser console for more details (e.g., CORS policy errors).`);
    }
    setLoading(false);
  };

  return (
    <div>
      <SecurityHeaderController
        featureKey="all"
        title="Cross-Origin Resource Sharing (CORS) Demo"
        description="異なるオリジンへのリソースリクエストがブラウザによってどのように扱われるかを確認します。CORSエラーはブラウザのセキュリティ機能であり、サーバーが適切なCORSヘッダーを返さない場合に発生します。"
      />

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        {/* テスト1: CORSエラーが発生する外部API */}
        <div className="glass-card p-6">
          <h4 className="text-xl font-semibold mb-3 text-sky-300">テスト1: CORSエラーが発生するAPI</h4>
          <p className="text-base mb-4">
            以下のボタンは、デフォルトでCORSエラーを返すように設定されている外部API (<code>{corsErrorApiUrl}</code>) にリクエストします。
            ブラウザのコンソールでCORSエラーメッセージを確認してください。
          </p>
          <button
            onClick={() => fetchApi(corsErrorApiUrl, setIsExternalLoading, setExternalApiResponse)}
            disabled={isExternalLoading}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-70"
          >
            {isExternalLoading ? '取得中...' : 'CORSエラーAPIにリクエスト'}
          </button>
          {externalApiResponse && (
            <div className="mt-4 p-3 bg-gray-700 bg-opacity-50 rounded">
              <p className="text-base font-medium mb-1">レスポンス:</p>
              <pre className={`text-base whitespace-pre-wrap break-all ${externalApiResponse.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {externalApiResponse}
              </pre>
            </div>
          )}
        </div>

        {/* テスト2: CORSが許可されている外部API (参考) */}
        <div className="glass-card p-6">
          <h4 className="text-xl font-semibold mb-3 text-sky-300">テスト2: CORS許可済みAPI (参考)</h4>
          <p className="text-base mb-4">
            以下のボタンは、CORSが常に許可されている外部API (<code>{jsonplaceholderApiUrl}</code>) にリクエストします。これは比較のための成功例です。
          </p>
          <button
            onClick={() => fetchApi(jsonplaceholderApiUrl, setIsJsonplaceholderLoading, setJsonplaceholderApiResponse)}
            disabled={isJsonplaceholderLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-70"
          >
            {isJsonplaceholderLoading ? '取得中...' : 'CORS許可APIにリクエスト'}
          </button>
          {jsonplaceholderApiResponse && (
            <div className="mt-4 p-3 bg-gray-700 bg-opacity-50 rounded">
              <p className="text-base font-medium mb-1">レスポンス:</p>
              <pre className={`text-base whitespace-pre-wrap break-all ${jsonplaceholderApiResponse.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {jsonplaceholderApiResponse}
              </pre>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md text-base">
        <h4 className="text-xl font-semibold mb-3 text-sky-400">CORSエラーについて</h4>
        <p>CORS (Cross-Origin Resource Sharing) は、ウェブブラウザが異なるオリジン（ドメイン、プロトコル、ポートが異なる場合）のリソースへのリクエストを制限するセキュリティメカニズムです。</p>
        <p className="mt-2">上記の「CORSエラーAPIにリクエスト」ボタンをクリックすると、ブラウザはおそらく以下のようなエラーをコンソールに出力します（内容はブラウザによって若干異なります）：</p>
        <pre className="my-2 p-2 bg-gray-700 rounded text-red-400 text-sm">
          Access to fetch at '{corsErrorApiUrl}' from origin 'http://localhost:3001'
          has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header
          is present on the requested resource.
        </pre>
        <p className="mt-2">
          これは、<code>{corsErrorApiUrl}</code> のサーバーが、<code>http://localhost:3001</code> からのアクセスを許可する <code>Access-Control-Allow-Origin</code> ヘッダーをレスポンスに含めていないためです。
        </p>
        <p className="mt-2">
          Next.jsのMiddlewareは、自身のオリジン (<code>http://localhost:3001</code>) へのリクエストやそこからのレスポンスを加工することはできますが、全く異なる外部ドメイン (例: <code>cors-test.appspot.com</code>) のサーバーの挙動を直接変更することはできません。
          外部APIのCORS問題を解決するには、外部APIのサーバー側で適切なCORSヘッダーを設定する必要があります。
        </p>
      </div>
    </div>
  );
}
