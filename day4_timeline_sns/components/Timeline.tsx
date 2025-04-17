'use client';

import type { Post } from '@/lib/types';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import PostItem from './PostItem';

interface TimelineProps {
  initialPosts: Post[];
}

export default function Timeline({ initialPosts }: TimelineProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // SSE接続を開始
    eventSourceRef.current = new EventSource('/api/posts/stream');
    console.log('Connecting to SSE...');

    eventSourceRef.current.onopen = () => {
      console.log('SSE connection established');
      setIsConnected(true);
    };

    eventSourceRef.current.onerror = (error) => {
      console.error('SSE connection error:', error);
      setIsConnected(false);
      eventSourceRef.current?.close(); // エラー時は閉じる
      // 必要に応じて再接続ロジックをここに追加
    };

    eventSourceRef.current.addEventListener('newPost', (event) => {
      try {
        const newPost = JSON.parse(event.data) as Post;
        console.log('Received new post:', newPost);
        // 新しい投稿をリストの先頭に追加
        setPosts((prevPosts) => [newPost, ...prevPosts]);
      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    });

    // コンポーネントのアンマウント時に接続を閉じる
    return () => {
      console.log('Closing SSE connection...');
      eventSourceRef.current?.close();
      setIsConnected(false);
    };
  }, []); // 初回マウント時のみ実行

  return (
    <div>
      <div className="text-right text-sm mb-2">
        {isConnected ? (
          <span className="text-green-500">● リアルタイム更新中</span>
        ) : (
          <span className="text-red-500">● 接続切れ</span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {posts.length === 0 ? (
          <p>まだ投稿がありません。</p>
        ) : (
          posts.map((post) => <PostItem key={post.id} post={post} />)
        )}
      </AnimatePresence>
    </div>
  );
}
