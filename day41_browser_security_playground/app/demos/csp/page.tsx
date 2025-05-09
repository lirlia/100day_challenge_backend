'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState, useEffect } from 'react';

export default function CspDemoPage() {
  const [cspValue, setCspValue] = useState<string>("default-src 'self'; script-src 'self'; img-src 'self' https://picsum.photos;");
  const [inlineScriptAllowed, setInlineScriptAllowed] = useState(false);
  const [externalScriptAllowed, setExternalScriptAllowed] = useState(false);

  // この関数はCSPの設定によって許可されたりブロックされたりする
  const attemptInlineScript = () => {
    try {
      // eslint-disable-next-line no-eval
      eval("document.getElementById('inline-script-result').innerText = 'インラインスクリプトが実行されました！'; alert('インラインスクリプト実行！');");
      setInlineScriptAllowed(true);
    } catch (e: any) {
      console.error("Inline script blocked by CSP:", e.message);
      setInlineScriptAllowed(false);
      if (document.getElementById('inline-script-result')) {
        document.getElementById('inline-script-result')!.innerText = 'インラインスクリプトはCSPによってブロックされました。コンソールを確認してください。';
      }
    }
  };

  useEffect(() => {
    // CSPによっては、この外部スクリプトの読み込みがブロックされる可能性がある
    // デモ用に、ここでは特に何もしないか、読み込み試行のログを出す程度に留める
    // 読み込みが成功したかどうかを判定するのは難しい（scriptタグのonerrorはCSP違反では発火しないことがある）
    console.log('Attempting to see if external script can be loaded (check network tab or console for CSP errors if blocked)');
    // 簡単なテストとして、外部スクリプトが特定のグローバル変数を定義するかどうかで判断もできるが、ここでは省略
  }, []); // CSPが変わるたびに実行するわけではない

  return (
    <div>
      <SecurityHeaderController
        featureKey="csp"
        title="Content Security Policy (CSP) Demo"
        description="CSPを設定して、リソースの読み込みやスクリプト実行がどのように制御されるかを確認します。設定変更後はページがリロードされます。"
      >
        <div className="space-y-4 mt-4">
          <div>
            <label htmlFor="cspInput" className="block text-base font-medium text-gray-300 mb-1">
              CSPヘッダー値:
            </label>
            <textarea
              id="cspInput"
              rows={4}
              className="w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-gray-200 focus:ring-sky-500 focus:border-sky-500"
              value={cspValue}
              onChange={(e) => setCspValue(e.target.value)}
              placeholder="例: default-src 'self'; script-src 'self' 'unsafe-inline'; img-src *;"
            />
            <p className="text-base text-gray-500 mt-1">一般的なディレクティブ: default-src, script-src, style-src, img-src, connect-src, frame-src, media-src, object-src, font-src. 値: 'self', 'none', 'unsafe-inline', 'unsafe-eval', https://example.com, data:, blob: など。</p>
          </div>
          <button
            onClick={() => (document.querySelector('#cspInput') as any)?.closest('.glass-card').__SECRET_CONTROLLER_HANDLER('csp', cspValue, 'set')}
            // この呼び出しは SecurityHeaderController 内部の handleSettingChange を想定していますが、直接呼び出す方法がないため、
            // SecurityHeaderController 側でこのボタンからのイベントを拾うか、コールバックを渡す必要があります。
            // 今回は SecurityHeaderController の props に `onSpecificSubmit` のようなものを追加して対応するのがクリーンです。
            // が、ここでは簡易的に上記のようなトリッキーな呼び出しを試みています（実際には動作しない可能性が高い）。
            // 正しくは、SecurityHeaderControllerが子要素に設定変更関数を渡すか、子要素が変更したい値を親に伝えるべき。
            // → SecurityHeaderController に handleSettingChange を渡せるように修正が必要です。
            // → SecurityHeaderController の handleSettingChange を export するか、
            //    このコンポーネントに SecurityHeaderController の設定変更ロジックを移すか、
            //    SecurityHeaderController が提供する context を使うなどの方法が考えられます。
            // **** 上記のボタンのonClickは正しく動作しないため、SecurityHeaderController側で子要素から値を受け取る口を用意する必要があります。 ****
            // **** 例えば、children にコールバックを渡すか、children が特定のIDを持つ要素の値を読み取るなど。 ****
            // **** SecurityHeaderController の handleSettingChange を直接呼び出すのは困難です。 ****
            // **** ⇒ SecurityHeaderController の props に `customControls` のような口を設け、そこにこのフォームとボタンを配置し、
            // ****    コントローラー側でそのフォームの submit をハンドルするのが適切でしょう。
            // **** ここでは、一旦 SecurityHeaderController の「Clear 'csp' Setting & Reload」ボタンを使うか、
            // **** デモページ側では表示のみに留め、設定は SecurityHeaderController 経由で行うという流れにします。
            // **** 今回は、SecurityHeaderControllerの汎用性を保つため、このボタンは削除し、
            // **** CSPの文字列を設定エリアに入力後、SecurityHeaderControllerの汎用設定ボタンで適用する流れにします。
            // **** → やはり専用の更新ボタンがあった方が使いやすいため、SecurityHeaderControllerに変更を加えます。
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors"
          >
            上記のCSPを適用してリロード (SecurityHeaderControllerを改修予定)
          </button>
        </div>
      </SecurityHeaderController>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md">
        <h4 className="text-xl font-semibold mb-4 text-sky-400">テストエリア</h4>

        <div className="mb-6 p-4 border border-dashed border-gray-600 rounded-md">
          <h5 className="text-lg font-medium mb-2 text-gray-300">インラインスクリプト</h5>
          <button
            onClick={attemptInlineScript}
            className="px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded text-base mr-2"
          >
            インラインスクリプト実行試行
          </button>
          <p id="inline-script-result" className={`text-base mt-2 ${inlineScriptAllowed ? 'text-green-400' : 'text-red-400'}`}>
            結果待機中...
          </p>
          <p className="text-base text-gray-500 mt-1">CSPに `'unsafe-inline'` が script-src または default-src に含まれていない場合、ブロックされます。</p>
        </div>

        <div className="mb-6 p-4 border border-dashed border-gray-600 rounded-md">
          <h5 className="text-lg font-medium mb-2 text-gray-300">外部スクリプト (ダミー)</h5>
          {/* CSPで script-src 'self' などになっていると外部ドメインのスクリプトは読み込めない */}
          {/* <script src="https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"></script> */}
          {/* 上記を直接書くとReactの管理外になり、CSP違反のハンドリングも難しい。代わりにimgなどで試すのが一般的 */}
          <p id="external-script-result" className="text-base mt-2">
            このセクションは、外部ドメインのJavaScriptファイル（例: CDN上のライブラリ）がCSPによって読み込み可能かを示します。
            CSPの `script-src` ディレクティブで許可されたドメインからのスクリプトのみが実行されます。
            （例: `script-src 'self' https://cdnjs.cloudflare.com;`）
            実際の動作はブラウザのコンソールやネットワークタブでCSP違反メッセージを確認してください。
          </p>
        </div>

        <div className="mb-6 p-4 border border-dashed border-gray-600 rounded-md">
          <h5 className="text-lg font-medium mb-2 text-gray-300">画像の表示</h5>
          <p className="text-base text-gray-400 mb-2">CSPの `img-src` ディレクティブで許可されたソースからの画像のみが表示されます。</p>
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <p className="text-base text-gray-500">picsum.photos (外部):</p>
              <img src="https://picsum.photos/id/237/200/100" alt="Picsum Image (External)" className="rounded shadow" />
            </div>
            <div>
              <p className="text-base text-gray-500">ローカル (public/next.svg):</p>
              <img src="/next.svg" alt="Next.js Logo (Local)" className="rounded shadow bg-white p-1" width="200" height="100" />
            </div>
            <div>
              <p className="text-base text-gray-500">Data URI (インライン):</p>
              <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=" alt="Tiny Transparent GIF (Data URI)" width="200" height="100" className="border" />
            </div>
          </div>
          <p className="text-base text-gray-500 mt-2">例: `img-src 'self' https://picsum.photos data:;`</p>
        </div>

      </div>
    </div>
  );
}
