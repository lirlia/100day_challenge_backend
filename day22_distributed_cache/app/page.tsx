'use client';

import { useState } from 'react';
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold mb-6 text-gray-700">Day22 - 分散キャッシュシステム</h1>
        <p className="text-gray-600 mb-8">管理ダッシュボードへアクセスします。</p>
        <div className="flex justify-center">
          <Link href="/dashboard" className="block bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out">
            システムダッシュボードへ
          </Link>
        </div>
      </div>
    </div>
  );
}
