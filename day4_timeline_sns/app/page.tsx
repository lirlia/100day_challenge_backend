'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import PostForm from '@/components/PostForm';
import Timeline from '@/components/Timeline';
import Sidebar from '@/components/Sidebar';
import { User, Post, UserWithFollow } from '@/lib/types';

// --- ランダムな部分文字列取得関数 ---
function getRandomSubstring(text: string, minLength: number, maxLength: number): string {
  if (!text || text.length === 0) {
    return '';
  }
  const textLength = text.length;
  // 開始位置をランダムに決定
  const start = Math.floor(Math.random() * (textLength - minLength + 1));
  // 終了位置をランダムに決定 (minLengthからmaxLengthの範囲で)
  const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
  let end = start + length;
  // 念のため、テキストの長さを超えないように調整
  if (end > textLength) {
    end = textLength;
  }
  // 開始位置が終了位置を超えないように（短いテキストの場合など）
  if (start >= end && textLength >= minLength) {
    return text.substring(0, minLength);
  }
  if (start >= end) {
    return text.substring(0, textLength);
  }

  let substring = text.substring(start, end);

  // 文頭や文末の句読点やスペースなどを調整 (簡易的)
  substring = substring.replace(/^[、。\s]+|[、。\s]+$/g, '');

  // 短すぎる場合は元のテキストの先頭を返す
  if (substring.length < minLength && textLength >= minLength) {
    return text.substring(0, minLength);
  }
  if (substring.length < minLength) {
    return text.substring(0, textLength);
  }

  return substring;
}
// --- ここまでランダム部分文字列取得関数 ---

// --- ユーザーIDと絵文字のマッピング ---
const userEmojiList = ['🐶', '🐱', '🐼', '🦊', '🐨', '🦁', '🐯', '🐻', '🐰', '🐸', '🐵', '🐔', '🐧', '🐦', '🦉', '🐺', '🐗', '🐴', '🦄', '🦋', '🐛', '🐌', '🐞', '🐜', '🐝', '🐢', '🐍', '🐙', '🦑', '🐠', '🐬', '🐳', '🦖', '🐉', '🌵'];

// IDに基づいてリストから絵文字を選択する関数
function getEmojiForUserId(userId: number): string {
  const index = (userId - 1) % userEmojiList.length; // ID-1 をリストの長さで割った余りをインデックスとする
  return userEmojiList[index];
}

const defaultEmoji = '👤'; // フォールバック用
// --- ここまで絵文字マッピング ---

