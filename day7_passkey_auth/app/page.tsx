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
  id: number;
  email: string;
}

// パスキー情報型
interface Passkey {
  id: string; // credentialID (Base64URL)
  // webauthnCredentialID is Buffer in DB, but string here for simplicity
  // webauthnCredentialPublicKey: Buffer; // Not typically needed on frontend
  counter: number;
  // transports: string[]; // Example: ['internal', 'usb']
  // isBackupEligible: boolean;
  // isBackedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  nickname?: string | null; // User-defined nickname
}

// 承認リクエスト型
interface ApprovalRequest {
  id: string;
  userId: number;
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
    const storedUser = localStorage.getItem('temp_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        // Basic validation
        if (parsedUser && typeof parsedUser.id === 'number' && typeof parsedUser.email === 'string') {
          setUser(parsedUser);
        } else {
          throw new Error("Invalid user data format");
        }
      } catch (e) {
         console.error("Failed to parse user from localStorage:", e);
         localStorage.removeItem('temp_user'); // Clear invalid data
         router.push('/login');
      }
    } else {
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
      const res = await fetch(`/api/auth/approval/requests?userId=${user.id}`); // Pass userId if needed by API
      if (!res.ok) {
        throw new Error(`Failed to fetch approval requests: ${res.statusText}`);
      }
      const data: ApprovalRequest[] = await res.json();
      // Filter for only pending requests, sort by creation date
      setApprovalRequests(
          data.filter(req => req.status === 'pending')
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    } catch (err: any) {
      console.error('Error fetching approval requests:', err);
      setError((prev) => (prev ? `${prev}
` : '') + `承認リクエストの取得に失敗しました: ${err.message || '不明なエラー'}`);
    }
  };

  const fetchPasskeys = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/passkeys?userId=${user.id}`); // Pass userId
      if (!res.ok) {
        throw new Error(`Failed to fetch passkeys: ${res.statusText}`);
      }
      const data: Passkey[] = await res.json();
       setPasskeys(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
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
      // 1. Start Approval (get authentication options)
      const startRes = await fetch(`/api/auth/approve/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, requestId }), // Send user ID and request ID
      });

      if (!startRes.ok) {
        const errorData = await startRes.json();
        throw new Error(errorData.error || 'Approval start failed');
      }

      const options: PublicKeyCredentialRequestOptionsJSON = await startRes.json();

      // 2. Perform WebAuthn Authentication
      let authResp: AuthenticationResponseJSON;
      try {
        authResp = await startAuthentication({ optionsJSON: options });
      } catch (err: any) {
        console.error('Authentication cancelled or failed', err);
        if (err.name === 'NotAllowedError') {
            throw new Error('認証がキャンセルされました。');
        }
        throw new Error(`WebAuthn認証に失敗しました: ${err.message}`);
      }

      // 3. Finish Approval (verify authentication)
      const finishRes = await fetch(`/api/auth/approve/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, ...authResp }),
      });

      if (!finishRes.ok) {
        const errorData = await finishRes.json();
        throw new Error(errorData.error || 'Approval finish failed');
      }

      alert('デバイスが承認されました。');
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
    setActionLoading('add-passkey');
    setError(null);
    try {
      // 1. Start Registration
      const startRes = await fetch('/api/passkeys/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }), // Send user info
      });

      if (!startRes.ok) {
        const errorData = await startRes.json();
        throw new Error(errorData.error || 'Passkey registration start failed');
      }
      const options: PublicKeyCredentialCreationOptionsJSON = await startRes.json();

      // 2. Perform WebAuthn Registration
      let regResp: RegistrationResponseJSON;
      try {
        regResp = await startRegistration({ optionsJSON: options });
      } catch (err: any) {
        console.error('Registration cancelled or failed', err);
         if (err.name === 'NotAllowedError') {
             throw new Error('パスキー登録がキャンセルされました。');
         }
        throw new Error(`WebAuthn登録に失敗しました: ${err.message}`);
      }

      // 3. Finish Registration
      const finishRes = await fetch('/api/passkeys/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...regResp }), // Send user ID with response
      });

      if (!finishRes.ok) {
         const errorData = await finishRes.json();
         throw new Error(errorData.error || 'Passkey registration finish failed');
      }

      alert('新しいパスキーが正常に登録されました。');
      // Refresh passkey list
      await fetchPasskeys();

    } catch (err: any) {
      console.error('Add passkey error:', err);
      setError(`パスキーの追加に失敗しました: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeletePasskey = async (credentialID: string) => {
    if (!user || !confirm('このパスキーを削除してもよろしいですか？')) return;
    setActionLoading(`delete-${credentialID}`);
    setError(null);
    try {
      const res = await fetch(`/api/passkeys/${credentialID}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }), // Send userId for authorization on the backend
      });

      if (!res.ok) {
         const errorData = await res.json();
         throw new Error(errorData.error || 'Failed to delete passkey');
      }

      alert('パスキーが削除されました。');
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
    localStorage.removeItem('temp_user');
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
            <h1 className="text-2xl font-bold">ダッシュボード</h1>
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
                   {/* 仮のニックネーム表示。本来は編集機能などがあっても良い */}
                  <p className="font-medium">{key.nickname || `Passkey (ID: ${key.id.substring(0, 8)}...)`}</p>
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
