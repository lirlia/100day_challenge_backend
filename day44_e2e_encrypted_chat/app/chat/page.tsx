'use client';

import { useState, useEffect, FormEvent } from 'react';
import {
  generateUserKeys, // これを再度有効化
  savePrivateKeysToLocalStorage,
  loadPrivateKeysFromLocalStorage,
  exportPublicKeys,
  UserKeys,
  RSA_OAEP_ALGORITHM, // これがインポートされていることを確認
  RSA_PSS_ALGORITHM,
  AES_GCM_ALGORITHM,
  importPublicKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  strToArrayBuffer,
  arrayBufferToStr,
  encryptMessage,
  decryptMessage,
  signData,
  verifySignature,
  prepareDataForSigning
  // generateAndExportFixedKeysForUser は削除
} from '../_lib/crypto';

interface User {
  id: number;
  username: string;
  publicKey: string | null; // NULL許容に変更
  encryptPubKeyObj?: CryptoKey;
  signPubKeyObj?: CryptoKey;
}

interface Message {
  id: number;
  senderId: number;
  recipientId: number;
  encryptedSymmetricKey: string;
  encryptedMessage: string;
  signature: string;
  iv: string;
  createdAt: string;
  decryptedText?: string;
  senderUsername?: string;
  isOwnMessage?: boolean;
  signatureVerified?: boolean;
}

