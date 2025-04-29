'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/lib/store/userStore';
import { User } from '@prisma/client';

const Header = () => {
  const {
    currentUser,
    availableUsers,
    setCurrentUser,
    fetchAvailableUsers,
  } = useUserStore();

  useEffect(() => {
    // コンポーネントマウント時に利用可能なユーザーを取得
    fetchAvailableUsers();
  }, [fetchAvailableUsers]);

  const handleUserChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUserId = parseInt(event.target.value, 10);
    const selectedUser = availableUsers.find((u) => u.id === selectedUserId) || null;
    setCurrentUser(selectedUser);
  };

  return (
    <header className="bg-gray-800 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/" className="text-xl font-bold">
          Day21 - 設備予約システム
        </Link>
        <nav className="flex space-x-4 items-center">
          <Link href="/facilities" className="hover:text-gray-300">
            設備管理
          </Link>
          <Link href="/reservations/my" className="hover:text-gray-300">
            マイ予約
          </Link>
          <div className="flex items-center space-x-2">
            <label htmlFor="user-select" className="text-sm">
              操作ユーザー:
            </label>
            <select
              id="user-select"
              value={currentUser?.id || ''}
              onChange={handleUserChange}
              className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={availableUsers.length === 0}
            >
              {availableUsers.length === 0 && (
                <option value="">読み込み中...</option>
              )}
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} (ID: {user.id})
                </option>
              ))}
            </select>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Header;
