'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState, useEffect } from 'react';

type XFrameOptionsValue = 'DENY' | 'SAMEORIGIN' | null;

export default function XFrameOptionsDemoPage() {
  const [selectedOption, setSelectedOption] = useState<XFrameOptionsValue>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string>('');

  useEffect(() => {
    // ページ自身のURLをiframeのsrcの初期値として設定
    // ただし、X-Frame-Optionsが既にDENYやSAMEORIGIN (異なるオリジンからアクセスしている場合)だと表示されない
    setIframeSrc(window.location.href);
  }, []);

  const handleApplySetting = async (option: XFrameOptionsValue) => {
    setIsApplying(true);
    setApplyError(null);
    try {
      const payload = {
        action: 'set',
        headerName: 'xFrameOptions',
        enabled: !!option,
        headerValue: option
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
        featureKey="xFrameOptions"
        title="X-Frame-Options Demo"
        description="`X-Frame-Options` ヘッダーを設定し、クリックジャッキング攻撃を防ぐためにページが `<iframe>` で他サイトに埋め込まれることを制御します。"
      />

      <div className="glass-card p-6 my-6">
        <h4 className="text-xl font-semibold mb-3 text-sky-300">設定エリア</h4>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-300">X-Frame-Optionsヘッダーの値を選択:</p>
            {([null, 'DENY', 'SAMEORIGIN'] as XFrameOptionsValue[]).map((option) => (
              <div key={option || 'none'} className="flex items-center">
                <input
                  type="radio"
                  id={`xfo-${option || 'none'}`}
                  name="xFrameOption"
                  value={option || ''}
                  checked={selectedOption === option}
                  onChange={() => setSelectedOption(option)}
                  className="h-4 w-4 text-sky-600 border-gray-300 focus:ring-sky-500 disabled:opacity-70"
                  disabled={isApplying}
                />
                <label htmlFor={`xfo-${option || 'none'}`} className="ml-2 block text-sm text-gray-300">
                  {option === null ? 'ヘッダーなし (デフォルトまたはCSP frame-ancestors依存)' : option}
                </label>
              </div>
            ))}
          </div>
          <button
            onClick={() => handleApplySetting(selectedOption)}
            disabled={isApplying}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors disabled:bg-sky-800 disabled:cursor-not-allowed"
          >
            {isApplying ? '適用中...' : 'この設定を適用してリロード'}
          </button>
          {applyError && <p className="text-sm text-red-400 mt-2">エラー: {applyError}</p>}
          <p className="text-xs text-gray-500 mt-1">
            注意: <code>X-Frame-Options</code> は古いヘッダーです。より新しい <code>Content-Security-Policy</code> の <code>frame-ancestors</code> ディレクティブの使用が推奨されます。
            両方が指定された場合、<code>frame-ancestors</code> が優先されることが多いです。
            このデモでは主に <code>X-Frame-Options</code> の動作を確認します。
          </p>
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md">
        <h4 className="text-xl font-semibold mb-4 text-sky-400">iframe埋め込みテスト</h4>
        <p className="text-sm text-gray-400 mb-2">
          このページ自身 (<code>{iframeSrc || '現在のページ'}</code>) を以下のiframeに埋め込もうとします。
          設定した <code>X-Frame-Options</code> によって、表示がブロックされるか確認してください。
        </p>
        <div className="border border-dashed border-gray-600 rounded-md p-1 bg-gray-700">
          {iframeSrc ? (
            <iframe
              src={iframeSrc} // 自分自身を埋め込む
              title="X-Frame-Options Self-Embedding Test"
              className="w-full h-64 border-0"
            // sandbox属性はXFOの挙動には直接影響しないが、コンテンツの挙動を制限する
            ></iframe>
          ) : (
            <p className="text-center text-gray-500 p-4">iframeのソースURLを読み込み中...</p>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-2">
          <p><strong>DENY:</strong> iframe内は何も表示されないはずです（ブラウザによってはエラーメッセージ）。</p>
          <p><strong>SAMEORIGIN:</strong> このページ自身が同じオリジンなので表示されるはずです。もしこれが別オリジンのページから埋め込まれていたら表示されません。</p>
          <p><strong>ヘッダーなし:</strong> 表示されます（CSP `frame-ancestors` が設定されていなければ）。</p>
          <p>実際の挙動はブラウザのコンソールでも確認してください (例: "Refused to display '...' in a frame because it set 'X-Frame-Options' to 'deny'.")</p>
        </div>
      </div>
    </div>
  );
}
