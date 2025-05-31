'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { PlayerClientData, WorldData, ChatMessageData, InteractionContent, NPCData, MonsterData, ItemData } from '@/lib/types';

// 実コンポーネントのインポート
import GameMap from '@/components/GameMap';
import PlayerHUD from '@/components/PlayerHUD';
import ChatWindow from '@/components/ChatWindow';
import InteractionModal from '@/components/InteractionModal';

const POLLING_INTERVAL_MS = 5000; // 5秒に変更
const PLAYER_DATA_KEY = 'currentPlayer';

export default function GamePage() {
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerClientData | null>(null);
  const [worldData, setWorldData] = useState<WorldData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [interactionContent, setInteractionContent] = useState<InteractionContent>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null); // エラー表示用

  const updatePlayerState = useCallback((newPlayerData: Partial<PlayerClientData>) => {
    setPlayer(prev => {
        if (!prev) {
            const fullNewPlayer = newPlayerData as PlayerClientData;
            sessionStorage.setItem(PLAYER_DATA_KEY, JSON.stringify(fullNewPlayer));
            return fullNewPlayer;
        }
        const updated = {
            ...prev,
            ...newPlayerData,
            inventory: newPlayerData.inventory || prev.inventory || [] // prev.inventory も undefined の場合を考慮
        } as PlayerClientData;
        sessionStorage.setItem(PLAYER_DATA_KEY, JSON.stringify(updated));
        return updated;
    });
  }, []); // useCallbackでメモ化し、依存配列を空にする

  // ワールドデータとチャットデータのポーリング・初期ロード
  const fetchGameData = useCallback(async (showError = true) => {
    const currentId = player?.id || JSON.parse(sessionStorage.getItem(PLAYER_DATA_KEY) || '{}').id;
    if (!currentId) return;

    try {
      const [worldRes, chatRes, playerDetailsRes] = await Promise.all([
        fetch('/api/world'),
        fetch('/api/chat'),
        fetch(`/api/players/${currentId}`)
      ]);

      if (!worldRes.ok || !chatRes.ok || !playerDetailsRes.ok) {
        const errorSources = [];
        if (!worldRes.ok) errorSources.push('ワールド');
        if (!chatRes.ok) errorSources.push('チャット');
        if (!playerDetailsRes.ok) errorSources.push('プレイヤー詳細');
        throw new Error(`${errorSources.join('・')}データの取得に失敗`);
      }
      const world: WorldData = await worldRes.json();
      const chat: ChatMessageData[] = await chatRes.json();
      const detailedPlayer: PlayerClientData = await playerDetailsRes.json();

      setWorldData(world);
      setChatMessages(chat);
      updatePlayerState(detailedPlayer); // プレイヤー情報を最新に更新
      if (showError) setLastError(null);
    } catch (err: any) {
      console.error('Game data fetch error:', err);
      if (showError) setLastError(err.message || 'ゲームデータの同期に失敗しました。');
    }
  }, [player?.id, updatePlayerState]);

  // プレイヤー情報の初期読み込み
  useEffect(() => {
    const storedPlayerData = sessionStorage.getItem(PLAYER_DATA_KEY);
    if (storedPlayerData) {
      try {
        const parsedData: PlayerClientData = JSON.parse(storedPlayerData);
        setPlayer(parsedData);
        setIsLoading(false);
      } catch (e) {
        console.error('Failed to parse player data from session:', e);
        sessionStorage.removeItem(PLAYER_DATA_KEY);
        router.replace('/'); return;
      }
    } else {
      router.replace('/'); return;
    }
  }, [router]);

  // ポーリング設定
  useEffect(() => {
    if (isLoading || !player?.id) return;

    fetchGameData(false); // 初回ロード (エラー表示は控えめに)
    const intervalId = setInterval(() => fetchGameData(false), POLLING_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isLoading, player?.id, fetchGameData]);

  // 移動処理
  const handleMove = useCallback(async (direction: 'up' | 'down' | 'left' | 'right') => {
    if (!player?.id || interactionContent) return;
    try {
      const response = await fetch(`/api/players/${player.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '移動に失敗');
      }
      const updatedPlayer: PlayerClientData = await response.json();
      updatePlayerState(updatedPlayer);
      // ワールドデータも更新した方が良いが、ポーリングに任せるか、ここで部分更新するか。
      // 今回はポーリングに任せるが、即時性を高めるなら setWorldData でプレイヤー位置を更新。
      setLastError(null);
    } catch (err: any) {
      console.error('Move error:', err);
      setLastError(`移動エラー: ${err.message}`);
    }
  }, [player, interactionContent, updatePlayerState]);

  // キーボードイベントリスナー
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!player || interactionContent) return;
      switch (event.key) {
        case 'w': case 'ArrowUp': handleMove('up'); break;
        case 's': case 'ArrowDown': handleMove('down'); break;
        case 'a': case 'ArrowLeft': handleMove('left'); break;
        case 'd': case 'ArrowRight': handleMove('right'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [player, handleMove, interactionContent]);

  const handleEntityClick = (type: 'npc' | 'monster', data: NPCData | MonsterData) => {
    if (type === 'npc') {
        setInteractionContent({ type: 'npc', data: data as NPCData });
    } else if (type === 'monster') {
        setInteractionContent({ type: 'monster', data: data as MonsterData });
    }
  };
  const handleModalClose = () => setInteractionContent(null);

  const handleAttack = async (monsterId: number) => {
    if (!player?.id) return;
    try {
      const response = await fetch('/api/combat/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, monsterId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '攻撃に失敗');

      setLastError(result.message); // 攻撃結果を通知
      // モンスターの状態が変化したのでワールドデータを再取得
      await fetchGameData();
      // モーダルを閉じるか、モンスターが倒されたら自動で閉じるなど
      if(result.monster?.hp <= 0) {
        handleModalClose();
      } else if (worldData) {
        // モーダル内容を更新 (HPなど)
        const updatedMonsterInWorld = worldData.monsters.find(m => m.id === monsterId);
        if (updatedMonsterInWorld) {
            // APIからの最新のHPで更新
            setInteractionContent({ type: 'monster', data: { ...updatedMonsterInWorld, hp: result.monster.hp } });
        } else {
            // モンスターが見つからなければモーダルを閉じる（データ不整合の可能性）
            handleModalClose();
        }
      } else {
        // worldDataがまだなければ、とりあえず閉じる
        handleModalClose();
      }
      // プレイヤーデータ(HPなど)も更新される可能性があるので再取得
      const playerDetailsRes = await fetch(`/api/players/${player.id}`);
      if (playerDetailsRes.ok) updatePlayerState(await playerDetailsRes.json());

    } catch (err: any) {
      console.error('Attack error:', err);
      setLastError(`攻撃エラー: ${err.message}`);
    }
  };

  const handleUseItem = async (itemId: number) => {
    if (!player?.id) return;
    try {
      const response = await fetch('/api/items/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, itemId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'アイテム使用に失敗');

      setLastError(result.message); // アイテム使用結果を通知
      // プレイヤーデータ(HPやインベントリ)を更新
      const playerDetailsRes = await fetch(`/api/players/${player.id}`);
      if (playerDetailsRes.ok) updatePlayerState(await playerDetailsRes.json());
      //ワールドデータも更新する場合がある（例：特殊アイテムでマップ変化など）
      // await fetchGameData();
    } catch (err: any) {
      console.error('Use item error:', err);
      setLastError(`アイテム使用エラー: ${err.message}`);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!player?.id || !message.trim()) return;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, message: message.trim() }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'メッセージ送信に失敗');
      }
      // 新しいメッセージをチャットリストに追加（UI即時反映のため。ポーリングでも更新される）
      const newMessageData: ChatMessageData = await response.json();
      setChatMessages(prev => [...prev, newMessageData]);
      setLastError(null);
    } catch (err: any) {
      console.error('Send message error:', err);
      setLastError(`メッセージ送信エラー: ${err.message}`);
    }
  };

  if (isLoading || !player) {
    return <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white"><p className="text-xl">ゲームを読み込んでいます...</p></div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white p-2 md:p-4 font-mono select-none">
      <header className="w-full p-3 bg-gray-800 shadow-lg mb-2 md:mb-4 rounded-lg flex justify-between items-center sticky top-0 z-10 border border-gray-700">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-400 tracking-wider">
          タイニーレルム冒険譚
        </h1>
        {player && (
          <p className="text-sm text-gray-300 hidden md:block">
            ようこそ、<span className="font-semibold text-yellow-300">{player.name}</span> さん！
          </p>
        )}
        <button
          onClick={() => { sessionStorage.removeItem(PLAYER_DATA_KEY); router.push('/'); }}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-2 md:py-1.5 md:px-3 rounded text-xs sm:text-sm transition-colors"
        >
          タイトルへ
        </button>
      </header>

      {lastError && <p className="fixed top-16 left-1/2 -translate-x-1/2 bg-red-800 border border-red-600 text-red-200 p-2 rounded-md mb-2 text-center text-sm shadow-lg z-20 animate-pulse">エラー: {lastError}</p>}

      <div className="flex flex-col lg:flex-row flex-1 gap-2 md:gap-4">
        <main className="w-full lg:w-3/4 flex flex-col gap-2 md:gap-4 order-2 lg:order-1">
          <div className="flex-grow flex items-center justify-center overflow-auto bg-black rounded-lg shadow-inner border border-gray-700 p-1 md:p-2">
            <GameMap worldData={worldData} player={player} onEntityClick={handleEntityClick} />
          </div>
          <div className="h-48 md:h-64 lg:h-56 xl:h-64">
            <ChatWindow messages={chatMessages} onSendMessage={handleSendMessage} currentPlayerId={player.id} />
          </div>
        </main>
        <aside className="w-full lg:w-1/4 order-1 lg:order-2 h-full">
          <div className="sticky top-20">
             <PlayerHUD player={player} onUseItem={handleUseItem} />
          </div>
        </aside>
      </div>

      <InteractionModal
        content={interactionContent}
        onClose={handleModalClose}
        onAttack={handleAttack}
      />
    </div>
  );
}
