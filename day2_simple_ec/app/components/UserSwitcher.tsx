'use client';

import { useState, useEffect, createContext, useContext } from 'react';

// ユーザーの型定義
type User = {
  id: number;
  name: string;
};

// ユーザーコンテキストの型定義
type UserContextType = {
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  users: User[];
};

// ユーザーコンテキストの作成
const UserContext = createContext<UserContextType>({
  currentUser: null,
  setCurrentUser: () => {},
  users: [],
});

// ユーザーコンテキストのカスタムフック
export const useUser = () => useContext(UserContext);

// ユーザープロバイダーコンポーネント
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // ユーザー一覧を取得
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) throw new Error('Failed to fetch users');

        const data = await response.json();
        setUsers(data);

        // 最初のユーザーを現在のユーザーとして設定
        if (data.length > 0 && !currentUser) {
          setCurrentUser(data[0]);
          // ローカルストレージにユーザーIDを保存
          localStorage.setItem('currentUserId', data[0].id.toString());
        }
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };

    fetchUsers();
  }, []);

  // ローカルストレージからユーザーIDを取得して現在のユーザーを設定
  useEffect(() => {
    const savedUserId = localStorage.getItem('currentUserId');
    if (savedUserId && users.length > 0) {
      const user = users.find((u) => u.id === parseInt(savedUserId));
      if (user) setCurrentUser(user);
    }
  }, [users]);

  // ユーザー切替関数
  const handleSetCurrentUser = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('currentUserId', user.id.toString());
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser: handleSetCurrentUser,
        users,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

// ユーザー切替コンポーネント
export default function UserSwitcher() {
  const { currentUser, setCurrentUser, users } = useUser();

  if (!currentUser) return <div>ユーザーを読み込み中...</div>;

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-700">ユーザー:</span>
      <select
        className="border rounded px-2 py-1 text-sm"
        value={currentUser.id}
        onChange={(e) => {
          const userId = parseInt(e.target.value);
          const user = users.find((u) => u.id === userId);
          if (user) setCurrentUser(user);
        }}
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </div>
  );
}
