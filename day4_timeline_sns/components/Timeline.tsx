'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import PostItem from './PostItem';
import { Post, UserWithFollow } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchPosts } from '@/lib/utils/fetchPosts';
import { useIntersectionObserver } from '@/lib/hooks/useIntersectionObserver';
import { SSEListener } from '@/lib/sse';

interface TimelineProps {
  getEmojiForUserId: (userId: number) => string;
  defaultEmoji: string;
  selectedUserId: number | null;
  users: UserWithFollow[];
  onFollowToggle: (targetUserId: number, newFollowState: boolean) => void;
}

// タブの型
type TimelineType = 'all' | 'following';

export default function Timeline({
  getEmojiForUserId,
  defaultEmoji,
  selectedUserId,
  users,
  onFollowToggle,
}: TimelineProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allPostsLoaded, setAllPostsLoaded] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [nextCursor, setNextCursor] = useState<string | number | null>(null);
  const isInitialFetchDone = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTimeline, setActiveTimeline] = useState<TimelineType>('all');

  // フォローしているユーザーIDのSet (SSE判定用)
  const followingIdsSet = useRef(new Set<number>());
  useEffect(() => {
    followingIdsSet.current = new Set(
      users.filter(u => u.isFollowing).map(u => u.id)
    );
    if (selectedUserId) {
      followingIdsSet.current.add(selectedUserId); // 自分自身も追加
    }
    console.log('Updated followingIdsSet:', followingIdsSet.current);
  }, [users, selectedUserId]);

  // データ取得関数
  const fetchData = useCallback(async (cursor: string | number | null) => {
    // allPostsLoaded は依存配列から削除し、関数内部でのみ参照
    const currentAllPostsLoaded = allPostsLoaded;
    if (isInitialFetchDone.current || currentAllPostsLoaded) {
      console.log('fetchPosts skipped, already fetching or all loaded.');
      return;
    }
    // フォロータブ選択時にユーザー未選択なら何もしない
    if (activeTimeline === 'following' && selectedUserId === null) {
      console.log('fetchPosts skipped, following tab selected but no user chosen.');
      setIsLoading(false); // ローディング状態を解除
      isInitialFetchDone.current = true; // 初期ロード完了とマーク
      return;
    }

    console.log(`fetchPosts called with cursor: ${cursor}, type: ${activeTimeline}, user: ${selectedUserId}`);

    if (cursor === null) {
      setIsLoading(true); // 初期ロード
    } else {
      setIsFetchingMore(true); // 追加ロード
    }
    setError(null);

    try {
      const fetchedData = await fetchPosts(cursor, activeTimeline, selectedUserId);
      console.log('fetchPosts received data:', fetchedData);

      const fetchedPosts = fetchedData.posts || [];
      const fetchedNextCursor = fetchedData.nextCursor ?? null;

      setPosts((prevPosts) => {
        const existingIds = new Set(prevPosts.map(p => p.id));
        const newPosts = fetchedPosts.filter((p: Post) => !existingIds.has(p.id));
        console.log('Existing post IDs:', existingIds);
        console.log('Fetched new posts:', newPosts);
        return cursor === null ? newPosts : [...prevPosts, ...newPosts];
      });

      setNextCursor(fetchedNextCursor);
      setAllPostsLoaded(fetchedPosts.length === 0 || fetchedNextCursor === null);

    } catch (err: any) {
      console.error('Error fetching posts in component:', err);
      setError(err.message || '投稿の取得に失敗しました。');
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
      isInitialFetchDone.current = true; // 必ず初期ロード完了とマーク
      console.log('fetchPosts finished');
    }
  }, [activeTimeline, selectedUserId]); // allPostsLoadedを依存配列から削除

  // ★ タブまたはユーザー変更時にタイムラインをリセットして再取得
  useEffect(() => {
    console.log(`Timeline type or user changed: ${activeTimeline}, ${selectedUserId}. Resetting timeline.`);
    setPosts([]);
    setNextCursor(null);
    setAllPostsLoaded(false);
    setError(null);
    isInitialFetchDone.current = false;

    // フォロータブでユーザー未選択なら何もしない
    if (activeTimeline === 'following' && selectedUserId === null) {
      setIsLoading(false);
      isInitialFetchDone.current = true;
      return;
    }

    fetchData(null); // 新しいタイムラインの初期データを取得
  }, [activeTimeline, selectedUserId, fetchData]);

  // 無限スクロール用のObserver
  useIntersectionObserver(loadMoreRef, () => {
    if (isInitialFetchDone.current && !isLoading && !isFetchingMore && !allPostsLoaded && nextCursor) {
      console.log('Intersection observer triggered, fetching more posts...');
      fetchData(nextCursor);
    }
  }, [isLoading, isFetchingMore, allPostsLoaded, nextCursor, fetchData]);

  // SSEリスナー
  useEffect(() => {
    if (!SSEListener.isInitialized()) {
      SSEListener.initialize();
      console.log('SSE Listener initialized.');
    }

    const handleNewPost = (newPostData: Post) => {
      console.log('SSE received new post:', newPostData);
      // ★ フォロー中タブの場合、投稿者がフォロー対象か自分自身かチェック
      if (activeTimeline === 'following') {
        if (followingIdsSet.current.has(newPostData.userId)) {
          console.log('Adding new post to following timeline (from SSE)');
          setPosts((prev) => [newPostData, ...prev]);
        } else {
          console.log('Skipping new post on following timeline (not followed user)');
        }
      } else {
        // おすすめタブの場合は常に追加
        console.log('Adding new post to all timeline (from SSE)');
        setPosts((prev) => [newPostData, ...prev]);
      }
    };

    SSEListener.on('newPost', handleNewPost);
    console.log('SSE newPost listener attached.');

    return () => {
      SSEListener.off('newPost', handleNewPost);
      console.log('SSE newPost listener detached.');
    };
  }, [activeTimeline]);

  if (isLoading) {
    return (
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
    );
  }

  if (error && posts.length === 0) {
    return <div className="p-4 text-center text-red-600 bg-red-100 rounded-lg shadow-sm m-4">エラー: {error}</div>;
  }

  // フォロータブでユーザー未選択の場合のメッセージ表示
  if (activeTimeline === 'following' && selectedUserId === null) {
    return (
      <div className="p-4 text-center text-gray-600 bg-gray-100 rounded-lg shadow-sm m-4">
        フォローを表示するにはユーザーを選択してください
      </div>
    );
  }

  // フォロータブでの投稿が0件の場合のメッセージ表示
  if (activeTimeline === 'following' && posts.length === 0 && !isLoading && isInitialFetchDone.current) {
    return (
      <div className="p-4 text-center text-gray-600 bg-gray-100 rounded-lg shadow-sm m-4">
        フォローしているユーザーの投稿がありません
      </div>
    );
  }

  return (
    <div ref={timelineRef} className="border-t border-brand-light-gray">
      <div className="flex border-b border-brand-light-gray sticky top-0 bg-white z-10">
        <button
          onClick={() => setActiveTimeline('all')}
          className={`flex-1 py-3 text-center font-bold transition-colors duration-150 ${activeTimeline === 'all' ? 'text-brand-blue border-b-2 border-brand-blue' : 'text-brand-dark-gray hover:bg-gray-100'}`}
        >
          おすすめ
        </button>
        <button
          onClick={() => setActiveTimeline('following')}
          disabled={selectedUserId === null}
          className={`flex-1 py-3 text-center font-bold transition-colors duration-150 ${activeTimeline === 'following' ? 'text-brand-blue border-b-2 border-brand-blue' : 'text-brand-dark-gray hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'}`}
        >
          フォロー中
        </button>
      </div>

      {posts.length === 0 && !isLoading ? (
        <div className="p-4 text-center text-gray-500">
          投稿がありません
        </div>
      ) : (
        <AnimatePresence>
          {posts.map((post) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <PostItem
                post={post}
                userEmoji={post.user?.emoji || getEmojiForUserId(post.userId) || defaultEmoji}
                isFollowing={
                  users.find(u => u.id === post.userId)?.isFollowing ?? false
                }
                selectedUserId={selectedUserId}
                onFollowToggle={onFollowToggle}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      )}

      {/* ロード中インジケーター */}
      {isFetchingMore && (
        <div className="py-4 text-center text-gray-500">
          <div className="inline-block animate-spin mr-2 h-4 w-4 border-t-2 border-brand-blue rounded-full"></div>
          読み込み中...
        </div>
      )}

      {/* 無限スクロール用の監視ターゲット */}
      <div ref={loadMoreRef} className="h-10" />
    </div>
  );
}
