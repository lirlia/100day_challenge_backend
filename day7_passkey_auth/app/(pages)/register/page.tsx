'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1. 登録開始APIを呼び出し、オプションを取得
      const resStart = await fetch('/api/auth/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!resStart.ok) {
        const data = await resStart.json();
        throw new Error(data.error || 'Failed to start registration');
      }

      const options = await resStart.json();
      console.log('Registration options:', options);

      // 2. ブラウザのWebAuthn APIを呼び出し、パスキー登録を開始
      let attResp;
      try {
        attResp = await startRegistration({ optionsJSON: options });
        console.log('Registration response from browser:', attResp);
      } catch (err: any) {
        // ユーザーがキャンセルした場合など
        if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
            console.log('Passkey registration cancelled by user.');
            setError('Registration cancelled.');
            setIsLoading(false);
            return;
        }
        console.error('Failed during startRegistration:', err);
        throw new Error('Could not create passkey. Please check your device settings or try a different method.');
      }

      // 3. 登録完了APIを呼び出し、レスポンスを送信して検証
      const resFinish = await fetch('/api/auth/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      });

      if (!resFinish.ok) {
        const data = await resFinish.json();
        throw new Error(data.error || 'Failed to finish registration');
      }

      const verificationResult = await resFinish.json();
      console.log('Verification result:', verificationResult);

      if (verificationResult.verified) {
        // 登録成功！ ログインページやダッシュボードにリダイレクトなど
        alert(`Registration successful for ${email}! You can now login.`);
        // 例: router.push('/login');
      } else {
        throw new Error('Registration verification failed.');
      }

    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Register</h1>
        <form onSubmit={handleRegister}>
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Registering...' : 'Register with Passkey'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-blue-600 hover:text-blue-500">
            Login
          </a>
        </p>
      </div>
    </div>
  );
}
