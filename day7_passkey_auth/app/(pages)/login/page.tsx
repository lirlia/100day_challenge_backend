'use client';

import { useState, useEffect } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation'; // リダイレクト用

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const router = useRouter();

  // デバイスIDの初期化
  useEffect(() => {
    // ローカルストレージからデバイスIDを取得または生成
    let storedDeviceId = localStorage.getItem('deviceId');
    if (!storedDeviceId) {
      // ランダムなデバイスIDを生成
      storedDeviceId = crypto.randomUUID();
      localStorage.setItem('deviceId', storedDeviceId);
    }
    setDeviceId(storedDeviceId);
    console.log('Using device ID:', storedDeviceId);
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!deviceId) {
      setError('デバイスIDが初期化されていません。ページを再読み込みしてください。');
      setIsLoading(false);
      return;
    }

    try {
      // 1. ログイン開始APIを呼び出し、オプションを取得
      const resStart = await fetch('/api/auth/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceId }), // デバイスIDを送信
      });

      if (!resStart.ok) {
        const data = await resStart.json();
        throw new Error(data.error || 'Failed to start login');
      }

      const options = await resStart.json();
      console.log('Authentication options:', options);

      // 強制的に別デバイスとして処理する必要があるか確認
      if (options.forceNewDevice) {
        console.log('Server requested to handle as new device. Starting approval flow...');
        return await initiateNewDeviceApproval(email);
      }

      // パスキーの存在チェック
      const hasPasskeys = options.allowCredentials && options.allowCredentials.length > 0;
      console.log('Has passkeys:', hasPasskeys, {
        exists: !!options.allowCredentials,
        length: options.allowCredentials ? options.allowCredentials.length : 0
      });

      if (!hasPasskeys) {
        console.log('No passkeys found for this account. Starting direct approval flow...');
        // パスキーがない場合は直接新しいデバイス承認フローを開始
        return await initiateNewDeviceApproval(email);
      }

      // 2. ブラウザのWebAuthn APIを呼び出し、パスキー認証を開始
      let authResp;
      try {
        authResp = await startAuthentication({ optionsJSON: options });
        console.log('Authentication response from browser:', authResp);
      } catch (err: any) {
        // ユーザーがキャンセルした場合など
        if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
          console.log('Passkey authentication cancelled by user.');

          // キャンセル時に新しいデバイス承認フローを開始するかユーザーに確認
          if (confirm('パスキーが見つからないか、キャンセルされました。別のデバイスからログインしようとしていますか？')) {
            return await initiateNewDeviceApproval(email);
          }

          setError('Login cancelled.');
          setIsLoading(false);
          return;
        }
        console.error('Failed during startAuthentication:', err);
        throw new Error('Could not authenticate with passkey. Please try again.');
      }

      // 3. ログイン完了APIを呼び出し、レスポンスを送信して検証
      const resFinish = await fetch('/api/auth/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...authResp,
          deviceId // デバイスIDを送信
        }),
      });

      const verificationResult = await resFinish.json();
      console.log('Verification result:', verificationResult);

      if (!resFinish.ok) {
        // 承認が必要な場合 (202 Accepted) は特別な処理
        if (resFinish.status === 202 && verificationResult.status === 'approval_required') {
          console.log('Approval required, redirecting...');
          // 承認待ちページにリダイレクト
          localStorage.setItem('requestingDeviceId', verificationResult.requestingDeviceId);
          router.push(`/approve-wait/${verificationResult.requestId}`);
          return;
        }
        throw new Error(verificationResult.error || 'Failed to finish login');
      }

      if (verificationResult.verified) {
        console.log('Login successful!', verificationResult);
        // ログイン成功: 一時的なユーザー情報を保存
        try {
          const tempUserData = {
            id: verificationResult.userId,
            email: verificationResult.email
          };
          console.log('Saving user data to localStorage:', tempUserData);
          localStorage.setItem('tempUser', JSON.stringify(tempUserData));

          // 保存されたことを確認
          const savedData = localStorage.getItem('tempUser');
          console.log('Saved data in localStorage:', savedData);

          // すぐにダッシュボードにリダイレクト
          router.push('/');
        } catch (storageError) {
          console.error('Failed to save user data to localStorage:', storageError);
          setError('ユーザー情報の保存に失敗しました。ブラウザの設定を確認してください。');
          setIsLoading(false);
        }
      } else {
        throw new Error('Login verification failed.');
      }

    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // 新しいデバイス承認フローを開始する関数
  const initiateNewDeviceApproval = async (email: string) => {
    try {
      if (!deviceId) {
        throw new Error('デバイスIDが初期化されていません');
      }

      console.log('Initiating new device approval for:', email);
      const newDeviceResponse = await fetch('/api/auth/login/newdevice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceId }),
      });

      if (!newDeviceResponse.ok) {
        const data = await newDeviceResponse.json();
        throw new Error(data.error || 'Failed to start new device approval');
      }

      const newDeviceResult = await newDeviceResponse.json();
      console.log('New device approval initiated:', newDeviceResult);

      localStorage.setItem('requestingDeviceId', newDeviceResult.requestingDeviceId);
      router.push(`/approve-wait/${newDeviceResult.requestId}`);
    } catch (error: any) {
      console.error('New device approval failed:', error);
      setError(error.message || 'Failed to start approval process');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-black"
              placeholder="you@example.com"
            />
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-200 rounded">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Logging in...' : 'Login with Passkey'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => initiateNewDeviceApproval(email)}
            disabled={!email || isLoading}
            className="text-sm text-blue-600 hover:text-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            別のデバイスとしてログイン
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
            Register
          </a>
        </p>
      </div>
    </div>
  );
}
