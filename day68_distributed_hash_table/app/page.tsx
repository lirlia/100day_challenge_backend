'use client';

import { useState, useEffect } from 'react';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ユーザー一覧を取得
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users');
      const data = await response.json();
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('ユーザー情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // ユーザーを作成
  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });

      if (response.ok) {
        setName('');
        fetchUsers();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'ユーザー作成に失敗しました。');
      }
    } catch (err) {
      console.error('Error creating user:', err);
      setError('ユーザー作成に失敗しました。');
    }
  };

  // 初回マウント時にユーザー一覧を取得
  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">100日チャレンジ</h1>
        <p className="text-gray-600 dark:text-gray-300">
          このプロジェクトはNext.js、TypeScript、SQLiteを使用した100日チャレンジのテンプレートです。
        </p>
      </header>

      <div className="flex flex-col md:flex-row gap-8">
        <div className="flex-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md mb-6">
            <h2 className="text-xl font-semibold mb-4">ユーザー作成</h2>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <form onSubmit={createUser} className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ユーザー名"
                className="flex-1 px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              />
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
              >
                追加
              </button>
            </form>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4">ユーザー一覧</h2>
            {loading ? (
              <p>読み込み中...</p>
            ) : users.length === 0 ? (
              <p>ユーザーがいません。新しいユーザーを追加してください。</p>
            ) : (
              <ul className="divide-y dark:divide-gray-700">
                {users.map((user) => (
                  <li key={user.id} className="py-3">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ID: {user.id} | 作成日: {new Date(user.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
