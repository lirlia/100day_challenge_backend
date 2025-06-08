'use client';

import { useState, useEffect } from 'react';
import CookieClicker from './components/CookieClicker';
import StatsPanel from './components/StatsPanel';
import BuildingsPanel from './components/BuildingsPanel';
import UpgradesPanel from './components/UpgradesPanel';
import AchievementsPanel from './components/AchievementsPanel';
import { useGame } from './hooks/useGame';

export default function Home() {
  const gameState = useGame();

  if (!gameState.initialized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-200 via-yellow-200 to-pink-200 flex items-center justify-center">
        <div className="text-4xl font-bold text-brown-800">
          🍪 クッキークリッカーを読み込み中... 🍪
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-200 via-yellow-200 to-pink-200">
      {/* ヘッダー */}
      <header className="bg-brown-800 text-yellow-100 p-4 shadow-lg">
        <div className="container mx-auto">
          <h1 className="text-4xl font-bold text-center mb-2">
            🍪 Day62 - クッキークリッカー 🍪
          </h1>
          <StatsPanel gameState={gameState} />
        </div>
      </header>

      {/* メインコンテンツ */}
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左カラム: クッキークリッカー */}
          <div className="lg:col-span-1">
            <CookieClicker gameState={gameState} />
          </div>

          {/* 中央カラム: 建物 */}
          <div className="lg:col-span-1">
            <BuildingsPanel gameState={gameState} />
          </div>

          {/* 右カラム: アップグレード・実績 */}
          <div className="lg:col-span-1 space-y-6">
            <UpgradesPanel gameState={gameState} />
            <AchievementsPanel gameState={gameState} />
          </div>
        </div>
      </div>
    </div>
  );
}
