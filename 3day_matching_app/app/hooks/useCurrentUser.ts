'use client';

import { useState, useEffect } from 'react';
import { useCurrentUser as useCurrentUserContext } from '@/context/CurrentUserContext';

// User型定義
type User = {
  id: number;
  name: string;
  age: number;
  bio?: string;
  profileImageUrl?: string;
};

// 拡張したuseCurrentUserフック
export const useCurrentUser = () => {
  const { currentUserId } = useCurrentUserContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (currentUserId === null) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`/api/users/${currentUserId}`);

        if (!response.ok) {
          throw new Error('ユーザー情報の取得に失敗しました');
        }

        const userData = await response.json();
        setCurrentUser(userData);
      } catch (err) {
        console.error('ユーザー情報取得エラー:', err);
        setError('ユーザー情報の取得中にエラーが発生しました');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUser();
  }, [currentUserId]);

  return {
    currentUserId,
    currentUser,
    isLoading,
    error
  };
};

export default useCurrentUser;
