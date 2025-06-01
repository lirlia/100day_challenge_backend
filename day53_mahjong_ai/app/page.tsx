'use client';

import { useEffect, useState } from 'react';
import { GameState, PlayerID, PlayerState } from '../lib/mahjong/game_state';
import { Tile as TileType } from '../lib/mahjong/tiles';
import { compareTiles } from '../lib/mahjong/tiles';
import { TileDisplay } from '../components/tile-display'; // New component import

export default function MahjongGamePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTile, setSelectedTile] = useState<TileType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null); // For action-specific errors

  const currentPlayerId: PlayerID = PlayerID.Player;

  useEffect(() => {
    const fetchNewGame = async () => {
      try {
        setIsLoading(true);
        setActionError(null);
        const response = await fetch('/api/game/new');
        if (!response.ok) {
          throw new Error(`Failed to start new game: ${response.statusText}`);
        }
        const data: GameState = await response.json();
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
    if (gameState?.turn === currentPlayerId) {
      setSelectedTile(prev => (prev?.id === tile.id ? null : tile)); // Toggle selection
    }
  };

  const submitAction = async (actionPayload: any) => {
    if (!gameState) return;
    setIsLoading(true);
    setActionError(null);
    try {
      const response = await fetch('/api/game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameState.gameId,
          playerId: currentPlayerId,
          action: actionPayload,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Action failed: ${response.statusText}` }));
        throw new Error(errorData.message || `Action failed: ${response.statusText}`);
      }
      const data: GameState = await response.json();
      setGameState(data);
      setSelectedTile(null); // Clear selection after action
    } catch (err) {
      console.error("Error submitting action:", err);
      setActionError(err instanceof Error ? err.message : 'Unknown error during action');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = async () => {
    if (!selectedTile) return;
    await submitAction({ type: 'discard', tile: selectedTile });
  };

  const handleRiichi = async () => {
    // TODO: リーチ可能な牌を選択させるUI (打牌と同時)
    if (!selectedTile) { // 打牌する牌が選択されている必要がある
        setActionError("リーチするには、まず捨てる牌を選んでください。");
        return;
    }
    await submitAction({ type: 'riichi', tile: selectedTile });
  };

  const handleTsumoAgari = async () => {
    await submitAction({ type: 'tsumo_agari' });
  };

  const handleRon = async () => {
    // ロンは相手の打牌に対してなので、このUIからの直接実行は通常ないはずだが、CPU実装によっては必要かも
    // または、フリテンでないかのチェックなどをクライアントで行う場合に使う
    await submitAction({ type: 'ron' });
  };

  const handleKan = async () => {
    // TODO: カンする牌（暗槓なら手牌から4枚、加槓ならポンした牌と手牌1枚）を選択させるUI
    // 適切な牌が選択されているかチェック
    if (!selectedTile) { // 例: 暗槓のために最初の1枚目を選択
        setActionError("カンする牌を選択してください。");
        return;
    }
    // 仮で選択牌で暗槓を試みる (API側で詳細判定)
    await submitAction({ type: 'kan', tile: selectedTile });
  };

  if (isLoading && !gameState) return <div className="p-4 text-center clay-area text-lg">新しいゲームを読み込んでいます...</div>;
  if (error) return <div className="p-4 text-red-500 text-center clay-area text-lg">エラー: {error} <button onClick={() => window.location.reload()} className="ml-4 clay-button bg-blue-500 hover:bg-blue-600 text-white">リトライ</button></div>;
  if (!gameState) return <div className="p-4 text-center clay-area text-lg">ゲーム状態がありません。</div>;

  const playerState: PlayerState | undefined = gameState.player;
  const cpuState: PlayerState | undefined = gameState.cpu;

  if (!playerState || !cpuState) return <div className="p-4 text-center clay-area text-lg">プレイヤーまたはCPUの状態がありません。</div>;

  const displayRound = (round: number) => {
    const wind = Math.ceil(round / 4) <= 1 ? '東' : '南';
    const number = round % 4 === 0 ? 4 : round % 4;
    return `${wind}${number}`;
  }

  const canRiichi = playerState.canRiichi && gameState.turn === currentPlayerId; // 仮の条件
  const canTsumoAgari = playerState.canTsumoAgari && gameState.turn === currentPlayerId; // 仮の条件
  const canRon = playerState.canRon; // 相手の打牌に対してなので、表示条件は別途検討
  const canKan = playerState.canKan && gameState.turn === currentPlayerId; // 仮の条件

  return (
    <div className="min-h-screen bg-green-700 p-2 sm:p-4 flex flex-col items-center text-white font-sans">
      <header className="mb-4 w-full max-w-5xl clay-area rounded-lg p-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-center text-yellow-300 clay-text-title mb-2">Day 53 - 麻雀 AI 対戦</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm sm:text-base">
          <div className="clay-info-box">Round: {displayRound(gameState.round)}局 {gameState.honba}本場</div>
          <div className="clay-info-box">Score: P {playerState.score} | C {cpuState.score}</div>
          <div className="clay-info-box flex items-center justify-center">Dora: {gameState.dora.length > 0 ? <TileDisplay tile={gameState.dora[0]} size="small" isPlayable={false}/> : 'N/A'}</div>
          <div className="clay-info-box">Yama: {gameState.yama.tiles.length}</div>
        </div>
      </header>

      {/* CPU Area */}
      <div className="w-full max-w-5xl mb-4 p-3 clay-area rounded-lg">
        <h2 className="text-xl mb-2 font-semibold">CPU ({PlayerID.CPU})</h2>
        <div className="flex flex-wrap mb-2 min-h-[56px]">
          {Array(cpuState.hand.length).fill(0).map((_, i) => (
            <TileDisplay key={`cpu-hand-${i}`} tile={null} isHidden={true} size="medium" />
          ))}
        </div>
        <div className="flex flex-wrap min-h-[68px] bg-green-800/50 p-1 rounded-md border border-green-600">
          {cpuState.river.map((tile, i) => <TileDisplay key={`cpu-river-${tile.id}-${i}`} tile={tile} size="small" isPlayable={false}/>)}
        </div>
      </div>

      {/* Player Area */}
      <div className="w-full max-w-5xl p-3 clay-area rounded-lg">
        <h2 className="text-xl mb-2 font-semibold">Player ({currentPlayerId}) {gameState.turn === currentPlayerId && <span className="text-yellow-300 clay-text-accent">(あなたのターン)</span>}</h2>
        <div className="flex flex-wrap justify-center min-h-[88px] bg-green-800/50 p-2 rounded-md border border-green-600 mb-3">
          {playerState.hand.sort(compareTiles).map((tile) => (
            <TileDisplay
              key={`player-hand-${tile.id}`}
              tile={tile}
              onClick={handleTileSelect}
              isSelected={selectedTile?.id === tile.id}
              isPlayable={gameState.turn === currentPlayerId}
              size="medium"
            />
          ))}
        </div>
        <div className="flex flex-wrap min-h-[68px] bg-green-800/50 p-1 rounded-md border border-green-600 mb-3">
          {playerState.river.map((tile, i) => <TileDisplay key={`player-river-${tile.id}-${i}`} tile={tile} size="small" isPlayable={false}/>)}
        </div>

        {actionError && <div className="text-red-400 bg-red-900/50 p-2 rounded-md mb-2 text-sm">{actionError}</div>}

        {gameState.turn === currentPlayerId && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!selectedTile || isLoading}
              className="clay-button action-button discard-button"
            >
              {isLoading && selectedTile ? '捨牌中...' : `捨牌 (${selectedTile ? selectedTile.id : '?'})`}
            </button>
            <button type="button" onClick={handleRiichi} disabled={!canRiichi || isLoading || !selectedTile} className="clay-button action-button riichi-button">{isLoading ? "処理中..." : "リーチ"}</button>
            <button type="button" onClick={handleTsumoAgari} disabled={!canTsumoAgari || isLoading} className="clay-button action-button tsumoagari-button">{isLoading ? "処理中..." : "ツモ"}</button>
            {/* <button type="button" onClick={handleRon} disabled={!canRon || isLoading} className="clay-button action-button ron-button">{isLoading ? "処理中..." : "ロン"}</button> */}
            <button type="button" onClick={handleKan} disabled={!canKan || isLoading || !selectedTile} className="clay-button action-button kan-button">{isLoading ? "処理中..." : "カン"}</button>
          </div>
        )}
      </div>
    </div>
  );
}
