'use client';

import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation'; // リダイレクト用

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1. ログイン開始APIを呼び出し、オプションを取得
      const resStart = await fetch('/api/auth/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!resStart.ok) {
        const data = await resStart.json();
        throw new Error(data.error || 'Failed to start login');
      }

      const options = await resStart.json();
      console.log('Authentication options:', options);

      // ログインオプションに allowCredentials が空の場合、ユーザーはこのRPにパスキーを登録していない
      if (options.allowCredentials && options.allowCredentials.length === 0) {
        setError(
          'No passkeys found for this account. Please register first or try a different account.',
        );
        setIsLoading(false);
        return;
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
        body: JSON.stringify(authResp),
      });

      const verificationResult = await resFinish.json();
      console.log('Verification result:', verificationResult);

      if (!resFinish.ok) {
        // 承認が必要な場合 (202 Accepted) は特別な処理
        if (resFinish.status === 202 && verificationResult.status === 'approval_required') {
          console.log('Approval required, redirecting...');
          // 承認待ちページにリダイレクト (requestingDeviceId をクエリパラメータで渡すなど)
          // requestingDeviceId をローカルストレージに保存する必要もある
          localStorage.setItem('requestingDeviceId', verificationResult.requestingDeviceId);
          router.push(`/approve-wait/${verificationResult.requestId}`);
          return;
        }
        throw new Error(verificationResult.error || 'Failed to finish login');
      }

      if (verificationResult.verified) {
        // ログイン成功！ ダッシュボードにリダイレクト
        // ★ 本来はここでサーバーセッションを確立するか、トークンを受け取る
        alert(`Login successful for ${email}!`);
        // 仮ユーザー情報をローカルストレージに保存
        localStorage.setItem('tempUser', JSON.stringify(verificationResult.user));
        router.push('/'); // ルートページへ
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
