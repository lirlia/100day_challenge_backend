'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// プレイヤーデータの型 (APIレスポンスと合わせる)
interface PlayerData {
  id: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackPower: number;
  // lastSeen など、必要に応じて追加
}

export default function GamePage() {
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedPlayerData = sessionStorage.getItem('currentPlayer');
    if (storedPlayerData) {
      try {
        const parsedData: PlayerData = JSON.parse(storedPlayerData);
        setPlayer(parsedData);
      } catch (error) {
        console.error('Failed to parse player data from sessionStorage:', error);
        sessionStorage.removeItem('currentPlayer'); // 不正なデータを削除
        router.replace('/'); // ホームページにリダイレクト
        return;
      }
    } else {
      // プレイヤー情報がない場合はホームページにリダイレクト
      alert('プレイヤー情報が見つかりません。ホームページに戻ります。');
      router.replace('/');
      return;
    }
    setIsLoading(false);
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
        <p className="text-xl">ゲームデータを読み込み中...</p>
      </div>
    );
  }

  if (!player) {
    // この状態は通常useEffect内のリダイレクトで回避されるはず
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
        <p className="text-xl text-red-500">プレイヤー情報の読み込みに失敗しました。</p>
      </div>
    );
  }

  // ここから実際のゲームUI (ステップ5で実装)
  return (
    <div className="flex min-h-screen flex-col items-center justify-start p-4 bg-gray-900 text-white">
      <header className="w-full p-4 bg-gray-800 shadow-md mb-4">
        <h1 className="text-2xl font-bold text-yellow-400 font-mono">Day52 - タイニーレルム冒険譚</h1>
        <p>ようこそ、{player.name} さん！ (ID: {player.id})</p>
        <p>HP: {player.hp} / {player.maxHp} | 位置: ({player.x}, {player.y})</p>
      </header>

      <main className="w-full flex-1 flex flex-col items-center justify-center">
        <p className="text-lg">ゲーム画面 (実装中)</p>
        {/* TODO: GameMap, PlayerHUD, ChatWindowなどのコンポーネントを配置 */}
      </main>

      <footer className="w-full p-2 text-center text-sm text-gray-500">
        <button
          onClick={() => {
            sessionStorage.removeItem('currentPlayer');
            router.push('/');
          }}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded text-xs"
        >
          ゲームを終了してタイトルへ
        </button>
      </footer>
    </div>
  );
}
