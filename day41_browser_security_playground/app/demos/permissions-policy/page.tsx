'use client';

import SecurityHeaderController from '@/app/_components/SecurityHeaderController';
import { useState, useEffect } from 'react';

const initialPermissionsPolicy = "geolocation=(), camera=(), microphone=()"; // Deny all by default for demo

export default function PermissionsPolicyDemoPage() {
  const [policyValue, setPolicyValue] = useState<string>(initialPermissionsPolicy);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [permissionResults, setPermissionResults] = useState<Record<string, string>>({});

  const handleApplySetting = async () => {
    setIsApplying(true);
    setApplyError(null);
    try {
      const payload = {
        action: 'set',
        headerName: 'permissionsPolicy',
        enabled: !!policyValue,
        headerValue: policyValue || null,
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

  const checkPermission = async (name: 'geolocation' | 'camera' | 'microphone') => {
    let result = '不明';
    try {
      if (name === 'geolocation' && navigator.geolocation) {
        result = await new Promise<string>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve('許可されています (または既に許可済)'),
            (err) => resolve(`拒否されました: ${err.message}`)
          );
        });
      } else if ((name === 'camera' || name === 'microphone') && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        result = await navigator.mediaDevices.getUserMedia({ [name === 'camera' ? 'video' : 'audio']: true })
          .then((stream) => {
            stream.getTracks().forEach(track => track.stop()); // 即座にトラックを停止
            return '許可されました (またはプロンプト表示)';
          })
          .catch(err => `拒否されました: ${err.name} - ${err.message}`);
      } else {
        result = 'このブラウザ/環境ではテストできません。';
      }
    } catch (e: any) {
      result = `エラー: ${e.message}`;
    }
    setPermissionResults(prev => ({ ...prev, [name]: result }));
  };

  useEffect(() => {
    // 初回レンダリング時などに現在のPermissions-Policyに基づいて状態を更新することも考えられるが、
    // 実際の権限状態は navigator.permissions.query を使うのがより正確（ただしAPIによってサポート状況が異なる）
    // ここではボタンクリックで都度確認する方式とする
  }, []);

  return (
    <div>
      <SecurityHeaderController
        featureKey="permissionsPolicy"
        title="Permissions-Policy Demo (旧 Feature-Policy)"
        description="`Permissions-Policy` ヘッダーを設定し、特定のブラウザ機能（位置情報、カメラ、マイクなど）へのアクセスを制御します。"
      />

      <div className="glass-card p-6 my-6">
        <h4 className="text-xl font-semibold mb-3 text-sky-300">設定エリア</h4>
        <div className="space-y-4">
          <div>
            <label htmlFor="policyInput" className="block text-sm font-medium text-gray-300 mb-1">
              Permissions-Policy ヘッダー値:
            </label>
            <textarea
              id="policyInput"
              rows={3}
              className="w-full p-2 rounded-md bg-gray-700 border border-gray-600 text-gray-200 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-70"
              value={policyValue}
              onChange={(e) => setPolicyValue(e.target.value)}
              placeholder="例: geolocation=(self), camera=()"
              disabled={isApplying}
            />
            <p className="text-base text-gray-500 mt-1">
              書式例: <code>feature=(origins)</code> または <code>feature=*</code> (全許可), <code>feature=()</code> (全拒否)。<br />
              オリジン指定: <code>self</code>, <code>"https://example.com"</code> など。複数指定はスペース区切り。<br />
              代表的な機能: <code>accelerometer, camera, display-capture, fullscreen, geolocation, gyroscope, magnetometer, microphone, payment, usb</code>など。
            </p>
          </div>
          <button
            onClick={handleApplySetting}
            disabled={isApplying}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors disabled:bg-sky-800 disabled:cursor-not-allowed"
          >
            {isApplying ? '適用中...' : 'このポリシーを適用してリロード'}
          </button>
          {applyError && <p className="text-base text-red-400 mt-2">エラー: {applyError}</p>}
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-800 rounded-lg shadow-md">
        <h4 className="text-xl font-semibold mb-4 text-sky-400">権限テストエリア</h4>
        <div className="space-y-4">
          {(['geolocation', 'camera', 'microphone'] as const).map(feature => (
            <div key={feature} className="p-3 border border-dashed border-gray-600 rounded-md">
              <h5 className="text-md font-medium text-gray-300 mb-2">{feature.charAt(0).toUpperCase() + feature.slice(1)} アクセス試行</h5>
              <button
                onClick={() => checkPermission(feature)}
                className="px-3 py-1 text-base bg-teal-500 hover:bg-teal-600 text-white rounded-md transition-colors mr-2"
              >
                {feature}の権限を確認
              </button>
              {permissionResults[feature] && (
                <span className={`text-base ${permissionResults[feature]?.includes('許可') ? 'text-green-400' : (permissionResults[feature]?.includes('拒否') ? 'text-red-400' : 'text-yellow-400')}`}>
                  結果: {permissionResults[feature]}
                </span>
              )}
              <p className="text-base text-gray-500 mt-1">
                Permissions-Policyで <code>{feature}=()</code> となっていれば拒否されるはずです。
                <code>{feature}=(self)</code> であれば同一オリジンで許可 (プロンプトが出ることも)。
              </p>
            </div>
          ))}
        </div>
        <p className="text-base text-gray-500 mt-4">注意: ブラウザの権限設定やユーザーの事前許可/拒否の状態によっても結果は変わります。ポリシーによる強制的な拒否が機能するかを確認してください。</p>
      </div>
    </div>
  );
}
