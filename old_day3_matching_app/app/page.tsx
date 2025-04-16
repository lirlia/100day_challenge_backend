'use client';

import React, { useState, useEffect, useCallback } from 'react';
// import Image from 'next/image'; // 使っていないので削除
import { useCurrentUser } from '@/context/CurrentUserContext'; // Context フックをインポート
// import { User } from '@prisma/client'; // Use a simpler type if full User object is not needed
import Avatar from '../components/Avatar';

// スワイプするユーザーの型定義 (APIレスポンスに合わせる)
type SwipeableUser = {
  id: number;
  name: string;
  age: number;
  bio: string | null;
  profileImageUrl: string | null;
  avatarType: string | null;
  skinColor: string | null;
  hairColor: string | null;
  clothesColor: string | null;
  bgColor: string | null;
};

// この関数は名前からユニークな色を生成します
const getColorFromName = (name: string): string => {
  const colors = [
    '#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6', '#16A085',
    '#27AE60', '#2980B9', '#8E44AD', '#F1C40F', '#E67E22',
    '#E74C3C', '#D35400', '#C0392B', '#6D4C41', '#546E7A'
  ];

  // 名前の文字をすべて足し合わせて数値に変換し、色の配列の長さで割った余りを取得
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }

  return colors[sum % colors.length];
};

// イニシャルを取得する関数
const getInitials = (name: string): string => {
  if (!name) return '';

  const parts = name.split(' ');
  if (parts.length === 1) {
    return name.substring(0, 2).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
};

// オンラインステータスをIDから決定する関数
const getStatusFromId = (id: number): 'online' | 'offline' | 'away' => {
  // IDに基づいて一貫性のあるステータスを返す
  const statuses: ('online' | 'offline' | 'away')[] = ['online', 'offline', 'away'];
  return statuses[id % statuses.length];
};

// ユーザーIDから性別を決定する関数
const getGenderFromId = (id: number): 'male' | 'female' => {
  // 偶数IDは男性、奇数IDは女性として扱う
  return id % 2 === 0 ? 'male' : 'female';
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

  // アバタータイプをランダムに選択するヘルパー関数
  const getRandomAvatarType = (): 'casual' | 'business' | 'sporty' | 'artistic' => {
    const types = ['casual', 'business', 'sporty', 'artistic'];
    return types[Math.floor(Math.random() * types.length)] as 'casual' | 'business' | 'sporty' | 'artistic';
  };

  // DBから取得したアバタータイプを有効なアバタータイプに変換
  const convertToValidAvatarType = (type: string | null): 'casual' | 'business' | 'sporty' | 'artistic' => {
    if (type === 'casual' || type === 'business' || type === 'sporty' || type === 'artistic') {
      return type as 'casual' | 'business' | 'sporty' | 'artistic';
    }
    return 'casual'; // デフォルト値
  };

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
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: userToSwipe.bgColor || getColorFromName(userToSwipe.name) }}
            >
              <div className="w-64 h-64">
                <Avatar
                  type={convertToValidAvatarType(userToSwipe.avatarType)}
                  size={256}
                  skinColor={userToSwipe.skinColor || '#F5D0A9'}
                  hairColor={userToSwipe.hairColor || '#4A2700'}
                  clothesColor={userToSwipe.clothesColor || '#3498DB'}
                  bgColor={userToSwipe.bgColor || getColorFromName(userToSwipe.name)}
                  status={getStatusFromId(userToSwipe.id)}
                  gender={getGenderFromId(userToSwipe.id)}
                />
              </div>
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

      {/* Match Modal - マッチモーダルにもアバターを表示 */}
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
              <div className="w-24 h-24">
                <Avatar
                  type="casual"
                  size={96}
                  skinColor="#F5D0A9"
                  hairColor="#4A2700"
                  clothesColor="#FF6B6B"
                  bgColor="#E6F3FF"
                  status="online"
                  gender={getGenderFromId(currentUserId)}
                />
              </div>
              {/* Matched User Avatar */}
              <div className="w-24 h-24">
                <Avatar
                  type={getRandomAvatarType()}
                  size={96}
                  skinColor="#F5D0A9"
                  hairColor="#4A2700"
                  clothesColor="#3498DB"
                  bgColor={getColorFromName(matchedUserName)}
                  status="online"
                  gender={getGenderFromId(userToSwipe.id)}
                />
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
