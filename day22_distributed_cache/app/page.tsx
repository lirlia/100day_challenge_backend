'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

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
    <div className="space-y-8">
      <section className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4">分散キャッシュシステム</h2>
        <p className="mb-4">
          複数のノード間でデータを分散して保存するキャッシュシステムのシミュレーションです。
          一貫性ハッシュによるデータ分散や障害時の挙動を確認できます。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <Link href="/dashboard" className="block bg-blue-50 hover:bg-blue-100 p-4 rounded-lg border border-blue-200 transition">
            <h3 className="font-bold text-blue-700 mb-2">システムダッシュボード</h3>
            <p className="text-blue-600">クラスタの状態やノードの情報を確認</p>
          </Link>
          <Link href="/cache-browser" className="block bg-green-50 hover:bg-green-100 p-4 rounded-lg border border-green-200 transition">
            <h3 className="font-bold text-green-700 mb-2">キャッシュブラウザ</h3>
            <p className="text-green-600">キャッシュの操作とデータの確認</p>
          </Link>
          <Link href="/simulation" className="block bg-purple-50 hover:bg-purple-100 p-4 rounded-lg border border-purple-200 transition">
            <h3 className="font-bold text-purple-700 mb-2">障害シミュレーション</h3>
            <p className="text-purple-600">ノード障害発生と復旧のシミュレーション</p>
          </Link>
        </div>
      </section>

      <section className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-4">システム概要</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">機能一覧</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>基本的なキャッシュ操作 (GET/SET/DELETE)</li>
              <li>データの有効期限 (TTL) 管理</li>
              <li>一貫性ハッシュによるデータ分散</li>
              <li>ノード間データレプリケーション</li>
              <li>障害シミュレーション機能</li>
              <li>クラスタ管理機能</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2">技術スタック</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Next.js (App Router)</li>
              <li>TypeScript</li>
              <li>SQLite / Prisma</li>
              <li>Tailwind CSS</li>
              <div className="max-w-4xl mx-auto py-8 px-4">
                <header className="mb-8">
                  <h1 className="text-3xl font-bold mb-2">100日チャレンジ - Next.js + Prisma</h1>
                  <p className="text-gray-600 dark:text-gray-300">
                    このプロジェクトはNext.js、TypeScript、Prisma、SQLiteを使用した100日チャレンジのテンプレートです。
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

                  <div className="flex-1">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
                      <h2 className="text-xl font-semibold mb-4">テンプレートの使い方</h2>
                      <ul className="space-y-3">
                        <li>
                          <strong>データモデル:</strong> <code>prisma/schema.prisma</code> でデータモデルを定義
                        </li>
                        <li>
                          <strong>API:</strong> <code>app/api/</code> にエンドポイントを追加
                        </li>
                        <li>
                          <strong>UI開発:</strong> <code>app/</code> にページを追加、<code>components/</code> に共通コンポーネントを配置
                        </li>
                        <li>
                          <strong>DB操作:</strong> <code>lib/db.ts</code> の Prisma Client を使用
                        </li>
                      </ul>
                      <div className="mt-6">
                        <a
                          href="https://github.com/lirlia/100day_challenge_backend"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          → GitHubリポジトリを見る
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              );
}
