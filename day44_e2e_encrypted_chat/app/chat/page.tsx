'use client';

import { useState, useEffect, FormEvent } from 'react';
import {
  generateUserKeys,
  savePrivateKeysToLocalStorage,
  loadPrivateKeysFromLocalStorage,
  exportPublicKeys,
  UserKeys,
  RSA_OAEP_ALGORITHM,
  RSA_PSS_ALGORITHM,
  importPublicKey,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  signData,
  verifySignature,
  strToArrayBuffer,
  arrayBufferToStr,
} from '../_lib/crypto';

interface User {
  id: number;
  username: string;
  publicKey: string;
  encryptPubKey?: CryptoKey;
  signPubKey?: CryptoKey;
}

interface Message {
  id: number;
  senderId: number;
  encryptedMessage: string;
  signature: string;
  iv: string;
  createdAt: string;
  decryptedText?: string;
  senderUsername?: string;
  isOwnMessage?: boolean;
}

export default function ChatPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userKeys, setUserKeys] = useState<Partial<UserKeys> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/users');
        if (!response.ok) throw new Error('Failed to fetch users');
        const data = await response.json();
        const loadedUsers = await Promise.all(data.map(async (user: User) => {
          try {
            const publicKeys = JSON.parse(user.publicKey) as { encryptPubKey: string, signPubKey: string };
            const encryptPubKey = await importPublicKey(publicKeys.encryptPubKey, RSA_OAEP_ALGORITHM, ['encrypt']);
            const signPubKey = await importPublicKey(publicKeys.signPubKey, RSA_PSS_ALGORITHM, ['verify']);
            return { ...user, encryptPubKey, signPubKey };
          } catch (e) {
            console.error(`Failed to parse or import public key for user ${user.username}:`, e);
            return { ...user, encryptPubKey: undefined, signPubKey: undefined };
          }
        }));
        setUsers(loadedUsers);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
      setIsLoading(false);
    };
    fetchUsers();
  }, []);

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      setError('ユーザー名を入力してください。');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const keys = await generateUserKeys();
      const publicKeys = await exportPublicKeys(keys);
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, publicKey: JSON.stringify(publicKeys) }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to register user');
      }
      const newUser = await response.json();
      await savePrivateKeysToLocalStorage(usernameInput, keys);
      const encryptPubKey = await importPublicKey(publicKeys.encryptPubKey, RSA_OAEP_ALGORITHM, ['encrypt']);
      const signPubKey = await importPublicKey(publicKeys.signPubKey, RSA_PSS_ALGORITHM, ['verify']);
      setUsers(prev => [...prev, { ...newUser, encryptPubKey, signPubKey }]);
      setUsernameInput('');
      alert('ユーザー登録が完了しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
    setIsLoading(false);
  };

  const handleUserSelect = async (selectedUsername: string) => {
    const user = users.find(u => u.username === selectedUsername);
    if (user) {
      setCurrentUser(user);
      const keys = await loadPrivateKeysFromLocalStorage(user.username);
      console.log('handleUserSelect - user:', user);
      console.log('handleUserSelect - loaded keys:', keys);
      if (keys && keys.signKeyPair?.privateKey) {
        setUserKeys(keys as UserKeys);
        setError(null);
      } else {
        setUserKeys(keys);
        setError('署名用の秘密鍵が見つかりません。メッセージの送信や表示ができません。');
        console.warn('handleUserSelect - Sign private key not found for user:', user.username, keys);
      }
      setMessages([]);
    } else {
      setCurrentUser(null);
      setUserKeys(null);
      setMessages([]);
    }
  };

  useEffect(() => {
    // console.log('useEffect for polling triggered. Deps:', {
    //   currentUser: currentUser?.id,
    //   userKeysLoaded: !!userKeys?.signKeyPair?.privateKey,
    //   usersLength: users.length
    // });

    const fetchMessages = async () => {
      if (!currentUser || !userKeys?.signKeyPair?.privateKey) return;
      // console.log(`fetchMessages called for user: ${currentUser.id}`);
      // setIsFetchingMessages(true); // ポーリング中は「読み込み中」を表示しない

      try {
        const response = await fetch('/api/messages');
        if (!response.ok) {
          const errData = await response.json();
          console.error('Failed to fetch messages:', errData.error || 'Unknown error');
          return;
        }
        const fetchedMessages: Message[] = await response.json();

        const processedMessages = await Promise.all(
          fetchedMessages.map(async (msg) => {
            let plainText = msg.encryptedMessage;
            let senderUsername = '不明な送信者';
            let signatureValid = false;

            try {
              const sender = users.find(u => u.id === msg.senderId);
              if (sender) {
                senderUsername = sender.username;
                if (sender.signPubKey) {
                  const signatureBuffer = base64ToArrayBuffer(msg.signature);
                  const dataToVerify = strToArrayBuffer(plainText);
                  signatureValid = await verifySignature(
                    signatureBuffer,
                    dataToVerify,
                    sender.signPubKey
                  );
                }
              }

              if (!signatureValid && msg.senderId !== currentUser.id) {
                console.warn("メッセージの署名検証に失敗しました (ポーリング):", msg);
                plainText = `[署名検証失敗] ${plainText}`;
              }
              return {
                ...msg,
                decryptedText: plainText,
                isOwnMessage: msg.senderId === currentUser.id,
                senderUsername
              };
            } catch (e) {
              console.error('Error processing message (polling):', msg.id, e);
              return {
                ...msg,
                decryptedText: '[表示エラー]',
                isOwnMessage: msg.senderId === currentUser.id,
                senderUsername
              };
            }
          })
        );

        // JSON.stringify はオブジェクトの順序にも依存するため、ソート済みの前提で比較
        const currentMessagesStr = JSON.stringify(messages);
        const processedMessagesStr = JSON.stringify(processedMessages);

        if (currentMessagesStr !== processedMessagesStr) {
          // console.log(
          //   'setMessages (polling) will be called. Comparing strings:\n',
          //   'Current (len:', currentMessagesStr.length, '): ', currentMessagesStr.substring(0, 150), '...',
          //   'New (len:', processedMessagesStr.length, '): ', processedMessagesStr.substring(0, 150), '...'
          // );
          // // 詳細な比較のため、コンソールで直接オブジェクトを確認できるようにする
          // if (currentMessagesStr.length < 2000 && processedMessagesStr.length < 2000) { // あまりに長い場合は省略
          //   console.log('Current messages object:', JSON.parse(currentMessagesStr));
          //   console.log('Processed messages object:', JSON.parse(processedMessagesStr));
          // }
          setMessages(processedMessages);
        }
      } catch (err) {
        console.error('Failed to load or process messages (polling):', err);
      } finally {
        // setIsFetchingMessages(false); // ポーリング中は「読み込み中」を表示しない
      }
    };

    if (currentUser && userKeys?.signKeyPair?.privateKey) {
      fetchMessages();
      const intervalId = setInterval(fetchMessages, 5000);
      return () => clearInterval(intervalId);
    }
  }, [currentUser?.id, userKeys, users]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !userKeys?.signKeyPair?.privateKey) {
      setError('メッセージを送信できません。ユーザー情報や鍵が不足しています。');
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      const plainTextMessage = newMessage;
      const dataToSign = strToArrayBuffer(plainTextMessage);
      // console.log('送信時 dataToSign (Base64):', arrayBufferToBase64(dataToSign));
      const signature = await signData(dataToSign, userKeys.signKeyPair.privateKey);

      const payload = {
        senderId: currentUser.id,
        encryptedMessage: plainTextMessage,
        signature: arrayBufferToBase64(signature),
        iv: arrayBufferToBase64(strToArrayBuffer('not_used_group_chat')),
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

      // 新しいメッセージを処理して messages 配列に追加
      let processedNewMessage: Message = { ...newSentMessage };
      try {
        const sender = users.find(u => u.id === newSentMessage.senderId);
        if (sender) {
          processedNewMessage.senderUsername = sender.username;
          if (sender.signPubKey && newSentMessage.signature) {
            const signatureBuffer = base64ToArrayBuffer(newSentMessage.signature);
            const dataToVerify = strToArrayBuffer(newSentMessage.encryptedMessage);
            const signatureValid = await verifySignature(
              signatureBuffer,
              dataToVerify,
              sender.signPubKey
            );
            if (!signatureValid) {
              console.warn("送信直後のメッセージ署名検証に失敗:", newSentMessage);
              processedNewMessage.decryptedText = `[署名検証失敗] ${newSentMessage.encryptedMessage}`;
            } else {
              processedNewMessage.decryptedText = newSentMessage.encryptedMessage;
            }
          } else {
             processedNewMessage.decryptedText = newSentMessage.encryptedMessage;
          }
        } else {
          processedNewMessage.senderUsername = '不明な送信者';
          processedNewMessage.decryptedText = newSentMessage.encryptedMessage;
        }
        processedNewMessage.isOwnMessage = newSentMessage.senderId === currentUser.id;

        // console.log(`setMessages (send) will be called for new message ID: ${processedNewMessage.id}`);
        setMessages(prevMessages => [...prevMessages, processedNewMessage]);
        setNewMessage('');

      } catch(processError) {
          console.error("Error processing new sent message:", processError);
          setMessages(prevMessages => [...prevMessages, {
              ...newSentMessage,
              decryptedText: newSentMessage.encryptedMessage,
              senderUsername: users.find(u => u.id === newSentMessage.senderId)?.username || '不明',
              isOwnMessage: newSentMessage.senderId === currentUser.id,
          }]);
          setNewMessage('');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
    setIsSending(false);
  };

  return (
    <div className="min-h-screen bg-neumo-bg p-4 flex flex-col items-center">
      <header className="w-full max-w-4xl mb-8 text-center">
        <h1 className="text-4xl font-bold text-neumo-text">Day 44 - グループチャット</h1>
      </header>

      {error && <p className="text-red-500 bg-red-100 p-3 rounded-md shadow-neumo-inset mb-4 text-sm">エラー: {error}</p>}
      {isLoading && <p className="text-blue-500">読み込み中...</p>}

      <div className="w-full max-w-2xl bg-white shadow-neumo-outset rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold text-neumo-text mb-4">ユーザー管理</h2>
        <form onSubmit={handleRegister} className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <label htmlFor="username" className="text-gray-600">ユーザー名:</label>
            <input
              id="username"
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="新しいユーザー名"
              className="flex-grow p-2 border border-gray-300 rounded-md shadow-neumo-inset focus:ring-2 focus:ring-neumo-accent focus:border-indigo-500"
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !usernameInput.trim()} className="px-4 py-2 bg-neumo-accent text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 shadow-neumo-outset-sm">
              {isLoading ? '登録中...' : '登録'}
            </button>
          </div>
        </form>

        <div className="mb-4">
          <label htmlFor="userSelect" className="block text-sm font-medium text-neumo-text mb-1">あなたのアカウント:</label>
          <select
            id="userSelect"
            value={currentUser?.username || ''}
            onChange={(e) => handleUserSelect(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-neumo-inset focus:ring-2 focus:ring-neumo-accent focus:border-indigo-500"
            disabled={users.length === 0}
          >
            <option value="">-- ユーザーを選択 --</option>
            {users.map(user => (
              <option key={user.id} value={user.username}>{user.username}</option>
            ))}
          </select>
        </div>
      </div>

      {/* デバッグログ削除 */}
      {/* {(() => { console.log('Render - currentUser:', currentUser, 'userKeys:', userKeys); return null; })()} */}
      {currentUser && userKeys?.signKeyPair?.privateKey && (
        <div className="w-full max-w-2xl bg-white shadow-neumo-outset rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-neumo-text mb-4">グループチャットルーム (参加者: {currentUser.username})</h2>

          <>
            <div className="h-96 overflow-y-auto border border-gray-200 rounded-md p-4 mb-4 bg-gray-50 shadow-neumo-inset">
              {isFetchingMessages && <p className="text-sm text-gray-500">メッセージを読み込み中...</p>}
              {messages.length === 0 && !isFetchingMessages && <p className="text-sm text-gray-500">メッセージはありません。</p>}
              {messages.map(msg => (
                <div key={msg.id} className={`mb-3 p-3 rounded-lg max-w-xs clear-both shadow-neumo-outset-sm ${msg.isOwnMessage ? 'bg-indigo-500 text-white ml-auto float-right' : 'bg-gray-200 text-gray-800 mr-auto float-left'}`}>
                  <p className="text-xs text-opacity-75 mb-1">
                    {msg.senderUsername || '不明な送信者'} - {new Date(msg.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.decryptedText || '[メッセージ内容なし]'}
                  </p>
                  {msg.decryptedText?.startsWith('[署名検証失敗]') && <p className="text-xs text-red-300 mt-1">署名検証失敗</p>}
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="flex items-center gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="メッセージを入力..."
                className="flex-grow p-2 border border-gray-300 rounded-md shadow-neumo-inset focus:ring-2 focus:ring-neumo-accent focus:border-indigo-500"
                disabled={isSending}
              />
              <button type="submit" disabled={isSending || !newMessage.trim()} className="px-4 py-2 bg-neumo-accent text-white rounded-md hover:bg-purple-700 disabled:bg-gray-400 shadow-neumo-outset-sm">
                {isSending ? '送信中...' : '送信'}
              </button>
            </form>
          </>
        </div>
      )}
    </div>
  );
}
