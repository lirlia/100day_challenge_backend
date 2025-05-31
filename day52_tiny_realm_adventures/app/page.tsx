'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const [playerName, setPlayerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleJoinGame = async () => {
    if (playerName.trim() === '') {
      setError('プレイヤー名を入力してください。');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/players/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: playerName.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ゲームへの参加に失敗しました。');
      }

      const playerData = await response.json();

      sessionStorage.setItem('currentPlayer', JSON.stringify(playerData));

      router.push('/game');

    } catch (err: any) {
      console.error('Failed to join game:', err);
      setError(err.message || 'ゲームへの参加中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl text-center w-full max-w-md">
        <h1 className="text-4xl font-bold mb-8 text-yellow-400 font-mono tracking-wider">
          タイニーレルム冒険譚
        </h1>
        {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}
        <input
          type="text"
          placeholder="プレイヤー名を入力"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          disabled={isLoading}
          className="w-full p-3 mb-6 bg-gray-700 border border-gray-600 rounded-md text-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all duration-200 ease-in-out shadow-inner disabled:opacity-50"
        />
        <button
          onClick={handleJoinGame}
          disabled={isLoading}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-6 rounded-md text-lg transition-all duration-200 ease-in-out transform hover:scale-105 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? '参加処理中...' : 'ゲーム開始'}
        </button>
      </div>
    </main>
  );
}
