'use client';

import React from 'react';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">100日チャレンジ</h1>
        <p className="text-gray-600 dark:text-gray-300">
          日々のNext.jsアプリケーション開発チャレンジ。
        </p>
      </header>

      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
        <h2 className="text-xl font-semibold mb-4">Day 13: Raft Simulator</h2>
        <p className="mb-4">
          Raft 分散合意アルゴリズムの動作を視覚的にシミュレートするアプリケーションです。
        </p>
        <Link href="/raft" legacyBehavior>
          <a className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
            シミュレータを開始
          </a>
        </Link>
      </div>

      {/* 他の日のアプリへのリンクなどを将来的に追加可能 */}
    </div>
  );
}
