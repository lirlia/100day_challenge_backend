'use client';

import type { Post, UserWithFollow } from '@/lib/types';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState, useCallback } from 'react';
import PostItem from './PostItem';

interface TimelineProps {
  getEmojiForUserId: (userId: number) => string;
  defaultEmoji: string;
  selectedUserId: number | null;
  users: UserWithFollow[];
  onFollowToggle: (targetUserId: number, newFollowState: boolean) => void;
}

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

  // API呼び出し中フラグ (ref を使用)
  const isFetchingInitialRef = useRef(false);
  const isFetchingMoreRef = useRef(false);

  // データ取得関数 (初期 + 無限スクロール)
  const fetchPosts = useCallback(async (cursor: string | number | null) => {
    const limit = 10;
    const url = cursor
      ? `/api/posts?cursor=${cursor}&limit=${limit}`
      : `/api/posts?limit=${limit}`;

    // ref を使ってガード条件をチェック
    if (cursor === null) {
      if (isFetchingInitialRef.current) {
        console.log('fetchPosts skipped, initial fetch already in progress (ref check).');
        return;
      }
    } else {
      if (isFetchingMoreRef.current) {
        console.log('fetchPosts skipped, load more already in progress (ref check).');
        return;
      }
    }

    // UI用 state の更新
    if (cursor === null) {
      console.log('Setting isLoading to true for initial fetch.');
      setIsLoading(true);
      isFetchingInitialRef.current = true; // ref をセット
    } else {
      console.log('Setting isFetchingMore to true.');
      setIsFetchingMore(true);
      isFetchingMoreRef.current = true; // ref をセット
    }
    setError(null);
    console.log(`Fetching from URL: ${url}`);

    try {
      console.log('fetchPosts: Before fetch call');
      const res = await fetch(url);
      console.log('fetchPosts: After fetch call, status:', res.status);

      if (!res.ok) {
        let errorBody = 'Unknown error';
        try {
          errorBody = await res.text();
        } catch { }
        console.error('fetchPosts: Fetch failed with status:', res.status, 'Body:', errorBody);
        throw new Error(`Failed to fetch posts (${res.status})`);
      }

      const responseText = await res.text();
      console.log('fetchPosts: Received response text:', responseText.substring(0, 500) + '...');

      let data;
      try {
        data = JSON.parse(responseText);
        console.log('fetchPosts: Successfully parsed JSON data:', data);
      } catch (parseError) {
        console.error('fetchPosts: Failed to parse JSON:', parseError, 'Raw text:', responseText);
        throw new Error('Failed to parse posts data');
      }

      if (!data || !Array.isArray(data.posts)) {
        console.error('fetchPosts: Invalid data structure received:', data);
        throw new Error('Invalid data structure received from API');
      }

      console.log('fetchPosts: Before setPosts call');
      setPosts((prevPosts) => {
        const fetchedPosts: Post[] = data.posts || [];
        console.log('fetchPosts: Inside setPosts callback. fetchedPosts:', fetchedPosts);

        if (cursor === null) {
          console.log('fetchPosts: Setting initial posts state. Count:', fetchedPosts.length);
          return fetchedPosts;
        } else {
          console.log('fetchPosts: Appending older posts. Prev count:', prevPosts.length, 'Fetched count:', fetchedPosts.length);
          const existingIds = new Set(prevPosts.map(p => p.id));
          console.log('fetchPosts: Existing IDs:', existingIds);
          console.log('fetchPosts: Filtering fetchedPosts:', fetchedPosts);
          const newPosts = fetchedPosts.filter((fp: Post) => {
            if (!fp) {
              console.error('fetchPosts filter: Encountered undefined/null item in fetchedPosts!');
              return false;
            }
            console.log('fetchPosts filter: Checking fp.id:', fp.id, 'Exists in existingIds:', existingIds.has(fp.id));
            return !existingIds.has(fp.id);
          });
          console.log('fetchPosts: Filtered newPosts:', newPosts);
          return [...prevPosts, ...newPosts];
        }
      });
      console.log('fetchPosts: After setPosts call');

      console.log('fetchPosts: Before setNextCursor call');
      setNextCursor(data.nextCursor);
      console.log('fetchPosts: After setNextCursor call, value:', data.nextCursor);

      if (data.nextCursor === null) {
        console.log('fetchPosts: All posts loaded.');
        setAllPostsLoaded(true);
      }

    } catch (err: any) {
      console.error('fetchPosts: Caught error in try block:', err, 'Error name:', err?.name, 'Error message:', err?.message);
      setError(err.message || 'Failed to fetch posts');
      setAllPostsLoaded(true);
    } finally {
      if (cursor === null) {
        console.log('fetchPosts: Setting isLoading to false and isInitialFetchDone to true in finally block.');
        setIsLoading(false);
        isInitialFetchDone.current = true;
        isFetchingInitialRef.current = false; // ref を解除
      } else {
        console.log('fetchPosts: Setting isFetchingMore to false in finally block.');
        setIsFetchingMore(false);
        isFetchingMoreRef.current = false; // ref を解除
      }
      console.log('fetchPosts: Exiting finally block');
    }
  }, []);

  // 初期データ読み込み Effect (依存配列は fetchPosts)
  useEffect(() => {
    console.log('Effect for initial fetch triggered. isInitialFetchDone.current:', isInitialFetchDone.current);
    if (!isInitialFetchDone.current) {
      console.log('Calling fetchPosts(null) for initial data.');
      fetchPosts(null);
    }
  }, [fetchPosts]); // fetchPosts は useCallback により参照が安定しているはず

  // 無限スクロール Effect (依存配列に isFetchingMore を含めないようにする)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // isFetchingMoreRef.current を使ってチェック
        if (entry.isIntersecting && !isFetchingMoreRef.current && !allPostsLoaded && nextCursor !== null) {
          console.log('Conditions met, calling fetchPosts for more data with cursor:', nextCursor);
          fetchPosts(nextCursor);
        }
      },
      { threshold: 1.0 }
    );
    const currentLoadMoreRef = loadMoreRef.current;
    if (currentLoadMoreRef) {
      observer.observe(currentLoadMoreRef);
    }
    return () => {
      if (currentLoadMoreRef) {
        observer.unobserve(currentLoadMoreRef);
      }
    };
    // ★ 依存配列から isFetchingMore を削除し、安定した値のみにする
    // fetchPosts は useCallback([]) なので安定
  }, [fetchPosts, allPostsLoaded, nextCursor]);

  useEffect(() => {
    eventSourceRef.current = new EventSource('/api/posts/stream');
    console.log('Connecting to SSE...');

    eventSourceRef.current.onopen = () => {
      console.log('SSE connection established');
      setIsConnected(true);
    };

    eventSourceRef.current.onerror = (error) => {
      console.error('SSE connection error:', error);
      setIsConnected(false);
      eventSourceRef.current?.close();
    };

    eventSourceRef.current.addEventListener('newPost', (event) => {
      try {
        const newPostData = JSON.parse(event.data) as Post;
        // console.log('Received new post via SSE:', newPostData);

        if (!isInitialFetchDone.current) {
          console.log('Skipping SSE processing, initial fetch not done yet.');
          return;
        }

        setPosts((prevPosts) => {
          if (prevPosts.some(p => p.id === newPostData.id)) {
            console.log('Skipping duplicate post from SSE:', newPostData.id);
            return prevPosts;
          }
          // console.log('Prepending new post:', newPostData);
          const updatedPosts = [newPostData, ...prevPosts];
          console.log('Updated posts state count:', updatedPosts.length);
          return updatedPosts;
        });

      } catch (e) {
        console.error('Failed to parse SSE data:', e);
      }
    });

    return () => {
      console.log('Closing SSE connection...');
      eventSourceRef.current?.close();
      setIsConnected(false);
    };
  }, []);

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

  return (
    <div ref={timelineRef} className="border-t border-brand-light-gray">
      <AnimatePresence initial={false}>
        {posts.length === 0 ? (
          <div className="p-4 text-center text-brand-dark-gray bg-white rounded-lg shadow-sm m-4">
            <p className="mb-2 text-xl">まだ投稿がありません</p>
            <p>最初の投稿をしてみましょう！</p>
          </div>
        ) : (
          posts.map(post => {
            const postUser = users.find(u => u.id === post.userId);
            const isFollowingPostUser = postUser?.isFollowing ?? false;
            return (
              <PostItem
                key={post.id}
                post={post}
                userEmoji={getEmojiForUserId(post.userId)}
                selectedUserId={selectedUserId}
                isFollowing={isFollowingPostUser}
                onFollowToggle={onFollowToggle}
              />
            );
          })
        )}
      </AnimatePresence>

      <div ref={loadMoreRef} className="p-4 text-center h-10 flex justify-center items-center">
        {!allPostsLoaded && isFetchingMore && (
          <div className="flex justify-center items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-brand-blue animate-pulse"></div>
            <div className="w-3 h-3 rounded-full bg-brand-blue animate-pulse delay-75"></div>
            <div className="w-3 h-3 rounded-full bg-brand-blue animate-pulse delay-150"></div>
          </div>
        )}
        {allPostsLoaded && posts.length > 0 && (
          <p className="text-brand-light-gray text-sm">すべての投稿を読み込みました</p>
        )}
      </div>

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
