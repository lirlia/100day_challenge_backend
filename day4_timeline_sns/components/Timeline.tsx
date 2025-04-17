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
  const [newPost, setNewPost] = useState<Post | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [newPostsCount, setNewPostsCount] = useState(0);
  const [showNewPosts, setShowNewPosts] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayedPosts, setDisplayedPosts] = useState<Post[]>([]);
  const [allPostsLoaded, setAllPostsLoaded] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

      // 5秒後に再接続を試行
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          eventSourceRef.current = new EventSource('/api/posts/stream');
          console.log('Trying to reconnect to SSE...');
        }
      }, 5000);
    };

    eventSourceRef.current.addEventListener('newPost', (event) => {
      try {
        const newPost = JSON.parse(event.data) as Post;
        console.log('Received new post:', newPost);

        // 新しい投稿をリストの先頭に追加
        setPosts((prevPosts) => {
          // 重複を防ぐ (同じIDの投稿は追加しない)
          if (prevPosts.some(p => p.id === newPost.id)) {
            return prevPosts;
          }
          return [newPost, ...prevPosts];
        });

        // 新規投稿通知
        setNewPost(newPost);

        // タイムラインの先頭にスクロール効果を追加する場合
        // timelineRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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

  // 新規投稿の通知を3秒後に非表示
  useEffect(() => {
    if (newPost) {
      const timer = setTimeout(() => {
        setNewPost(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [newPost]);

  useEffect(() => {
    setDisplayedPosts(posts.slice(0, 10));
    setAllPostsLoaded(false);
    setIsFetchingMore(false);
  }, [posts]);

  const showNewPostsHandler = () => {
    setShowNewPosts(true);
    setNewPostsCount(posts.length - displayedPosts.length);
  };

  const fetchMorePosts = async () => {
    if (allPostsLoaded || isFetchingMore) return;

    setIsFetchingMore(true);
    try {
      const newPosts = posts.slice(displayedPosts.length, displayedPosts.length + 10);
      setDisplayedPosts((prevPosts) => [...prevPosts, ...newPosts]);
      if (newPosts.length < 10) {
        setAllPostsLoaded(true);
      }
    } catch (e) {
      console.error('Failed to fetch more posts:', e);
    } finally {
      setIsFetchingMore(false);
    }
  };

  return (
    <div ref={timelineRef} className="relative">
      {newPostsCount > 0 && (
        <div
          className="sticky top-14 md:top-16 z-10 mt-2 mb-2 mx-auto w-auto max-w-xs"
          onClick={showNewPostsHandler}
        >
          <div className="bg-brand-blue text-white py-2 px-4 rounded-lg shadow-lg text-center text-sm animate-pulse hover:bg-brand-blue-dark cursor-pointer transition-colors mx-auto flex items-center justify-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span>新しい投稿 {newPostsCount}件</span>
          </div>
        </div>
      )}

      {isLoading && displayedPosts.length === 0 ? (
        <div className="py-8 px-4">
          <div className="animate-pulse flex flex-col space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex space-x-4">
                <div className="rounded-full bg-brand-light-gray h-12 w-12 flex-shrink-0"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-brand-light-gray rounded w-3/4"></div>
                  <div className="h-3 bg-brand-light-gray rounded w-1/2"></div>
                  <div className="h-24 bg-brand-light-gray rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : displayedPosts.length === 0 ? (
        <div className="p-4 text-center text-brand-dark-gray bg-white rounded-lg shadow-sm m-4">
          <p className="mb-2 text-xl">まだ投稿がありません</p>
          <p>最初の投稿をしてみましょう！</p>
        </div>
      ) : (
        // 投稿リスト
        displayedPosts.map(post => <PostItem key={post.id} post={post} />)
      )}

      {allPostsLoaded ? (
        <div className="p-4 text-center text-brand-dark-gray border-t border-brand-light-gray bg-brand-highlight">
          すべての投稿を読み込みました
        </div>
      ) : (
        <div ref={loadMoreRef} className="p-4 text-center bg-white">
          {isFetchingMore ? (
            <div className="flex justify-center items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-brand-blue animate-pulse"></div>
              <div className="w-4 h-4 rounded-full bg-brand-blue animate-pulse delay-75"></div>
              <div className="w-4 h-4 rounded-full bg-brand-blue animate-pulse delay-150"></div>
            </div>
          ) : (
            <button
              onClick={fetchMorePosts}
              className="text-brand-blue hover:underline font-semibold px-4 py-2 rounded-full bg-brand-highlight hover:bg-brand-extra-light-gray transition-colors"
            >
              さらに読み込む
            </button>
          )}
        </div>
      )}

      {/* リアルタイム更新ステータス */}
      <div className="fixed bottom-4 right-4 z-20">
        <div
          className={`rounded-full p-2 text-xs font-semibold flex items-center shadow-md
            ${isConnected ? 'bg-brand-blue text-white' : 'bg-brand-light-gray text-white'}`}
        >
          <div className={`w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-white' : 'bg-white animate-pulse'}`}></div>
          <span>{isConnected ? 'リアルタイム更新中' : '接続中...'}</span>
        </div>
      </div>
    </div>
  );
}
