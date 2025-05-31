'use client';

import { useState } from 'react';

export default function HomePage() {
  const [playerName, setPlayerName] = useState('');

  const handleJoinGame = () => {
    if (playerName.trim() === '') {
      alert('プレイヤー名を入力してください。');
      return;
    }
    // TODO: サーバーに playerName を送信し、playerId を取得してゲームページに遷移する
    console.log(`プレイヤー名: ${playerName} でゲームに参加します。`);
    // 仮でゲームページへのパスをログに出力（実際には router.push を使用）
    console.log('Next step: navigate to /game?playerName=' + playerName);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl text-center">
        <h1 className="text-4xl font-bold mb-8 text-yellow-400 font-mono tracking-wider">
          タイニーレルム冒険譚
        </h1>
        <input
          type="text"
          placeholder="プレイヤー名を入力"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-full p-3 mb-6 bg-gray-700 border border-gray-600 rounded-md text-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all duration-200 ease-in-out shadow-inner"
        />
        <button
          onClick={handleJoinGame}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-6 rounded-md text-lg transition-all duration-200 ease-in-out transform hover:scale-105 shadow-md hover:shadow-lg"
        >
          ゲーム開始
        </button>
      </div>
    </main>
  );
}