export default function ChatPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userKeys, setUserKeys] = useState<Partial<UserKeys> | null>(null);
  const [recipient, setRecipient] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState(''); // ユーザー登録フォーム用
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedMessageForModal, setSelectedMessageForModal] = useState<Message | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attemptUserForDecryption, setAttemptUserForDecryption] = useState<User | null>(null);
  const [decryptionAttemptResult, setDecryptionAttemptResult] = useState<string | null>(null);

  // Error state monitoring (デバッグ用)
  useEffect(() => {
    console.log('[useEffect errorMonitor] Error state changed:', error);
  }, [error]);

  // 初回ロード時にユーザーリストを取得
  useEffect(() => {
    const initializeApp = async () => {
      setIsLoading(true);
      setError(null);
      console.log('[initializeApp] Starting initialization, error cleared.');
      try {
        // 固定ユーザーの秘密鍵をlocalStorageに保存する処理は削除
        console.log('[initializeApp] Fetching users from API...');
        const response = await fetch('/api/users');
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Failed to fetch users. Status: ${response.status}, Body: ${errText}`);
        }
        const data: User[] = await response.json();
        console.log('[initializeApp] Fetched users:', data.map(u => u.username));

        const loadedUsers = await Promise.all(data.map(async (user) => {
          try {
            if (user.publicKey) {
              console.log(`[initializeApp] Processing user: ${user.username} with public key`);
              const publicKeys = JSON.parse(user.publicKey) as { encryptPubKey: string, signPubKey: string };
              const encryptPubKeyObj = await importPublicKey(publicKeys.encryptPubKey, RSA_OAEP_ALGORITHM, ['encrypt']);
              const signPubKeyObj = await importPublicKey(publicKeys.signPubKey, RSA_PSS_ALGORITHM, ['verify']);
              console.log(`[initializeApp] Imported public keys for ${user.username}`);
              return { ...user, encryptPubKeyObj, signPubKeyObj };
            } else {
              console.log(`[initializeApp] Processing user: ${user.username} without public key`);
              return { ...user, encryptPubKeyObj: undefined, signPubKeyObj: undefined };
            }
          } catch (e) {
            const importErrorMsg = `Failed to parse or import public key for user ${user.username}: ${e instanceof Error ? e.message : String(e)}`;
            console.error(`[initializeApp] ${importErrorMsg}`, e);
            return { ...user, encryptPubKeyObj: undefined, signPubKeyObj: undefined };
          }
        }));
        setUsers(loadedUsers);
        console.log('[initializeApp] Successfully loaded and processed users.');

      } catch (err) {
        const initErrorMsg = err instanceof Error ? err.message : 'Initialization failed';
        setError(initErrorMsg);
        console.error('[initializeApp] Initialization failed with error. Setting error state:', initErrorMsg, err);
      }
      setIsLoading(false);
      console.log('[initializeApp] Initialization complete. isLoading set to false.');
    };
    initializeApp();
  }, []);

  const fetchAllUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users after registration');
      const data: User[] = await response.json();
      const loadedUsers = await Promise.all(data.map(async (user) => {
        if (user.publicKey) {
          const publicKeys = JSON.parse(user.publicKey) as { encryptPubKey: string, signPubKey: string };
          const encryptPubKeyObj = await importPublicKey(publicKeys.encryptPubKey, RSA_OAEP_ALGORITHM, ['encrypt']);
          const signPubKeyObj = await importPublicKey(publicKeys.signPubKey, RSA_PSS_ALGORITHM, ['verify']);
          return { ...user, encryptPubKeyObj, signPubKeyObj };
        } return { ...user, encryptPubKeyObj: undefined, signPubKeyObj: undefined };
      }));
      setUsers(loadedUsers);
      return loadedUsers;
    } catch (err) {
      console.error('Error fetching all users:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh user list');
      return [];
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      setError('ユーザー名を入力してください。');
      return;
    }
    setIsRegistering(true);
    setError(null);
    try {
      // 1. ユーザー登録 (公開鍵なしで)
      let registerResponse = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput }),
      });

      if (!registerResponse.ok) {
        const errData = await registerResponse.json();
        throw new Error(errData.error || 'ユーザー登録に失敗しました。');
      }
      const newRegisteredUser: User = await registerResponse.json();
      console.log('[handleRegister] User registered:', newRegisteredUser);

      // 2. 鍵ペア生成
      console.log('[handleRegister] Generating keys for:', newRegisteredUser.username);
      const newKeys = await generateUserKeys();
      console.log('[handleRegister] Keys generated.');

      // 3. 秘密鍵をlocalStorageに保存
      await savePrivateKeysToLocalStorage(newRegisteredUser.username, newKeys);
      console.log('[handleRegister] Private keys saved to localStorage.');

      // 4. 公開鍵をエクスポートしてDBに保存
      const publicKeysToSave = await exportPublicKeys(newKeys);
      const publicKeyJsonString = JSON.stringify(publicKeysToSave);
      console.log('[handleRegister] Exported public keys:', publicKeyJsonString);

      const updateKeyResponse = await fetch(`/api/users/${newRegisteredUser.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicKey: publicKeyJsonString }),
        }
      );
      console.log('[handleRegister] Update key response status:', updateKeyResponse.status);
      const updateKeyResponseText = await updateKeyResponse.text(); // まずテキストで取得
      console.log('[handleRegister] Update key response text:', updateKeyResponseText);

      if (!updateKeyResponse.ok) {
        let errData;
        try {
            errData = JSON.parse(updateKeyResponseText); // ここでパース試行
        } catch (e) {
            console.error('[handleRegister] Failed to parse update key response as JSON:', e);
            throw new Error(`公開鍵の保存に失敗しました。サーバーからの応答が不正です: ${updateKeyResponseText}`);
        }
        throw new Error(errData.error || '公開鍵の保存に失敗しました。');
      }
      const userWithPublicKey: User = JSON.parse(updateKeyResponseText); // 成功時のみパース
      console.log('[handleRegister] Public key saved to DB for user:', userWithPublicKey);

      // 5. ユーザーリストを更新し、現在のユーザーとして設定
      console.log('[handleRegister] Fetching all users again to update list...');
      const updatedUsers = await fetchAllUsers();
      console.log('[handleRegister] Fetched users for update:', updatedUsers.map(u=>u.username));
      const newlyRegisteredUserInList = updatedUsers.find(u => u.id === newRegisteredUser.id);
      console.log('[handleRegister] Found newly registered user in updated list:', newlyRegisteredUserInList);

      if (newlyRegisteredUserInList) {
        setCurrentUser(newlyRegisteredUserInList);
        setUserKeys(newKeys as UserKeys); // 生成した鍵をセット
        setUsernameInput(''); //入力欄クリア
        console.log('[handleRegister] Registration complete, user set as current.');
      } else {
        throw new Error('登録したユーザーがリストに見つかりません。')
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : '登録プロセスでエラーが発生しました。');
      console.error('[handleRegister] Error:', err);
      setIsRegistering(false);
      return;
    }
    setIsRegistering(false);
    console.log(`[handleRegister] Finished registration process for ${currentUser?.username || "newly registered user"}. isRegistering: false`);
  };

  const handleUserSelect = async (selectedUsername: string) => {
    const user = users.find(u => u.username === selectedUsername);
    console.log('[handleUserSelect] Selected user:', user?.username);
    if (user) {
      setCurrentUser(user);
      setRecipient(null);
      setMessages([]);
      setError(null);
      console.log('[handleUserSelect] Cleared error, recipient, messages for new user.');
      try {
        const keys = await loadPrivateKeysFromLocalStorage(user.username);
        console.log('[handleUserSelect] Loaded keys from localStorage:', keys);
        if (keys?.encryptKeyPair?.privateKey && keys?.signKeyPair?.privateKey) {
          setUserKeys(keys as UserKeys);
          setError(null);
          console.log(`[handleUserSelect] Successfully loaded keys for ${user.username}`);
        } else {
          setUserKeys(null);
          const errMsg = `あなたの秘密鍵がlocalStorageに見つかりません (${user.username})。メッセージの送受信を行うには、一度ログアウトして再登録するか、鍵をエクスポート/インポートする機能が必要です。`;
          setError(errMsg);
          console.warn(`[handleUserSelect] Failed to load complete keys for ${user.username}. Setting error:`, errMsg, 'Keys loaded:', keys);
        }
      } catch (e) {
        setUserKeys(null);
        const errMsg = `秘密鍵の処理中にエラーが発生しました (${user.username}): ${e instanceof Error ? e.message : String(e)}`;
        setError(errMsg);
        console.error('[handleUserSelect] Error during loadPrivateKeysFromLocalStorage or subsequent processing:', e, 'Setting error:', errMsg);
      }
    } else {
      setCurrentUser(null);
      setUserKeys(null);
      setRecipient(null);
      setMessages([]);
      setError(null);
      console.log('[handleUserSelect] No user selected or user not found, cleared state.');
    }
  };

  const handleRecipientSelect = (selectedUsername: string) => {
    const selectedRecipient = users.find(u => u.username === selectedUsername);
    if (selectedRecipient && selectedRecipient.id !== currentUser?.id) {
      if (!selectedRecipient.publicKey || !selectedRecipient.encryptPubKeyObj) {
        setError(`選択した相手 (${selectedRecipient.username}) の公開鍵が設定されていません。メッセージを送信できません。`);
        setRecipient(null);
        return;
      }
      setRecipient(selectedRecipient);
      setMessages([]);
      setError(null);
    } else if (!selectedUsername) {
        setRecipient(null);
        setMessages([]);
    } else {
      setError("無効な相手か、自分自身は選択できません。");
    }
  };

  // メッセージ取得 (ポーリング)
  useEffect(() => {
    const fetchMessages = async () => {
      if (!currentUser || !recipient || !userKeys?.signKeyPair?.privateKey || !userKeys?.encryptKeyPair?.privateKey) {
          return;
      }
      if (!recipient.encryptPubKeyObj || !recipient.signPubKeyObj) { // 相手の公開鍵がない場合
          // console.log("[fetchMessages] Recipient public key not available, skipping fetch.");
          return;
      }
      console.log(`[fetchMessages] Fetching for ${currentUser.username} and ${recipient.username}`);
      try {
        const queryParams = new URLSearchParams({
          userId1: String(currentUser.id),
          userId2: String(recipient.id),
        });
        const response = await fetch(`/api/messages?${queryParams.toString()}`);

        if (!response.ok) {
          const errData = await response.json();
          const errMsg = `メッセージ取得失敗 (API): ${errData.error || 'Unknown error'}`;
          console.error('[fetchMessages] Failed to fetch messages from API:', errMsg);
          return;
        }
        const fetchedMessages: Message[] = await response.json();

        const processedMessages = await Promise.all(
          fetchedMessages.map(async (msg) => {
            let decryptedText = '[復号できませんでした]';
            let signatureVerified = false;
            const sender = users.find(u => u.id === msg.senderId);

            try {
              if (sender?.signPubKeyObj) {
                 const dataToVerify = prepareDataForSigning(
                    base64ToArrayBuffer(msg.encryptedSymmetricKey),
                    base64ToArrayBuffer(msg.iv), // ArrayBufferとして渡す
                    base64ToArrayBuffer(msg.encryptedMessage)
                  );
                signatureVerified = await verifySignature(
                  base64ToArrayBuffer(msg.signature),
                  dataToVerify,
                  sender.signPubKeyObj
                );
              }

              if (msg.recipientId === currentUser.id && userKeys?.encryptKeyPair?.privateKey) {
                decryptedText = await decryptMessage(
                  base64ToArrayBuffer(msg.encryptedSymmetricKey),
                  base64ToArrayBuffer(msg.iv), // ArrayBufferとして渡す
                  base64ToArrayBuffer(msg.encryptedMessage),
                  userKeys.encryptKeyPair.privateKey
                );
              } else if (msg.senderId === currentUser.id) {
                decryptedText = '[暗号化済メッセージ(自分送信)]';
              }

              if (!signatureVerified && msg.senderId !== currentUser.id) {
                console.warn("メッセージ署名検証失敗(ポーリング):", msg);
                decryptedText = `[署名検証失敗] ${decryptedText}`;
              }
              return {
                ...msg,
                decryptedText,
                senderUsername: sender?.username || '不明な送信者',
                isOwnMessage: msg.senderId === currentUser.id,
                signatureVerified,
              };
            } catch (e) {
              console.error('Error processing message (polling): digesting or decrypting', msg.id, e);
              return {
                 ...msg,
                 decryptedText: '[メッセージ処理エラー]',
                 senderUsername: sender?.username || 'エラー時の送信者不明',
                 isOwnMessage: msg.senderId === currentUser.id,
                 signatureVerified: false,
               };
            }
          })
        );

        const currentMessagesStr = JSON.stringify(messages.map(m => m.id + (m.decryptedText || '')));
        const processedMessagesStr = JSON.stringify(processedMessages.map(m => m.id + (m.decryptedText || '')));

        if (currentMessagesStr !== processedMessagesStr) {
          setMessages(processedMessages);
        }
      } catch (err) {
        console.error('Failed to load or process messages (polling): outer catch', err);
      }
    };

    if (currentUser?.id && recipient?.id && userKeys?.signKeyPair?.privateKey && userKeys?.encryptKeyPair?.privateKey && recipient.encryptPubKeyObj) {
      fetchMessages();
      const intervalId = setInterval(fetchMessages, 5000);
      return () => clearInterval(intervalId);
    }
  }, [currentUser, recipient, userKeys, users, messages]); // messagesを依存配列に追加


  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !userKeys?.signKeyPair?.privateKey || !userKeys?.encryptKeyPair?.privateKey || !recipient || !recipient.encryptPubKeyObj) {
      setError('メッセージを送信できません。ユーザー情報、相手の情報、または鍵が不足しています。');
      return;
    }
    setIsSending(true);
    setError(null);

    try {
      const plainTextMessage = newMessage;
      const { encryptedSymmetricKey, iv, encryptedData } = await encryptMessage(
        plainTextMessage,
        recipient.encryptPubKeyObj
      );

      const dataToSign = prepareDataForSigning(
        encryptedSymmetricKey,
        iv.buffer as ArrayBuffer, // iv は Uint8Array で返ってくるので .buffer を使う
        encryptedData
      );
      const signature = await signData(dataToSign, userKeys.signKeyPair.privateKey);

      const payload = {
        senderId: currentUser.id,
        recipientId: recipient.id,
        encryptedSymmetricKey: arrayBufferToBase64(encryptedSymmetricKey),
        encryptedMessage: arrayBufferToBase64(encryptedData),
        signature: arrayBufferToBase64(signature),
        iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
      };

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to send message');
      }
      const newSentMessage: Message = await response.json();

      const processedNewSentMessage: Message = {
        ...newSentMessage,
        decryptedText: `[暗号化済] ${plainTextMessage}`,
        senderUsername: currentUser.username,
        isOwnMessage: true,
        signatureVerified: true,
      };
      setMessages(prevMessages => [...prevMessages, processedNewSentMessage]);
      setNewMessage('');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      console.error("Send message error:", err);
    }
    setIsSending(false);
  };

  // モーダル制御関数 (追加)
  const handleOpenModal = (message: Message) => {
    setSelectedMessageForModal(message);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMessageForModal(null);
    setAttemptUserForDecryption(null);
    setDecryptionAttemptResult(null);
  };

  // 復号試行ハンドラ (追加)
  const handleDecryptionAttempt = async () => {
    if (!selectedMessageForModal || !attemptUserForDecryption) return;

    setDecryptionAttemptResult('試行中...');
    try {
      const keys = await loadPrivateKeysFromLocalStorage(attemptUserForDecryption.username);
      if (!keys || !keys.encryptKeyPair?.privateKey) {
        setDecryptionAttemptResult(`${attemptUserForDecryption.username} の秘密鍵が見つかりません。`);
        return;
      }

      const encryptedSymmetricKeyBuffer = base64ToArrayBuffer(selectedMessageForModal.encryptedSymmetricKey);

      // crypto.subtle.decrypt を使用して復号を試みる
      // 本来の decryptMessage は共通鍵とメッセージ本文両方を処理するが、ここでは共通鍵のみ
      await crypto.subtle.decrypt(
        RSA_OAEP_ALGORITHM, // これは _lib/crypto.ts からインポートが必要
        keys.encryptKeyPair.privateKey,
        encryptedSymmetricKeyBuffer
      );
      // もし上の行がエラーを投げずに成功した場合、それは問題（他のユーザーが復号できたことになる）
      setDecryptionAttemptResult(`${attemptUserForDecryption.username} の秘密鍵で共通鍵を復号できてしまいました。(E2E暗号化の原則に反します)`);
    } catch (e) {
      // 復号に失敗するのは期待通り
      console.info('Decryption attempt failed (expected for other users):', e);
      setDecryptionAttemptResult(`${attemptUserForDecryption.username} の秘密鍵では、このメッセージの共通鍵を期待通り復号できませんでした。`);
    }
  };

  return (
    <div className="min-h-screen bg-neumo-bg p-4 flex flex-col items-center">
      <header className="w-full max-w-4xl mb-8 text-center">
        <h1 className="text-4xl font-bold text-neumo-text">Day 44 - E2E暗号化チャット (動的鍵生成)</h1>
      </header>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded-md shadow-neumo-inset mb-4 text-sm">エラー: {error}</p>}
      {isLoading && <p className="text-blue-500">ユーザーリストを読み込み中...</p>}

      <div className="w-full max-w-2xl bg-white shadow-neumo-outset rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold text-neumo-text mb-4">アカウント管理</h2>

        <form onSubmit={handleRegister} className="mb-6 pb-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-neumo-text mb-2">新規ユーザー登録</h3>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="新しいユーザー名を入力"
              className="flex-grow p-2 border border-gray-300 rounded-md shadow-neumo-inset focus:ring-2 focus:ring-neumo-accent"
              disabled={isRegistering}
            />
            <button
              type="submit"
              disabled={isRegistering || !usernameInput.trim()}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400 shadow-neumo-outset-sm"
            >
              {isRegistering ? '登録中...' : '登録 & 鍵生成'}
            </button>
          </div>
        </form>

        <div className="mb-4">
          <label htmlFor="userSelect" className="block text-sm font-medium text-neumo-text mb-1">あなたのアカウント:</label>
          <select
            id="userSelect"
            value={currentUser?.username || ''}
            onChange={(e) => handleUserSelect(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-neumo-inset focus:ring-2 focus:ring-neumo-accent"
            disabled={users.length === 0 || isLoading || isRegistering}
          >
            <option value="">-- 自分を選択 --</option>
            {users.map(user => (
              <option key={user.id} value={user.username}>{user.username}</option>
            ))}
          </select>
        </div>

        {currentUser && (
          <div className="mb-4">
            <label htmlFor="recipientSelect" className="block text-sm font-medium text-neumo-text mb-1">会話する相手:</label>
            <select
              id="recipientSelect"
              value={recipient?.username || ''}
              onChange={(e) => handleRecipientSelect(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-neumo-inset focus:ring-2 focus:ring-neumo-accent"
              disabled={!currentUser || users.length <= 1}
            >
              <option value="">-- 相手を選択 --</option>
              {users.filter(user => user.id !== currentUser.id).map(user => (
                <option key={user.id} value={user.username} disabled={!user.publicKey}>
                  {user.username} {!user.publicKey ? '(公開鍵なし)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {currentUser && recipient && (
        <div className="w-full max-w-2xl bg-white shadow-neumo-outset rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-neumo-text mb-4">
            Chat with {recipient.username}
            <span className="text-sm ml-2 text-gray-500">(自分: {currentUser.username})</span>
          </h2>

          <div className="h-96 overflow-y-auto border border-gray-200 rounded-md p-4 mb-4 bg-gray-50 shadow-neumo-inset">
            {messages.length === 0 && !error && <p className="text-sm text-gray-500">メッセージはありません。</p>}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`mb-3 p-3 rounded-lg max-w-xs clear-both shadow-neumo-outset-sm ${msg.isOwnMessage ? 'bg-indigo-500 text-white ml-auto float-right' : 'bg-gray-200 text-gray-800 mr-auto float-left'}`}
                title={`Msg ID: ${msg.id}, Sent: ${new Date(msg.createdAt).toLocaleString()}`}
              >
                <p className="text-xs text-opacity-75 mb-1">
                  {msg.senderUsername || '不明'}
                  {msg.signatureVerified === false && !msg.isOwnMessage && <span className="text-red-300 ml-1">(署名検証失敗!)</span>}
                  {msg.signatureVerified === true && !msg.isOwnMessage && <span className="text-green-300 ml-1">(署名OK)</span>}
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {msg.decryptedText || '[メッセージ内容なし]'}
                </p>
                <button
                  onClick={() => handleOpenModal(msg)}
                  className="mt-1 text-xs text-blue-500 hover:text-blue-700 underline"
                >
                  詳細
                </button>
                <details className="text-xs mt-1 opacity-60 cursor-pointer">
                    <summary>詳細</summary>
                    <p>IV: {msg.iv.substring(0,10)}...</p>
                    <p>EncSymKey: {msg.encryptedSymmetricKey.substring(0,10)}...</p>
                    <p>Signature: {msg.signature.substring(0,10)}...</p>
                </details>
              </div>
            ))}
          </div>

          {userKeys?.signKeyPair?.privateKey && userKeys?.encryptKeyPair?.privateKey && recipient.publicKey ? (
            <>
              <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="暗号化メッセージを入力..."
                  className="flex-grow p-2 border border-gray-300 rounded-md shadow-neumo-inset focus:ring-2 focus:ring-neumo-accent"
                  disabled={isSending || !recipient}
                />
                <button
                  type="submit"
                  disabled={isSending || !newMessage.trim() || !recipient}
                  className="px-4 py-2 bg-neumo-accent text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 shadow-neumo-outset-sm"
                >
                  {isSending ? '送信中...' : '送信'}
                </button>
              </form>
              <div className="mt-2 text-xs text-gray-500">
                <p>E2E暗号化: AES-GCM (共通鍵) + RSA-OAEP (共通鍵の暗号化)</p>
                <p>署名: RSA-PSS</p>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-500">
              {currentUser && recipient && !recipient.publicKey ? `相手 (${recipient.username}) の公開鍵が未設定のためメッセージを送信できません。` : 'あなたの秘密鍵がロードされていないか、相手が選択されていないか、相手の公開鍵が未設定のため、メッセージを送信できません。'}
            </p>
          )}
        </div>
      )}

      {/* モーダル (追加) */}
      {isModalOpen && selectedMessageForModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-lg shadow-neumo-outset max-w-lg w-full">
            <h3 className="text-xl font-semibold text-neumo-text mb-4">メッセージ詳細 (ID: {selectedMessageForModal.id})</h3>

            <p className="text-sm mb-2"><strong>送信者:</strong> {users.find(u => u.id === selectedMessageForModal.senderId)?.username || '不明'}</p>
            <p className="text-sm mb-2"><strong>受信者:</strong> {users.find(u => u.id === selectedMessageForModal.recipientId)?.username || '不明'}</p>
            <p className="text-sm mb-2 break-all"><strong>暗号化された共通鍵:</strong> {selectedMessageForModal.encryptedSymmetricKey}</p>
            <p className="text-sm mb-2"><strong>IV:</strong> {selectedMessageForModal.iv}</p>
            <p className="text-sm mb-4 break-all"><strong>暗号化メッセージ:</strong> {selectedMessageForModal.encryptedMessage}</p>
            <p className="text-sm mb-4 break-all"><strong>署名:</strong> {selectedMessageForModal.signature}</p>

            {/* ここに「他のユーザーとして復号試行」セクションを追加予定 */}
            <div className="mt-6 border-t pt-4">
              <h4 className="text-md font-semibold text-neumo-text mb-2">他のユーザーとして共通鍵の復号を試みる:</h4>
              { currentUser && selectedMessageForModal && (
                <select
                  value={attemptUserForDecryption?.id || ''}
                  onChange={(e) => {
                    const selectedId = parseInt(e.target.value, 10);
                    const userToAttempt = users.find(u =>
                      u.id === selectedId &&
                      u.id !== selectedMessageForModal.senderId &&
                      u.id !== selectedMessageForModal.recipientId
                    );
                    setAttemptUserForDecryption(userToAttempt || null);
                    setDecryptionAttemptResult(null); // ユーザー変更時に結果をリセット
                  }}
                  className="w-full p-2 border border-gray-300 rounded-md shadow-neumo-inset mb-2"
                >
                  <option value="">-- 試行するユーザーを選択 --</option>
                  {users
                    .filter(u => u.id !== selectedMessageForModal.senderId && u.id !== selectedMessageForModal.recipientId)
                    .map(user => (
                      <option key={user.id} value={user.id}>{user.username}</option>
                  ))}
                </select>
              )}
              {attemptUserForDecryption && (
                <button
                  onClick={handleDecryptionAttempt}
                  className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 shadow-neumo-outset-sm w-full mb-2"
                >
                  {attemptUserForDecryption.username} として復号試行
                </button>
              )}
              {decryptionAttemptResult && (
                <p className={`text-sm p-2 rounded-md ${decryptionAttemptResult.includes('期待通り') ? 'bg-green-100 text-green-700' : decryptionAttemptResult.includes('試行中') ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  {decryptionAttemptResult}
                </p>
              )}
            </div>

            <button
              onClick={handleCloseModal}
              className="mt-4 px-4 py-2 bg-gray-300 text-neumo-text rounded-md hover:bg-gray-400 shadow-neumo-outset-sm"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
