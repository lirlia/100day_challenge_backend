'use client';

import { useState, useEffect } from 'react';
import Tile from '../components/Tile';
import { GameState, PlayerID, GamePhase } from '../lib/mahjong/game_state';
import { Tile as TileType } from '../lib/mahjong/tiles';

export default function HomePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTile, setSelectedTile] = useState<TileType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartGame = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/game/new');
      if (!response.ok) {
        throw new Error(`ゲームの開始に失敗しました: ${response.statusText}`);
      }
      const data: GameState = await response.json();
      setGameState(data);
      setSelectedTile(null);
    } catch (e: any) {
      setError(e.message);
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTileClick = (tile: TileType) => {
    if (gameState?.turn !== PlayerID.Player || gameState.phase !== GamePhase.PlayerDiscardWait) {
      return;
    }
    if (selectedTile && selectedTile.id === tile.id) {
      handleDiscardTile(tile);
    } else {
      setSelectedTile(tile);
    }
  };

  const handleDiscardTile = async (tileToDiscard: TileType) => {
    if (!gameState || !tileToDiscard) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/game/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gameId: gameState.gameId,
          actionType: 'discard',
          tileId: tileToDiscard.id,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`アクションの処理に失敗しました: ${errorData.error || response.statusText}`);
      }
      const data: GameState = await response.json();
      setGameState(data);
      setSelectedTile(null);
    } catch (e: any) {
      setError(e.message);
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="container mx-auto p-4 min-h-screen flex flex-col items-center justify-start clay-element">
      <h1 className="text-4xl font-bold text-center my-8">Day53 - CPU対戦二人麻雀</h1>

      {error && <p className="text-red-500 text-center my-4">エラー: {error}</p>}
      {isLoading && <p className="text-blue-500 text-center my-4">ロード中...</p>}

      {!gameState ? (
        <div className="text-center">
          <button
            onClick={handleStartGame}
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg clay-element text-xl"
          >
            ゲーム開始 (東風戦)
          </button>
        </div>
      ) : (
        <div className="w-full max-w-5xl mx-auto">
          <div className="flex justify-around mb-4 p-4 clay-element rounded-lg text-sm sm:text-base">
            <div>プレイヤー: {gameState.player.score}点</div>
            <div>CPU: {gameState.cpu.score}点</div>
            <div>東{gameState.round}局 {gameState.honba}本場</div>
            <div>山: {gameState.yama.tiles.length}枚</div>
          </div>
          {gameState.lastActionMessage && (
            <div className="text-center my-2 p-3 bg-slate-200 dark:bg-slate-700 rounded-md clay-element text-sm sm:text-base">
                {gameState.lastActionMessage}
            </div>
          )}

          <div className="mb-6 p-2 clay-element rounded-lg">
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-center">CPU</h2>
            <div className="flex justify-center items-end space-x-1 mb-2 min-h-[5rem] sm:min-h-[6.5rem] md:min-h-[7.5rem] bg-slate-50 dark:bg-slate-800 p-2 rounded">
              {gameState.cpu.hand.map((_, index) => (
                <Tile key={`cpu-hand-${index}`} tile={null} className="opacity-80 scale-90" />
              ))}
            </div>
            <div className="flex flex-wrap justify-start p-2 bg-slate-100 dark:bg-slate-700 rounded min-h-[4.5rem] sm:min-h-[5rem] items-start">
              {gameState.cpu.river.map((tile, index) => (
                <Tile key={`cpu-river-${tile.id}-${index}`} tile={tile} className="mr-1 mb-1 scale-[0.7] sm:scale-[0.65]" isSelectable={false}/>
              ))}
            </div>
          </div>

          <div className="my-4 flex justify-center">
            <div className="clay-element p-2 flex items-center rounded-lg">
                <span className="mr-2 font-semibold text-sm sm:text-base">ドラ表示:</span>
                {gameState.yama.doraIndicators.map((doraTile, index) => (
                    <Tile key={`dora-${doraTile.id}-${index}`} tile={doraTile} isSelectable={false} className="scale-[0.7] sm:scale-[0.65]" />
                ))}
            </div>
          </div>

          <div className="mt-6 p-2 clay-element rounded-lg">
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-center">プレイヤー</h2>
            <div className="flex flex-wrap justify-start p-2 bg-slate-100 dark:bg-slate-700 rounded min-h-[4.5rem] sm:min-h-[5rem] items-start mb-2">
              {gameState.player.river.map((tile, index) => (
                <Tile key={`player-river-${tile.id}-${index}`} tile={tile} className="mr-1 mb-1 scale-[0.7] sm:scale-[0.65]" isSelectable={false}/>
              ))}
            </div>
            <div className="flex justify-center items-end space-x-1 min-h-[6rem] sm:min-h-[7rem] md:min-h-[8.5rem] bg-slate-50 dark:bg-slate-800 p-2 rounded">
              {gameState.player.hand.map((tile) => (
                <Tile
                  key={`player-hand-${tile.id}-${gameState.turnCount}-${Math.random()}`}
                  tile={tile}
                  onClick={handleTileClick}
                  isSelected={selectedTile?.id === tile.id && selectedTile?.suit === tile.suit && selectedTile?.value === tile.value}
                  isSelectable={gameState.turn === PlayerID.Player && gameState.phase === GamePhase.PlayerDiscardWait}
                />
              ))}
            </div>
          </div>

          {gameState.turn === PlayerID.Player && gameState.phase === GamePhase.PlayerDiscardWait && selectedTile && (
            <div className="text-center mt-6 mb-4">
              <button
                onClick={() => handleDiscardTile(selectedTile)}
                disabled={isLoading}
                className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold py-2 px-5 sm:py-3 sm:px-6 rounded-lg clay-element text-md sm:text-lg shadow-md hover:shadow-lg transition-transform transform hover:scale-105"
              >
                {selectedTile.name} を捨てる
              </button>
            </div>
          )}

        </div>
      )}
    </main>
  );
}
