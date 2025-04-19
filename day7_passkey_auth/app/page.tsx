'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

// 仮のユーザー情報型（LocalStorageに保存する形式）
interface TempUser {
  id: string; // PrismaではIDがstring型 (cuid)
  email: string;
}

// パスキー情報型
interface Passkey {
  id: string;
  credentialId: string; // Base64URL encoded string
  deviceName?: string | null;
  transports: string; // JSON形式の文字列
  counter: number;
  createdAt: string;
  lastUsedAt: string;
}

// 承認リクエスト型
interface ApprovalRequest {
  id: string;
  userId: string;
  requestingDeviceId: string; // Identifier for the device requesting approval
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<TempUser | null>(null);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // For specific actions like approve/delete/add

  // --- Login Check ---
  useEffect(() => {
    const storedUser = localStorage.getItem('tempUser');
    console.log('LocalStorage tempUser:', storedUser);

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        console.log('Parsed user data:', parsedUser);

        // Basic validation
        if (parsedUser && typeof parsedUser.id === 'string' && typeof parsedUser.email === 'string') {
          setUser(parsedUser);
          console.log('User set successfully:', parsedUser);
        } else {
          throw new Error("正しくないユーザーデータ形式です");
        }
      } catch (e) {
         console.error("Failed to parse user from localStorage:", e);
         localStorage.removeItem('tempUser'); // Clear invalid data
         router.push('/login');
      }
    } else {
      console.log('No user data found in localStorage, redirecting to login');
      router.push('/login');
    }
  }, [router]);

  // --- Data Fetching ---
  useEffect(() => {
    if (user) {
      setLoading(true);
      setError(null);
      Promise.all([fetchApprovalRequests(), fetchPasskeys()])
        .catch((err) => {
          console.error('Error fetching initial data:', err);
          setError('データの取得中にエラーが発生しました。');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [user]); // Re-fetch if user changes (though unlikely in this flow)

  const fetchApprovalRequests = async () => {
    if (!user) return;
    try {
      console.log('Fetching approval requests for user:', user.id);
      // URLクエリパラメータをログに出力
      const apiUrl = `/api/auth/approval/requests?userId=${user.id}`;
      console.log('API URL:', apiUrl);

      const res = await fetch(apiUrl);

      console.log('Approval requests API response status:', res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('API error response:', errorText);
        throw new Error(`承認リクエストの取得に失敗しました: ${res.status} ${res.statusText} - ${errorText}`);
      }

      const data = await res.json();
      console.log('Approval requests API response data:', data);

      // データの構造を確認
      if (!data.requests || !Array.isArray(data.requests)) {
        console.error('Unexpected API response format:', data);
        throw new Error('APIからの応答形式が不正です');
      }

      // Filter for only pending requests, sort by creation date
      const pendingRequests = data.requests.filter((req: ApprovalRequest) => req.status === 'pending')
          .sort((a: ApprovalRequest, b: ApprovalRequest) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log('Filtered pending requests:', pendingRequests);
      setApprovalRequests(pendingRequests);
    } catch (err: any) {
      console.error('Error fetching approval requests:', err);
      setError((prev) => (prev ? `${prev}\n` : '') + `承認リクエストの取得に失敗しました: ${err.message || '不明なエラー'}`);
    }
  };

  const fetchPasskeys = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/passkeys?userId=${user.id}`);
      if (!res.ok) {
        throw new Error(`パスキーの取得に失敗しました: ${res.statusText}`);
      }
      const data = await res.json();
      setPasskeys(data.passkeys.sort((a: Passkey, b: Passkey) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err: any) {
      console.error('Error fetching passkeys:', err);
      setError((prev) => (prev ? `${prev}
` : '') + `パスキーの取得に失敗しました: ${err.message || '不明なエラー'}`);
    }
  };

  // --- Actions ---

  const handleApprove = async (requestId: string) => {
    if (!user) return;
    setActionLoading(`approve-${requestId}`);
    setError(null);
    try {
      console.log(`Approving request ${requestId} by user ${user.id}`);

      // 1. Start Approval (get authentication options)
      const apiUrl = `/api/auth/approval/requests/${requestId}/approve/start`;
      console.log('Calling API:', apiUrl);

      const startRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id // ユーザーID追加
        },
        body: JSON.stringify({ requestId }), // Request ID
      });

      console.log('Start approval response status:', startRes.status);

      if (!startRes.ok) {
        const errorText = await startRes.text();
        console.error('Start approval error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          console.error('Failed to parse error response as JSON:', e);
          throw new Error(`承認開始に失敗しました: ${startRes.status} ${startRes.statusText}`);
        }
        throw new Error(errorData.error || '承認開始に失敗しました');
      }

      const optionsText = await startRes.text();
      console.log('Authentication options (raw):', optionsText);

      let options: PublicKeyCredentialRequestOptionsJSON;
      try {
        options = JSON.parse(optionsText);
        console.log('Parsed authentication options:', options);
      } catch (e) {
        console.error('Failed to parse authentication options as JSON:', e);
        throw new Error('認証オプションの解析に失敗しました');
      }

      // 2. Perform WebAuthn Authentication
      let authResp: AuthenticationResponseJSON;
      try {
        console.log('Starting authentication with options:', options);
        authResp = await startAuthentication({ optionsJSON: options });
        console.log('Authentication response from browser:', authResp);
      } catch (err: any) {
        console.error('Authentication cancelled or failed', err);
        if (err.name === 'NotAllowedError') {
            throw new Error('認証がキャンセルされました');
        }
        throw new Error(`WebAuthn認証に失敗しました: ${err.message}`);
      }

      // 3. Finish Approval (verify authentication)
      const finishApiUrl = `/api/auth/approval/requests/${requestId}/approve/finish`;
      console.log('Calling API:', finishApiUrl);
      console.log('With payload:', JSON.stringify({
        requestId,
        authenticationResponse: authResp
      }, null, 2));

      const finishRes = await fetch(finishApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id // ユーザーID追加
        },
        body: JSON.stringify({
          requestId,
          authenticationResponse: authResp
        }),
      });

      console.log('Finish approval response status:', finishRes.status);

      if (!finishRes.ok) {
        const errorText = await finishRes.text();
        console.error('Finish approval error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          console.error('Failed to parse error response as JSON:', e);
          throw new Error(`承認完了に失敗しました: ${finishRes.status} ${finishRes.statusText}`);
        }
        throw new Error(errorData.error || '承認完了に失敗しました');
      }

      const result = await finishRes.json();
      console.log('Approval completion result:', result);

      alert('デバイスが承認されました');
      // Refresh requests list
      await fetchApprovalRequests();

    } catch (err: any) {
      console.error('Approval error:', err);
      setError(`承認処理に失敗しました: ${err.message}`);
      // Optionally refresh list even on error if needed
      await fetchApprovalRequests();
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddPasskey = async () => {
    if (!user) return;
    const deviceName = prompt('新しいパスキーのデバイス名を入力してください（例: MacBook Pro）');
    if (!deviceName) return; // User cancelled

    setActionLoading('add-passkey');
    setError(null);
    try {
      // 1. Start Registration
      const startRes = await fetch('/api/passkeys/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName }), // Device name
      });

      if (!startRes.ok) {
        const errorData = await startRes.json();
        throw new Error(errorData.error || 'パスキー登録開始に失敗しました');
      }
      const options = await startRes.json();

      // 2. Perform WebAuthn Registration
      let regResp;
      try {
        regResp = await startRegistration({ optionsJSON: options });
      } catch (err: any) {
        console.error('Registration cancelled or failed', err);
         if (err.name === 'NotAllowedError') {
             throw new Error('パスキー登録がキャンセルされました');
         }
        throw new Error(`WebAuthn登録に失敗しました: ${err.message}`);
      }

      // 3. Finish Registration
      const finishRes = await fetch('/api/passkeys/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName,
          registrationResponse: regResp
        }),
      });

      if (!finishRes.ok) {
         const errorData = await finishRes.json();
         throw new Error(errorData.error || 'パスキー登録完了に失敗しました');
      }

      alert('新しいパスキーが正常に登録されました');
      // Refresh passkey list
      await fetchPasskeys();

    } catch (err: any) {
      console.error('Add passkey error:', err);
      setError(`パスキーの追加に失敗しました: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (!user || !confirm('このパスキーを削除してもよろしいですか？')) return;
    setActionLoading(`delete-${passkeyId}`);
    setError(null);
    try {
      const res = await fetch(`/api/passkeys/${passkeyId}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
         const errorData = await res.json();
         throw new Error(errorData.error || 'パスキーの削除に失敗しました');
      }

      alert('パスキーが削除されました');
      // Refresh passkey list
      await fetchPasskeys();

    } catch (err: any) {
      console.error('Delete passkey error:', err);
      setError(`パスキーの削除に失敗しました: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };


  const handleLogout = () => {
    localStorage.removeItem('tempUser');
    localStorage.removeItem('requestingDeviceId'); // Also clear this if it exists
    setUser(null);
    router.push('/login');
  };


  // --- Render ---

  if (loading && !user) {
    // Initial check before user is set
    return <div className="flex justify-center items-center min-h-screen">読み込み中...</div>;
  }

  if (!user) {
    // Should have been redirected, but as a fallback
    return <div className="flex justify-center items-center min-h-screen">ログインしていません。リダイレクト中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <header className="mb-8 flex justify-between items-center">
        <div>
            <h1 className="text-2xl font-bold">パスキー認証ダッシュボード</h1>
            <p className="text-gray-600 dark:text-gray-300">ようこそ, {user.email} さん</p>
        </div>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded text-sm"
        >
          ログアウト
        </button>
      </header>

       {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6 whitespace-pre-wrap" role="alert">
          <strong className="font-bold">エラー:</strong>
          <span className="block sm:inline"> {error}</span>
           <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3">
             <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
          </button>
        </div>
      )}

      {/* Approval Requests */}
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">保留中のデバイス承認リクエスト</h2>
        {loading ? (
          <p>承認リクエストを読み込み中...</p>
        ) : approvalRequests.length === 0 ? (
          <p className="text-gray-500">保留中の承認リクエストはありません。</p>
        ) : (
          <ul className="space-y-3">
            {approvalRequests.map((req) => (
              <li key={req.id} className="bg-white dark:bg-gray-800 p-4 rounded shadow flex justify-between items-center">
                <div>
                  <p>デバイスID: <code className="text-sm bg-gray-100 dark:bg-gray-700 p-1 rounded">{req.requestingDeviceId.substring(0, 10)}...</code></p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    リクエスト日時: {new Date(req.createdAt).toLocaleString()} |
                    有効期限: {new Date(req.expiresAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleApprove(req.id)}
                  disabled={actionLoading === `approve-${req.id}` || !!actionLoading}
                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading === `approve-${req.id}` ? '承認中...' : '承認する'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Passkey Management */}
      <section>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">登録済みパスキー</h2>
             <button
                 onClick={handleAddPasskey}
                 disabled={actionLoading === 'add-passkey' || !!actionLoading}
                 className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
             >
                 {actionLoading === 'add-passkey' ? '追加中...' : '新しいパスキーを追加'}
             </button>
        </div>

        {loading ? (
          <p>パスキーを読み込み中...</p>
        ) : passkeys.length === 0 ? (
          <p className="text-gray-500">登録済みのパスキーはありません。</p>
        ) : (
          <ul className="space-y-3">
            {passkeys.map((key) => (
              <li key={key.id} className="bg-white dark:bg-gray-800 p-4 rounded shadow flex justify-between items-center">
                <div>
                  <p className="font-medium">{key.deviceName || `パスキー (${key.credentialId.substring(0, 8)}...)`}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    登録日時: {new Date(key.createdAt).toLocaleString()} |
                    最終利用: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : '未使用'} |
                    カウンター: {key.counter}
                  </p>
                </div>
                 <button
                    onClick={() => handleDeletePasskey(key.id)}
                    disabled={actionLoading === `delete-${key.id}` || !!actionLoading}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {actionLoading === `delete-${key.id}` ? '削除中...' : '削除'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
