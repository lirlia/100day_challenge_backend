'use client';

import PostForm from '@/components/PostForm';
import Timeline from '@/components/Timeline';
import type { Post, User } from '@/lib/types'; // 型定義をインポート
import { useEffect, useState } from 'react';

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [initialPosts, setInitialPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const [usersRes, postsRes] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/posts'),
        ]);

        if (!usersRes.ok || !postsRes.ok) {
          throw new Error('Failed to fetch initial data');
        }

        const usersData: User[] = await usersRes.json();
        const postsData: Post[] = await postsRes.json();

        setUsers(usersData);
        setInitialPosts(postsData);
        // 初期ユーザーを選択 (最初のユーザー)
        if (usersData.length > 0) {
          setSelectedUserId(usersData[0].id);
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // 自動投稿機能 (開発用)
  useEffect(() => {
    const intervalId = setInterval(async () => {
      if (users.length > 0) {
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomContent = `これは ${randomUser.name} の自動投稿です ${new Date().toLocaleTimeString()}`;
        try {
          await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: randomContent,
              userId: randomUser.id,
            }),
          });
          // console.log(`Auto-posted for ${randomUser.name}`);
        } catch (autoPostError) {
          console.error('Auto-post failed:', autoPostError);
        }
      }
    }, 5000); // 5秒ごと

    return () => clearInterval(intervalId); // コンポーネントのアンマウント時にクリア
  }, [users]); // users 配列が更新されたら再設定

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Loading...
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-center mt-10">Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">タイムライン</h1>

      {/* ユーザー選択 */}
      <div className="mb-4">
        <label htmlFor="user-select" className="mr-2">
          ユーザー:
        </label>
        <select
          id="user-select"
          value={selectedUserId ?? ''}
          onChange={(e) => setSelectedUserId(Number(e.target.value))}
          className="p-2 border rounded"
          disabled={users.length === 0}
        >
          {users.length === 0 ? (
            <option value="">ユーザーなし</option>
          ) : (
            users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* 投稿フォーム */}
      {selectedUserId && <PostForm userId={selectedUserId} />}

      {/* タイムライン */}
      <Timeline initialPosts={initialPosts} />
    </div>
  );
}
