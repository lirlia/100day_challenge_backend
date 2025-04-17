'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import PostForm from '@/components/PostForm';
import Timeline from '@/components/Timeline';
import Sidebar from '@/components/Sidebar';
import { User, Post } from '@/lib/types';

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

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [initialPosts, setInitialPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string>(''); // 青空文庫テキスト用state
  const [isFetchingSourceText, setIsFetchingSourceText] = useState(true); // テキスト取得中フラグ

  // 初期データ(User, Post)取得用Effect
  useEffect(() => {
    async function fetchInitialData() {
      // setIsLoading(true); // isFetchingSourceText で管理するためコメントアウト
      // setError(null);
      try {
        const [usersRes, postsRes] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/posts'),
        ]);

        if (!usersRes.ok || !postsRes.ok) {
          throw new Error('Failed to fetch initial user/post data');
        }

        const usersData: User[] = await usersRes.json();
        const postsData: Post[] = await postsRes.json();

        setUsers(usersData);
        setInitialPosts(postsData);
        if (usersData.length > 0) {
          setSelectedUserId(usersData[0].id);
        }
      } catch (err: any) {
        console.error('Error fetching initial data:', err);
        setError(err.message || 'An unknown error occurred fetching initial data');
      } finally {
        // setIsLoading(false); // isFetchingSourceText で管理
      }
    }
    fetchInitialData();
  }, []);

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
        setIsLoading(false); // 両方のデータ取得が終わったらローディング完了
      }
    }
    fetchSourceText();
  }, []); // 初回のみ実行

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
    }, 5000); // 5秒ごと

    return () => clearInterval(intervalId);
  }, [sourceText, isFetchingSourceText, users]); // sourceText, isFetchingSourceText, usersが変わったら再設定

  if (isLoading || isFetchingSourceText) {
    return <div className="flex justify-center items-center h-screen">コンテンツを読み込み中...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center mt-10">エラーが発生しました: {error}</div>;
  }

  return (
    <div className="flex min-h-screen bg-brand-extra-light-gray">
      {/* 左サイドバー */}
      <Sidebar
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
      />

      {/* メインコンテンツ */}
      <main className="flex-1 border-x border-brand-light-gray md:mx-4 pt-0 md:pt-2">
        <div className="p-3 border-b border-brand-light-gray sticky top-0 md:top-2 bg-brand-blue text-white z-10 mt-14 md:mt-0">
          <h1 className="text-xl font-bold">ホーム</h1>
        </div>

        {selectedUserId && (
          <div className="p-3 border-b border-brand-light-gray bg-brand-highlight">
            <PostForm userId={selectedUserId} />
          </div>
        )}

        <Timeline initialPosts={initialPosts} />
      </main>
    </div>
  );
}
