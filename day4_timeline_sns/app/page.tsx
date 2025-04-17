'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import PostForm from '@/components/PostForm';
import Timeline from '@/components/Timeline';
import Sidebar from '@/components/Sidebar';
import { User, Post } from '@/lib/types';

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
            body: JSON.stringify({ content: randomContent, userId: randomUser.id }),
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
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center mt-10">Error: {error}</div>;
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
