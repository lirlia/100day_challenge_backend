'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">
          Day39 - インタラクティブCoWストレージシミュレーター
        </h1>
        <p className="text-xl mb-12">
          Copy-on-Write (CoW) の動作原理を視覚的に探求しましょう。
        </p>
        <Link
          href="/simulator"
          className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-300"
        >
          シミュレーターを開始
        </Link>
      </div>
    </main>
  );
}
