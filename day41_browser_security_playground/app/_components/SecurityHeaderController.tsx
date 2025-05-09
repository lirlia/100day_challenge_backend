'use client';

import { useEffect, useState, useCallback } from 'react';
import { ReactNode } from 'react';

interface SecuritySettings {
  csp?: string;
  hsts?: { enabled: boolean; maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  xContentTypeOptions?: 'nosniff' | null;
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | null;
  referrerPolicy?: string | null;
  permissionsPolicy?: string | null;
}

interface SecurityHeaderControllerProps {
  featureKey: keyof SecuritySettings | 'all';
  title: string;
  description?: ReactNode;
  children?: React.ReactNode;
  policyToApply?: string;
  currentPolicyDisplay?: ReactNode | string;
}

export default function SecurityHeaderController({
  featureKey,
  title,
  description,
  children
}: SecurityHeaderControllerProps) {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/set-security-headers');
      if (!res.ok) throw new Error(`Failed to fetch settings: ${res.statusText}`);
      const data = await res.json();
      setSettings(data);
    } catch (e: any) {
      setError(e.message);
      console.error("Fetch settings error:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const clearFeatureSetting = async () => {
    if (featureKey === 'all') return;
    setIsLoading(true);
    setError(null);
    try {
      const payload = { action: 'clear', headerName: featureKey };
      const res = await fetch('/api/set-security-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to clear ${featureKey} setting: ${res.statusText}`);
      await fetchSettings();
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      console.error(`Clear ${featureKey} error:`, e);
      setIsLoading(false);
    }
  };

  const handleClearAllSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/set-security-headers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearAll' }),
      });
      if (!res.ok) throw new Error('Failed to clear all settings');
      await fetchSettings();
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      console.error("Clear all settings error:", e);
      setIsLoading(false);
    }
  };

  if (isLoading && settings === null) return <p className="text-center text-sky-400">Loading settings...</p>;
  if (error && featureKey === 'all') return <p className="text-center text-red-500">Error loading global settings: {error}</p>;

  const currentFeatureValue = settings && featureKey !== 'all' ? (settings as any)[featureKey] : undefined;

  return (
    <div className="glass-card p-6 my-6 relative">
      <h3 className="text-2xl font-semibold mb-1 text-sky-300">{title}</h3>
      {description && <div className="text-base mb-4 text-gray-400">{description}</div>}

      {error && <p className="text-base text-red-500 mb-2">Error: {error}</p>}

      {featureKey !== 'all' && (
        <div className="mb-4 p-3 bg-gray-700 bg-opacity-50 rounded">
          <p className="text-base font-medium">現在のHTTPヘッダー ('{featureKey}'):</p>
          {isLoading && settings === null ? (
            <p className="text-base text-sky-400">読み込み中...</p>
          ) : currentFeatureValue !== undefined && currentFeatureValue !== null && currentFeatureValue !== '' ? (
            <pre className="text-base text-green-400 whitespace-pre-wrap break-all">
              {typeof currentFeatureValue === 'object' ? JSON.stringify(currentFeatureValue, null, 2) : String(currentFeatureValue)}
            </pre>
          ) : (
            <p className="text-base">現在このヘッダーは設定されていません。</p>
          )}
        </div>
      )}
      {featureKey === 'all' && settings && Object.keys(settings).length > 0 && (
        <div className="mb-4 p-3 bg-gray-700 bg-opacity-50 rounded">
          <p className="text-base font-medium">現在Cookieに保存されている全設定:</p>
          <pre className="text-base text-sky-400 whitespace-pre-wrap break-all">
            {JSON.stringify(settings, null, 2)}
          </pre>
        </div>
      )}
      {featureKey === 'all' && (!settings || Object.keys(settings).length === 0) && !isLoading && (
        <p className="text-base mb-4">現在、設定されているカスタムセキュリティヘッダーはありません。</p>
      )}

      {/* 子要素（CSPビルダーなど）をここにレンダリング */}
      {children && <div className="my-4">{children}</div>}

      <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-700 pt-4">
        {featureKey !== 'all' && (
          <button
            onClick={clearFeatureSetting}
            disabled={isLoading || (currentFeatureValue === undefined || currentFeatureValue === null)}
            className="px-4 py-2 text-base font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md disabled:opacity-50 disabled:bg-gray-500 transition-colors"
          >
            '{featureKey}' の設定をクリアしてリロード
          </button>
        )}
        {featureKey === 'all' && (
          <button
            onClick={handleClearAllSettings}
            disabled={isLoading || !settings || Object.keys(settings).length === 0}
            className="px-4 py-2 text-base font-medium text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 disabled:bg-gray-500 transition-colors"
          >
            全てのカスタムヘッダー設定をクリアしてリロード
          </button>
        )}
      </div>
      {isLoading && <p className="text-center text-base text-sky-400 mt-2">処理中...</p>}
    </div>
  );
}
