'use client';

import React, { useState, useEffect, useCallback } from 'react';
// import Image from 'next/image'; // 使っていないので削除
import { useCurrentUser } from '@/context/CurrentUserContext'; // Context フックをインポート
// import { User } from '@prisma/client'; // Use a simpler type if full User object is not needed

// スワイプするユーザーの型定義 (APIレスポンスに合わせる)
type SwipeableUser = {
  id: number;
  name: string;
  age: number;
  bio: string | null;
  profileImageUrl: string | null;
};

// このコンポーネントは Props を受け取らなくなる
// interface SwipePageProps {
//   currentUserId: number | null;
// }

// --- アイコンコンポーネント ---
const HeartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-pink-500" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);
// --- ここまでアイコンコンポーネント ---

// const SwipePage: React.FC<SwipePageProps> = ({ currentUserId }) => {
const SwipePage: React.FC = () => { // Props を受け取らないように変更
  const { currentUserId } = useCurrentUser(); // Context から currentUserId を取得
  const [userToSwipe, setUserToSwipe] = useState<SwipeableUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [matchedUserName, setMatchedUserName] = useState<string>('');

  // 次のスワイプ候補を取得する関数
  const fetchNextUser = useCallback(async () => {
    if (!currentUserId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/users?currentUserId=${currentUserId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user');
      }
      const data: SwipeableUser | null = await response.json();
      setUserToSwipe(data);
      if (!data) {
        console.log('No more users to swipe.'); // 候補がいなくなった場合の処理
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId]);

  // スワイプアクションを実行する関数 (Like or Skip)
  const handleSwipe = async (action: 'like' | 'skip') => {
    if (!currentUserId || !userToSwipe) return;

    setIsLoading(true); // アクション中もローディング表示
    try {
      const response = await fetch('/api/swipes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          swiperUserId: currentUserId,
          swipedUserId: userToSwipe.id,
          action: action,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to swipe');
      }

      const result = await response.json();

      // マッチングした場合の処理
      if (result.isMatch) {
        setMatchedUserName(userToSwipe.name); // マッチ相手の名前を設定
        setIsMatchModalOpen(true);
        // デスクトップ通知 (ブラウザがサポートし、ユーザーが許可している場合)
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🎉 New Match!', {
            body: `You matched with ${userToSwipe.name}! ✨`,
            // icon: userToSwipe.profileImageUrl || '/default-icon.png' // オプション: アイコン指定
          });
        } else if ('Notification' in window && Notification.permission !== 'denied') {
          // 許可を求める (初回など)
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              new Notification('🎉 New Match!', {
                body: `You matched with ${userToSwipe.name}! ✨`,
              });
            }
          });
        }
        // マッチモーダル表示中でも次のユーザー取得は行う
        fetchNextUser();
      } else {
        // マッチしなかった場合は、すぐに次のユーザーを取得
        fetchNextUser();
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to swipe');
      // エラー発生時も次のユーザーを取得しようとする (無限ループ防止策が必要かも)
      // fetchNextUser(); // ここで呼ぶと問題があればループする可能性
      setIsLoading(false); // エラー表示のためにローディング解除
    }
    // ローディング解除は fetchNextUser の finally で行われるのでここでは不要
  };

  // コンポーネントマウント時 or currentUserId 変更時にユーザー取得
  useEffect(() => {
    // コンテキストの準備ができてからユーザー取得を開始
    if (currentUserId !== null) {
      console.log(`SwipePage detected currentUserId: ${currentUserId}, fetching next user.`);
      fetchNextUser();
    } else {
      console.log('SwipePage waiting for currentUserId from context...');
    }
    setIsMatchModalOpen(false);
    setUserToSwipe(null);
  }, [currentUserId, fetchNextUser]);

  // --- JSX ---
  if (currentUserId === null) {
    return <div className="text-center text-gray-600 mt-10">Loading user context...</div>;
  }

  if (isLoading && !isMatchModalOpen) {
    return <div className="text-center text-pink-600 mt-10">Loading next profile...</div>;
  }

  if (error) {
    return <div className="text-center text-red-600 mt-10">Error: {error}. Please try again later.</div>;
  }

  if (!userToSwipe) {
    return <div className="text-center text-gray-600 mt-10">No more users to swipe right now. Check back later!</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center pt-6 md:pt-10 animate-slide-up">
      {/* Profile Card - Use the custom card-profile class */}
      <div className="card-profile">
        {/* Image Container with Gradient Border */}
        <div className="relative w-full h-[420px] border-b-4 border-gradient-to-r from-pink-400 to-rose-400">
          {userToSwipe.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userToSwipe.profileImageUrl}
              alt={`${userToSwipe.name}'s profile`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
              <span className="text-gray-500 text-xl font-semibold">No Image</span>
            </div>
          )}

          {/* Floating Age Badge in Top Right */}
          <div className="absolute top-4 right-4 bg-white/90 rounded-full px-3 py-1 text-pink-600 font-bold shadow-md">
            {userToSwipe.age}
          </div>

          {/* Info Overlay - Made more readable with darker gradient */}
          <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/80 via-black/60 to-transparent text-white">
            <h2 className="text-3xl font-bold mb-1">{userToSwipe.name}</h2>
            <p className="text-base opacity-90 line-clamp-2">{userToSwipe.bio || ''}</p>
          </div>
        </div>

        {/* Additional Profile Details Section */}
        <div className="p-4 bg-white">
          <div className="flex items-center justify-center space-x-6">
            {/* Action Buttons Section */}
            <button
              onClick={() => handleSwipe('skip')}
              disabled={isLoading}
              className="btn-action btn-skip"
              aria-label="Skip user"
            >
              {/* Adjust icon size */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <span className="mt-1 text-xs font-semibold tracking-wide">Skip</span>
            </button>

            <button
              onClick={() => handleSwipe('like')}
              disabled={isLoading}
              className="btn-action btn-like"
              aria-label="Like user"
            >
              {/* Adjust icon size */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              <span className="mt-1 text-xs font-semibold tracking-wide">Like</span>
            </button>
          </div>
        </div>
      </div>

      {/* Match Modal - Use the custom match-modal classes */}
      {isMatchModalOpen && (
        <div className="match-modal-overlay">
          <div className="match-modal-content">
            <div className="animate-bounce mb-4">
              <svg className="h-16 w-16 mx-auto text-white" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-4xl font-bold text-white mb-3 drop-shadow-md">It's a Match!</h3>
            <p className="text-lg text-white/90 mb-6 drop-shadow">
              You and <span className="font-semibold">{matchedUserName}</span> liked each other! 🎉
            </p>
            {/* User Avatars */}
            <div className="flex justify-center space-x-8 mb-8">
              {/* Current User Avatar */}
              <div className="w-24 h-24 rounded-full bg-white/30 border-4 border-white shadow-lg flex items-center justify-center animate-pulse">
                <span className="text-2xl font-bold text-white">You</span>
              </div>
              {/* Matched User Avatar */}
              <div className="w-24 h-24 rounded-full bg-white/30 border-4 border-white shadow-lg flex items-center justify-center animate-pulse">
                <span className="text-2xl font-bold text-white">{matchedUserName.substring(0, 2)}</span>
              </div>
            </div>
            <button
              onClick={() => setIsMatchModalOpen(false)}
              className="bg-white hover:bg-rose-50 text-rose-600 font-bold py-3 px-8 rounded-full transition duration-300 focus:outline-none focus:ring-2 focus:ring-white/50 shadow-md"
            >
              Keep Swiping
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwipePage;