export default function Home() {
  const [users, setUsers] = useState<UserWithFollow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string>('');
  const [isFetchingSourceText, setIsFetchingSourceText] = useState(true);

  // ユーザーデータ取得関数 (selectedUserId に依存)
  const fetchUsers = useCallback(async () => {
    if (selectedUserId === null) return;
    console.log(`fetchUsers called for user: ${selectedUserId}`); // 呼び出し確認ログ
    setIsLoadingUsers(true);
    setError(null);
    try {
      const usersRes = await fetch(`/api/users?currentUserId=${selectedUserId}`);
      if (!usersRes.ok) {
        throw new Error('Failed to fetch users data');
      }
      const usersData: UserWithFollow[] = await usersRes.json();
      setUsers(usersData);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message || 'An unknown error occurred while fetching users');
    } finally {
      setIsLoadingUsers(false);
    }
    // fetchUsers 自体は selectedUserId に依存する
  }, [selectedUserId]);

  // ユーザーデータ取得用Effect (fetchUsersを呼び出す)
  useEffect(() => {
    // 初期ユーザーID設定ロジック (初回のみ)
    if (selectedUserId === null && users.length === 0) {
      async function fetchInitialUserId() {
        try {
          const usersRes = await fetch('/api/users'); // フォロー情報なしで一旦取得
          if (!usersRes.ok) throw new Error('Failed to fetch initial user list');
          const initialUsers: User[] = await usersRes.json();
          if (initialUsers.length > 0) {
            setSelectedUserId(initialUsers[0].id); // 最初のユーザーを選択
          } else {
            setError('No users found.'); // ユーザーがいない場合のエラー
            setIsLoadingUsers(false);
          }
        } catch (err: any) {
          console.error('Error fetching initial user ID:', err);
          setError(err.message || 'An unknown error occurred');
          setIsLoadingUsers(false);
        }
      }
      fetchInitialUserId();
    } else if (selectedUserId !== null) {
      fetchUsers(); // selectedUserId が確定したら or 変更されたら fetchUsers を呼ぶ
    }
  }, [selectedUserId, fetchUsers]); // fetchUsers を依存配列に追加

  // 青空文庫テキスト取得用Effect
  useEffect(() => {
    async function fetchSourceText() {
      setIsFetchingSourceText(true);
      setError(null);
      try {
        const res = await fetch('/api/aozora-text');
        if (!res.ok) {
          throw new Error(`Failed to fetch source text (${res.status})`);
        }
        const text = await res.text();
        setSourceText(text);
      } catch (err: any) {
        console.error('Error fetching source text:', err);
        setError(err.message || 'Failed to fetch source text');
      } finally {
        setIsFetchingSourceText(false);
        setIsLoadingUsers(false); // 両方のデータ取得が終わったらローディング完了
      }
    }
    fetchSourceText();
  }, []);

  // 自動投稿機能 (開発用) - 青空文庫テキストから生成
  useEffect(() => {
    // sourceTextがまだ読み込まれていない場合は何もしない
    if (!sourceText || isFetchingSourceText || users.length === 0) {
      return;
    }

    const intervalId = setInterval(async () => {
      const randomUser = users[Math.floor(Math.random() * users.length)];

      try {
        // 青空文庫テキストからランダムな部分文字列を生成 (10〜120文字)
        const postContent = getRandomSubstring(sourceText, 10, 120);

        if (!postContent) return; // 何も生成されなかったらスキップ

        // 生成した文章で投稿
        await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: postContent,
            userId: randomUser.id
          }),
        });
        // console.log(`Auto-posted for ${randomUser.name} from Aozora: ${postContent}`);
      } catch (autoPostError) {
        console.error('Auto-post failed:', autoPostError);
      }
    }, 2500); // 投稿頻度を2.5秒ごとに変更

    return () => clearInterval(intervalId);
  }, [sourceText, isFetchingSourceText, users]); // sourceText, isFetchingSourceText, usersが変わったら再設定

  // フォロー状態変更ハンドラ (引数を追加し、状態を直接更新)
  const handleFollowChange = useCallback((targetUserId: number, newFollowState: boolean) => {
    console.log('handleFollowChange triggered for user:', targetUserId, 'New state:', newFollowState);
    // fetchUsers(); // ユーザーリストの再取得はしない

    setUsers(prevUsers =>
      prevUsers.map(user =>
        user.id === targetUserId
          ? { ...user, isFollowing: newFollowState } // 対象ユーザーの isFollowing を更新
          : user // それ以外のユーザーはそのまま
      )
    );
  }, []); // 依存配列を空に (setUsers は安定している)

  // 全体のローディング状態
  const isLoading = isLoadingUsers || isFetchingSourceText;

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">コンテンツを読み込み中...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center mt-10">エラーが発生しました: {error}</div>;
  }

  const selectedUserEmoji = selectedUserId ? getEmojiForUserId(selectedUserId) : defaultEmoji;

  // ユーザーリストから現在のユーザーを除外（フォローボタン用）
  // const otherUsers = users.filter(u => u.id !== selectedUserId);

  return (
    <div className="flex min-h-screen bg-brand-extra-light-gray">
      <Sidebar
        users={users} // 更新された users が渡る
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        getEmojiForUserId={getEmojiForUserId}
        defaultEmoji={defaultEmoji}
      />

      <main className="flex-1 border-x border-brand-light-gray md:mx-4 pt-0 md:pt-2">
        <div className="p-3 border-b border-brand-light-gray sticky top-0 md:top-2 bg-brand-blue text-white z-10 mt-14 md:mt-0">
          <h1 className="text-xl font-bold">ホーム</h1>
        </div>

        {selectedUserId && (
          <div className="p-3 border-b border-brand-light-gray bg-brand-highlight">
            <PostForm userId={selectedUserId} userEmoji={selectedUserEmoji} />
          </div>
        )}

        <Timeline
          // initialPosts={initialPosts} // 削除
          getEmojiForUserId={getEmojiForUserId}
          defaultEmoji={defaultEmoji}
          selectedUserId={selectedUserId}
          users={users} // 更新された users が渡る
          onFollowToggle={handleFollowChange} // 更新されたハンドラを渡す
        />
      </main>
    </div>
  );
}
