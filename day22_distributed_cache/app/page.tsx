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
      if (!response.ok) {
        throw new Error(`APIエラー: ${response.status}`);
      }
      const data = await response.json();
      // データが配列であることを確認
      if (Array.isArray(data)) {
        setUsers(data);
      } else {
        console.error('Expected array but got:', data);
        setUsers([]);
        setError('ユーザーデータの形式が正しくありません。');
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('ユーザー情報の取得に失敗しました。');
      setUsers([]);
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
      <section className="bg-white p-6 rounded-lg shadow-md mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
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
    </div>
  );
}
