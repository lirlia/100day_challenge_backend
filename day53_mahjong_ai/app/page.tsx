'use client';

import { useEffect, useState } from 'react';
import { GameState, PlayerID, PlayerState } from '../lib/mahjong/game_state'; // PlayerState もインポート
import { Tile as TileType } from '../lib/mahjong/tiles';
import { compareTiles } from '../lib/mahjong/tiles'; // ソート用にインポート

// 仮のTileDisplayコンポーネント (後で別ファイルに分割)
const TileDisplay = ({ tile, onClick,isSelected }: { tile: TileType, onClick?: (tile: TileType) => void, isSelected?: boolean }) => {
  const suitMap: Record<string, string> = { m: '萬', p: '筒', s: '索', z: '字' };
  const honorMap: Record<string, string> = {
    ton: '東', nan: '南', sha: '西', pei: '北',
    haku: '白', hatsu: '發', chun: '中'
  };

  let displayValue = tile.value.toString();
  if (tile.suit === 'z') {
    displayValue = honorMap[tile.id] || '字';
  }

  const tileBg = isSelected ? 'bg-blue-300' : 'bg-slate-100';
  const tileBorder = isSelected ? 'border-blue-500' : 'border-slate-300';

  return (
    <button
      type="button"
      onClick={() => onClick && onClick(tile)}
      className={`clay-tile w-10 h-14 m-1 flex flex-col items-center justify-center rounded-md shadow-md transform transition-all hover:scale-105 ${tileBg} border-2 ${tileBorder}`}
      aria-label={`Tile ${displayValue} ${suitMap[tile.suit]}`}
    >
      <span className="text-sm font-bold">{displayValue}</span>
      <span className="text-xs">{suitMap[tile.suit]}</span>
    </button>
  );
};

export default function MahjongGamePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTile, setSelectedTile] = useState<TileType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const currentPlayerId: PlayerID = PlayerID.Player; // PlayerID enum を使用

  useEffect(() => {
    const fetchNewGame = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/game/new');
        if (!response.ok) {
          throw new Error(`Failed to start new game: ${response.statusText}`);
        }
        const data: GameState = await response.json(); // 型アサーション追加
        setGameState(data);
        setError(null);
      } catch (err) {
        console.error("Error fetching new game:", err);
        setError(err instanceof Error ? err.message : 'Unknown error creating game');
      } finally {
        setIsLoading(false);
      }
    };
    fetchNewGame();
  }, []);

  const handleTileSelect = (tile: TileType) => {
    if (gameState?.turn === currentPlayerId) { // gameState.turn を参照
      setSelectedTile(tile);
    }
  };

  const handleDiscard = async () => {
    if (!selectedTile || !gameState || gameState.turn !== currentPlayerId) return; // gameState.turn を参照

    try {
      setIsLoading(true);
      const response = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameState.gameId,
          playerId: currentPlayerId, // 変数名変更
          action: { type: 'discard', tile: selectedTile },
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Failed to discard tile: ${response.statusText}` }));
        throw new Error(errorData.message || `Failed to discard tile: ${response.statusText}`);
      }
      const data: GameState = await response.json(); // 型アサーション追加
      setGameState(data);
      setSelectedTile(null);
      setError(null);
    } catch (err) {
      console.error("Error discarding tile:", err);
      setError(err instanceof Error ? err.message : 'Unknown error discarding tile');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !gameState) return <div className="p-4 text-center">Loading new game...</div>;
  if (error) return <div className="p-4 text-red-500 text-center">Error: {error} <button onClick={() => window.location.reload()} className="ml-2 px-2 py-1 bg-blue-500 text-white rounded">Retry</button></div>;
  if (!gameState) return <div className="p-4 text-center">No game state available.</div>;

  // gameState.player と gameState.cpu を直接参照
  const playerState: PlayerState | undefined = gameState.player;
  const cpuState: PlayerState | undefined = gameState.cpu;

  if (!playerState || !cpuState) return <div className="p-4 text-center">Player or CPU state is missing.</div>;

  // Round display helper
  const displayRound = (round: number) => {
    const wind = Math.ceil(round / 4) <= 1 ? '東' : '南'; // Assuming East & South rounds for now
    const number = round % 4 === 0 ? 4 : round % 4;
    return `${wind}${number}`;
  }

  return (
    <div className="min-h-screen bg-green-700 p-4 flex flex-col items-center text-white font-sans">
      <header className="mb-4 w-full max-w-4xl">
        <h1 className="text-4xl font-bold text-center text-yellow-300 clay-text-title">Day 53 - 麻雀 AI 対戦</h1>
        <div className="flex justify-between text-sm mt-2">
          {/* gameState.round, gameState.honba を参照 */}
          <span>Round: {displayRound(gameState.round)}局 {gameState.honba}本場</span>
          <span>Score: Player {playerState.score} | CPU {cpuState.score}</span>
          {/* gameState.dora は配列なので、最初の要素を表示 (存在する場合) */}
          <span>Dora: {gameState.dora.length > 0 ? <TileDisplay tile={gameState.dora[0]} /> : 'N/A'}</span>
          {/* gameState.yama.tiles を参照 */}
          <span>Yama: {gameState.yama.tiles.length}</span>
        </div>
      </header>

      {/* CPU Area */}
      <div className="w-full max-w-4xl mb-4 p-2 clay-area rounded-lg">
        <h2 className="text-lg mb-1">CPU ({PlayerID.CPU})</h2> {/* PlayerID enum を使用 */}
        <div className="flex mb-1">
          {Array(cpuState.hand.length).fill(0).map((_, i) => (
            <div key={`cpu-hand-${i}`} className="clay-tile-back w-10 h-14 m-1 rounded-md bg-slate-600 border-2 border-slate-700" />
          ))}
        </div>
        <div className="flex flex-wrap min-h-[60px] bg-green-800 p-1 rounded">
          {cpuState.river.map((tile, i) => <TileDisplay key={`cpu-river-${tile.id}-${i}`} tile={tile} />)}
        </div>
      </div>

      {/* Player Area */}
      <div className="w-full max-w-4xl p-2 clay-area rounded-lg">
        <h2 className="text-lg mb-1">Player ({currentPlayerId}) {gameState.turn === currentPlayerId && "(Your Turn)"}</h2>
        <div className="flex flex-wrap min-h-[80px] bg-green-800 p-1 rounded mb-2">
          {/* compareTiles を使用してソート */}
          {playerState.hand.sort(compareTiles).map((tile) => (
            <TileDisplay
              key={`player-hand-${tile.id}`}
              tile={tile}
              onClick={handleTileSelect}
              isSelected={selectedTile?.id === tile.id}
            />
          ))}
        </div>
        <div className="flex flex-wrap min-h-[60px] bg-green-800 p-1 rounded mb-2">
          {playerState.river.map((tile, i) => <TileDisplay key={`player-river-${tile.id}-${i}`} tile={tile} />)}
        </div>
        {gameState.turn === currentPlayerId && (
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!selectedTile || isLoading}
            className="clay-button px-4 py-2 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 disabled:bg-gray-400 transform transition-all hover:scale-105"
          >
            {isLoading ? 'Discarding...' : `Discard ${selectedTile ? selectedTile.id : ''}`}
          </button>
        )}
      </div>

      {/* Game Log or other info */}
      {/* ... */}
    </div>
  );
}
