'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState } from 'react';

interface HstsFormState {
  enabled: boolean;
  maxAge: number;
  includeSubDomains: boolean;
  preload: boolean;
}

export default function HstsDemoPage() {
  const [formState, setFormState] = useState<HstsFormState>({
    enabled: false,
    maxAge: 31536000, // 1 year
    includeSubDomains: false,
    preload: false,
  });
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormState(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value, 10) : value),
    }));
  };

  const handleApplyHsts = async () => {
    setIsApplying(true);
    setApplyError(null);
    try {
      const payload = {
        action: 'set',
        headerName: 'hsts',
        enabled: formState.enabled,
        maxAge: formState.maxAge,
        includeSubDomains: formState.includeSubDomains,
        preload: formState.preload,
      };
      const res = await fetch('/api/set-security-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(`HSTS設定の適用に失敗しました: ${errorData.message}`);
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
        featureKey="hsts"
        title="HTTP Strict Transport Security (HSTS) Demo"
        description="HSTSヘッダー (Strict-Transport-Security) を設定し、ブラウザにHTTPS接続を強制する方法を学びます。ローカルHTTP環境では完全な動作確認が難しいため、主にヘッダー設定の反映を確認します。"
      />

      <div className="glass-card p-6 my-6">
        <h4 className="text-xl font-semibold mb-3 text-sky-300">HSTS 設定エリア</h4>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="hstsEnabled"
              name="enabled"
              checked={formState.enabled}
              onChange={handleInputChange}
              className="h-4 w-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 disabled:opacity-70"
              disabled={isApplying}
            />
            <label htmlFor="hstsEnabled" className="ml-2 block text-sm text-gray-300">
              HSTSを有効にする (Strict-Transport-Security ヘッダーを出力)
            </label>
          </div>

          {formState.enabled && (
            <>
              <div>
                <label htmlFor="maxAge" className="block text-sm font-medium text-gray-300">
                  max-age (秒): ブラウザがHSTSを記憶する期間 (デフォルト: 31536000 = 1年)
                </label>
                <input
                  type="number"
                  id="maxAge"
                  name="maxAge"
                  value={formState.maxAge}
                  onChange={handleInputChange}
                  className="mt-1 block w-full p-2 rounded-md bg-gray-700 border-gray-600 text-gray-200 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-70"
                  disabled={isApplying}
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="includeSubDomains"
                  name="includeSubDomains"
                  checked={formState.includeSubDomains}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 disabled:opacity-70"
                  disabled={isApplying}
                />
                <label htmlFor="includeSubDomains" className="ml-2 block text-sm text-gray-300">
                  includeSubDomains (サブドメインにも適用)
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="preload"
                  name="preload"
                  checked={formState.preload}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 disabled:opacity-70"
                  disabled={isApplying}
                />
                <label htmlFor="preload" className="ml-2 block text-sm text-gray-300">
                  preload (HSTSプリロードリストへの登録申請を意図 - 注意して使用)
                </label>
              </div>
            </>
          )}
          <button
            onClick={handleApplyHsts}
            disabled={isApplying}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors disabled:bg-sky-800 disabled:cursor-not-allowed"
          >
            {isApplying ? '適用中...' : 'このHSTS設定を適用してリロード'}
          </button>
          {applyError && <p className="text-sm text-red-400 mt-2">エラー: {applyError}</p>}
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md">
        <h4 className="text-xl font-semibold mb-4 text-sky-400">HSTS 解説</h4>
        <div className="prose prose-sm prose-invert max-w-none text-gray-300 space-y-3">
          <p>HSTS (HTTP Strict Transport Security) は、ウェブサイトがブラウザに対して「常にHTTPSを使用して接続する」よう指示するセキュリティ機能です。</p>
          <p>一度HSTSヘッダーを受け取ったブラウザは、指定された期間 (max-age)、たとえユーザーがHTTPでアクセスしようとしても自動的にHTTPSに切り替えます。これにより、SSLストリッピング攻撃（中間者がHTTPS接続をHTTPにダウングレードさせる攻撃）などを防ぎます。</p>
          <p><strong>注意点:</strong></p>
          <ul>
            <li>HSTSは、サイトが完全にHTTPSで提供されている場合にのみ有効にすべきです。HTTPのコンテンツが残っていると、それらが表示されなくなる可能性があります。</li>
            <li>ローカル開発環境 (http://localhost) でのHSTS動作確認は限定的です。</li>
            <li><code>preload</code> ディレクティブは、あなたのサイトをブラウザベンダーが管理するHSTSプリロードリストに追加する意志を示すものです。リストに追加されると、ブラウザは初回アクセス時からHTTPSを強制するようになりますが、リストからの削除は困難なため、慎重に使用する必要があります。</li>
          </ul>
          <p>現在のレスポンスヘッダーは、ページ上部の「現在のHTTPヘッダー ('hsts')」セクションで確認できます (設定適用後にリロードしてください)。</p>
        </div>
      </div>
    </div>
  );
}
