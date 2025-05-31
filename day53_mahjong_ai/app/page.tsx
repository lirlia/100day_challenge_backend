'use client';

import { useState, useEffect } from 'react';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

export default function HomePage() {
  return (
    <main className="container mx-auto p-4 min-h-screen flex flex-col items-center justify-center">
      <div className="w-full max-w-4xl clay-element">
        <h1 className="text-4xl font-bold text-center mb-8">Day53 - CPU対戦二人麻雀</h1>
        <p className="text-center text-lg mb-8">最強AIに挑戦！</p>
        {/* ここに麻雀卓やゲームコントロールが表示される予定 */}
        <div className="text-center">
          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg clay-element">
            ゲーム開始 (東風戦)
          </button>
        </div>
      </div>
    </main>
  );
}
