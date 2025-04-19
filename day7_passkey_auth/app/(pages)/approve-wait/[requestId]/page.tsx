'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ApproveWaitPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!requestId) return;

    const checkStatus = async () => {
      try {
        console.log(`Checking status for request: ${requestId}`);
        const res = await fetch(`/api/auth/approval/requests/${requestId}/status`);

        if (!res.ok) {
          const data = await res.json();
          // 404 はリクエストが見つからない or 期限切れの可能性
          if (res.status === 404) {
            setError('Approval request not found or expired.');
          } else {
            setError(data.error || 'Failed to check status.');
          }
          // エラーが発生したらポーリング停止
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          return;
        }

        const data = await res.json();
        setStatus(data.status);
        console.log(`Request ${requestId} status: ${data.status}`);

        if (data.status === 'approved') {
          // 承認されたらログイン成功とみなし、ダッシュボードへ
          // 本来は /login/finish を再度呼び出すか、トークンを取得するステップが必要かも
          alert('Device approved! Logging in...');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          // 仮ユーザー情報を取得 (本来は login/finish などで取得)
          const email = 'user@example.com'; // 仮
          const userId = 'temp-user-id';   // 仮
          localStorage.setItem('loggedInUser', JSON.stringify({ id: userId, email }));
          router.push('/');
        } else if (data.status === 'rejected' || data.status === 'expired') {
          setError(`Approval was ${data.status}. Please try logging in again.`);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }
        // 'pending' の場合はポーリング継続
      } catch (err: any) {
        console.error('Error checking status:', err);
        setError('An error occurred while checking the approval status.');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      }
    };

    // 初回チェック
    checkStatus();

    // 5秒ごとにステータスをポーリング
    intervalRef.current = setInterval(checkStatus, 5000);

    // コンポーネントのアンマウント時にインターバルをクリア
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [requestId, router]); // requestId と router を依存配列に追加

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-6">Waiting for Approval</h1>
        {error ? (
          <div className="p-4 bg-red-100 text-red-700 border border-red-200 rounded">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
            <a href="/login" className="mt-4 inline-block text-blue-600 hover:text-blue-500">
              Go back to Login
            </a>
          </div>
        ) : (
          <div>
            <p className="text-gray-700 mb-4">
              Please approve the login request from one of your existing devices.
            </p>
            <div className="flex justify-center items-center mb-4">
              <svg
                className="animate-spin h-8 w-8 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <p className="text-sm text-gray-500">Status: {status}</p>
            <p className="text-xs text-gray-400 mt-2">Request ID: {requestId}</p>
          </div>
        )}
      </div>
    </div>
  );
}
