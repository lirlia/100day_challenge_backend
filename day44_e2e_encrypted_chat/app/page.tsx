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
    <div className="w-full max-w-md p-8 space-y-6 bg-neumo-bg rounded-xl shadow-neumo-outset">
      <header className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-neumo-accent">
          Day44 - E2E Encrypted Chat
        </h1>
        <p className="text-neumo-text">
          ニューモーフィズムデザインのエンドツーエンド暗号化チャットアプリへようこそ。
        </p>
      </header>

      <div className="flex flex-col items-center space-y-4">
        <p className="text-neumo-text">
          チャットを開始するには、以下のボタンをクリックしてください。
        </p>
        <Link
          href="/chat"
          className="px-6 py-3 font-semibold text-white bg-neumo-accent rounded-lg shadow-neumo-outset-sm hover:shadow-neumo-pressed active:shadow-neumo-inset transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-neumo-accent focus:ring-opacity-50"
        >
          チャットを始める
        </Link>
      </div>

      <footer className="text-center text-sm text-neumo-text pt-6">
        <p>&copy; 2024 Your Name. All rights reserved.</p>
      </footer>
    </div>
  );
}
