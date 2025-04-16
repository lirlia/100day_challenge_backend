'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import Link from 'next/link';
import { UserCircleIcon, ChatBubbleLeftRightIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

// マッチしたユーザーの型定義 (APIレスポンスに合わせる)
type Match = {
  id: string;
  userId: string;
  matchedUserId: string;
  matchedUser: {
    id: string;
    name: string;
    age: number;
    bio: string;
    profileImageUrl: string;
  };
  createdAt: string;
};

// このコンポーネントは Props を受け取らなくなる
// interface MatchesPageProps {
//   currentUserId: number | null;
// }

// const MatchesPage: React.FC<MatchesPageProps> = ({ currentUserId }) => {
const MatchesPage: React.FC = () => { // Props を受け取らない
  const { currentUser, isLoading: userLoading } = useCurrentUser();
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // マッチリストを取得する関数
  const fetchMatches = useCallback(async () => {
    if (!currentUser) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`/api/matches?userId=${currentUser.id}`);

      if (!response.ok) {
        throw new Error('マッチリストの取得に失敗しました');
      }

      const data = await response.json();
      setMatches(data);
    } catch (err) {
      console.error('マッチ取得エラー:', err);
      setError('マッチングの取得中にエラーが発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  // コンポーネントマウント時 or currentUserId 変更時に取得
  useEffect(() => {
    if (currentUser) {
      fetchMatches();
    }
  }, [currentUser, fetchMatches]);

  // --- JSX ---
  if (userLoading || !currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-slate-50 to-gray-100">
        <div className="w-full max-w-md p-6 bg-white rounded-2xl shadow-lg animate-fade-in">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse"></div>
            <div className="w-1/2 h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-pink-500 border-opacity-50"></div>
        <p className="mt-4 text-gray-600 font-medium">マッチを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-center px-4">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
          <p className="font-medium">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition"
        >
          再試行
        </button>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 bg-white rounded-2xl shadow-lg animate-fade-in">
        <UserCircleIcon className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">マッチがまだありません</h2>
        <p className="text-gray-500 text-center mb-6">
          スワイプして新しい出会いを見つけましょう！
        </p>
        <Link
          href="/swipe"
          className="btn-primary"
        >
          スワイプを始める
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen p-4 bg-gradient-to-br from-slate-50 to-gray-100">
      <h1 className="text-3xl font-bold text-center mb-6 text-gradient">あなたのマッチング</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
        {matches.map((match) => (
          <div key={match.id} className="match-card animate-fade-in" style={{animationDelay: '0.1s'}}>
            <div className="relative h-48 w-full">
              {match.matchedUser.profileImageUrl ? (
                <Image
                  src={match.matchedUser.profileImageUrl}
                  alt={`${match.matchedUser.name}さんのプロフィール画像`}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-r from-gray-200 to-gray-300">
                  <UserCircleIcon className="w-20 h-20 text-gray-400" />
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xl font-bold text-gray-800">
                  {match.matchedUser.name}, {match.matchedUser.age}
                </h3>
                <span className="text-xs text-gray-500">
                  {new Date(match.createdAt).toLocaleDateString('ja-JP')}にマッチ
                </span>
              </div>

              <p className="text-gray-600 mb-4 line-clamp-2">
                {match.matchedUser.bio || 'プロフィール文がありません'}
              </p>

              <Link
                href={`/chat/${match.matchedUserId}`}
                className="btn-secondary w-full"
              >
                <ChatBubbleLeftRightIcon className="w-5 h-5 mr-2" />
                メッセージを送る
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatchesPage;
