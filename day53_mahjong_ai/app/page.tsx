'use client';

import { useEffect, useState } from 'react';
import { GameState, PlayerIdentifier, PlayerState, GamePhase, ActionType, TileInRiver } from '../lib/mahjong/game_state';
import { Tile as TileType, isSameTile, compareTiles } from '../lib/mahjong/tiles';
import { Meld } from '../lib/mahjong/hand';
import TileDisplay from '@/components/mahjong/TileDisplay';
import PlayerHand from '@/components/mahjong/PlayerHand';
import { GameResultModal } from '../components/game-result-modal';

export default function MahjongGamePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [selectedTileForRiichi, setSelectedTileForRiichi] = useState<TileType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [showKanSelectionModal, setShowKanSelectionModal] = useState<boolean>(false);
  const [possibleKans, setPossibleKans] = useState<{
    type: 'ankan' | 'kakan';
    tile?: TileType;
    meld?: Meld;
  }[]>([]);

  const currentPlayerId: PlayerIdentifier = 'player';

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
        console.log('API Response - GameState:', JSON.parse(JSON.stringify(data)));
        console.log('API Response - Player Hand Length:', data.player.hand.length);
        console.log('API Response - Player Hand:', JSON.parse(JSON.stringify(data.player.hand)));
        console.log('API Response - Player Last Draw:', JSON.parse(JSON.stringify(data.player.lastDraw)));
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

  const handleTileSelect = async (tile: TileType) => {
    if (gameState?.currentTurn === currentPlayerId && playerState && playerState.hand.length === 14) {
      setSelectedTileForRiichi(tile);
      await submitAction({ type: ActionType.Discard, tile: tile });
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
      console.log('API Response - GameState:', JSON.parse(JSON.stringify(data)));
      console.log('API Response - Player Hand Length:', data.player.hand.length);
      console.log('API Response - Player Hand:', JSON.parse(JSON.stringify(data.player.hand)));
      console.log('API Response - Player Last Draw:', JSON.parse(JSON.stringify(data.player.lastDraw)));
      setGameState(data);
      if (actionPayload.type !== ActionType.Riichi) {
        setSelectedTileForRiichi(null);
      }
      if ([GamePhase.PLAYER_TURN, GamePhase.CPU_TURN, GamePhase.ROUND_ENDED, GamePhase.GAME_OVER].includes(data.phase)) {
        if (data.phase === GamePhase.GAME_OVER || (data.phase === GamePhase.ROUND_ENDED && data.winner !== null)) {
          setShowResultModal(true);
        }
      }
    } catch (err) {
      console.error("Error submitting action:", err);
      setActionError(err instanceof Error ? err.message : 'Unknown error during action');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRiichi = async () => {
    if (!selectedTileForRiichi) {
      setActionError("リーチするには、まず捨てる牌を選んでください (牌をクリックすると選択されます)。");
      return;
    }
    const playerState = gameState?.player;
    if (!playerState) {
      setActionError("プレイヤーの状態が取得できません。");
      return;
    }
    if (playerState.score < 1000) {
      setActionError("点数が足りないためリーチできません (1000点必要)。");
      return;
    }
    await submitAction({ type: ActionType.Riichi, tileToDiscard: selectedTileForRiichi });
  };

  const handleTsumoAgari = async () => {
    await submitAction({ type: ActionType.TsumoAgari });
  };

  const handleRon = async () => {
    await submitAction({ type: ActionType.Ron });
  };

  const handleKan = async () => {
    const playerState = gameState?.player;
    if (playerState && playerState.possibleKans && playerState.possibleKans.length > 0) {
      const firstKan = playerState.possibleKans[0];
      if (firstKan) {
        await submitAction({ type: ActionType.Kan, tile: firstKan.tile, meldType: firstKan.type, meld: firstKan.meldToUpgrade });
      } else {
        setActionError("実行可能なカンがありません。");
      }
    } else {
      setActionError("カンできる牌がありません。");
    }
  };

  if (isLoading && !gameState) return <div className="p-4 text-center clay-area shadow-clay-main text-lg">新しいゲームを読み込んでいます...</div>;
  if (error) return <div className="p-4 text-red-500 text-center clay-area shadow-clay-main text-lg">エラー: {error} <button onClick={() => window.location.reload()} className="ml-4 clay-button shadow-clay-button bg-blue-500 hover:bg-blue-600 text-white">リトライ</button></div>;
  if (!gameState) return <div className="p-4 text-center clay-area shadow-clay-main text-lg">ゲーム状態がありません。</div>;

  const playerState: PlayerState | undefined = gameState.player;
  const cpuState: PlayerState | undefined = gameState.cpu;

  if (!playerState || !cpuState) return <div className="p-4 text-center clay-area shadow-clay-main text-lg">プレイヤーまたはCPUの状態がありません。</div>;

  console.log('Debug PlayerHand props:', {
    currentTurn: gameState.currentTurn,
    playerHandLength: playerState.hand.length,
    isPlayerTurn: gameState.currentTurn === 'player',
    isHandLength14: playerState.hand.length === 14,
    canDiscardResult: gameState.currentTurn === 'player' && playerState.hand.length === 14,
  });

  const sortHand = (hand: TileType[]) => {
    return [...hand].sort(compareTiles);
  };

  const displayRound = (round: number) => {
    const windVal = Math.ceil(round / 4) <= 1 ? '東' : '南';
    const number = round % 4 === 0 ? 4 : round % 4;
    return `${windVal}${number}`;
  }

  const canRiichi = playerState.canRiichi && gameState.currentTurn === 'player' && playerState.hand.length === 14;
  const canTsumoAgari = playerState.canTsumoAgari && gameState.currentTurn === 'player' && playerState.hand.length === 14;
  const canRon = playerState.canRon && gameState.currentTurn === 'player';
  const canPlayerPerformKan = playerState.canKan && gameState.currentTurn === 'player' && playerState.hand.length === 14;

  const startNewGame = async () => {
    setShowResultModal(false);
    setSelectedTileForRiichi(null);
    setActionError(null);
    setIsLoading(true);
    try {
      const response = await fetch('/api/game/new');
      if (!response.ok) {
        throw new Error(`Failed to start new game: ${response.statusText}`);
      }
      const data: GameState = await response.json();
      console.log('API Response - GameState:', JSON.parse(JSON.stringify(data)));
      console.log('API Response - Player Hand Length:', data.player.hand.length);
      console.log('API Response - Player Hand:', JSON.parse(JSON.stringify(data.player.hand)));
      console.log('API Response - Player Last Draw:', JSON.parse(JSON.stringify(data.player.lastDraw)));
      setGameState(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching new game:", err);
      setError(err instanceof Error ? err.message : 'Unknown error creating game');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-green-700 p-2 sm:p-4 flex flex-col items-center text-white font-sans">
      <header className="mb-4 w-full max-w-5xl clay-area shadow-clay-main rounded-lg p-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-center text-yellow-300 clay-text-title mb-2">Day 53 - 麻雀 AI 対戦</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm sm:text-base">
          <div className="clay-info-box shadow-clay-inset-sm">{displayRound(gameState.round)}局 {gameState.honba}本場</div>
          <div className="clay-info-box shadow-clay-inset-sm">P: {playerState.score} | CPU: {cpuState.score}</div>
          <div className="clay-info-box shadow-clay-inset-sm flex items-center justify-center">ドラ: {gameState.dora.length > 0 ? <TileDisplay tile={gameState.dora[0]} className="w-8 h-12 sm:w-10 sm:h-16 text-sm" /> : 'N/A'}</div>
          <div className="clay-info-box shadow-clay-inset-sm">山: {gameState.yama.tiles.length} / {gameState.riichiSticks}本</div>
        </div>
      </header>

      {/* CPU Area */}
      <div className="w-full max-w-5xl mb-4 p-3 clay-area shadow-clay-main rounded-lg">
        <h2 className="text-xl mb-2 font-semibold text-gray-300">CPU ('cpu') {gameState.currentTurn === 'cpu' && <span className="text-yellow-400 clay-text-accent">(思考中...)</span>}</h2>
        <div className="flex flex-wrap justify-center items-end gap-1 p-2 bg-gray-800/30 shadow-clay-inset rounded-lg min-h-[88px] mb-2">
          {Array(cpuState.hand.length).fill(null).map((_, i) => (
            <TileDisplay key={`cpu-hand-hidden-${i}`} tile={null} className="w-10 h-16 sm:w-12 sm:h-20" />
          ))}
        </div>
        <p className="text-xs text-gray-400 mb-1">CPUの河:</p>
        <div className="flex flex-wrap gap-1 min-h-[52px] bg-green-800/50 p-1 rounded-md border border-green-600/50">
          {cpuState.river.map((discard: TileInRiver, i) => (
            <TileDisplay key={`cpu-river-${discard.id}-${i}`} tile={discard} className="w-8 h-12 sm:w-10 sm:h-16 text-xs" />
          ))}
        </div>
        {cpuState.melds.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-400 mb-1">CPUの鳴き:</p>
            <div className="flex flex-wrap gap-2">
              {cpuState.melds.map((meld, i) => (
                <div key={`cpu-meld-${i}`} className="flex gap-0.5 p-1 bg-gray-700/50 rounded">
                  {meld.tiles.map((tile, ti) => (
                    <TileDisplay key={`cpu-meld-${i}-tile-${ti}`} tile={tile} className="w-8 h-12 sm:w-10 sm:h-16 text-xs" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Player Area */}
      <div className="w-full max-w-5xl p-3 clay-area shadow-clay-main rounded-lg">
        <h2 className="text-xl mb-2 font-semibold">あなた ('{currentPlayerId}') {gameState.currentTurn === 'player' && <span className="text-yellow-300 clay-text-accent">(あなたのターン)</span>}</h2>

        <PlayerHand
          hand={sortHand(playerState.hand)}
          lastDraw={playerState.lastDraw}
          onTileSelect={handleTileSelect}
          selectedTile={selectedTileForRiichi}
          canDiscard={gameState.currentTurn === 'player' && playerState.hand.length === 14}
        />

        {playerState.melds.length > 0 && (
          <div className="mt-3 mb-2">
            <p className="text-xs text-gray-400 mb-1">あなたの鳴き:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {playerState.melds.map((meld, i) => (
                <div key={`player-meld-${i}`} className="flex gap-0.5 p-1 bg-gray-700/50 rounded">
                  {meld.tiles.map((tile, ti) => (
                    <TileDisplay key={`player-meld-${i}-tile-${ti}`} tile={tile} className="w-10 h-16" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3 mb-1">あなたの河:</p>
        <div className="flex flex-wrap gap-1 min-h-[52px] bg-green-800/50 p-1 rounded-md border border-green-600/50 mb-3">
          {playerState.river.map((discard: TileInRiver, i) => (
            <TileDisplay key={`player-river-${discard.id}-${i}`} tile={discard} className="w-8 h-12 sm:w-10 sm:h-16 text-xs" />
          ))}
        </div>

        {actionError && <div className="text-red-400 bg-red-900/50 p-2 rounded-md mb-3 text-sm">エラー: {actionError}</div>}
        {gameState.lastActionMessage && <div className="text-blue-300 bg-blue-900/50 p-2 rounded-md mb-3 text-sm">情報: {gameState.lastActionMessage}</div>}

        {/* Player Action Buttons */}
        {gameState.currentTurn === 'player' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-3">
            {canRiichi && playerState.hand.length === 14 && (
              <button type="button" onClick={handleRiichi} disabled={isLoading || !selectedTileForRiichi} className="clay-button action-button riichi-button enabled:hover:bg-yellow-600 disabled:opacity-50">{isLoading ? "処理中..." : "リーチ"}</button>
            )}
            {canTsumoAgari && playerState.hand.length === 14 && (
              <button type="button" onClick={handleTsumoAgari} disabled={isLoading} className="clay-button action-button tsumoagari-button enabled:hover:bg-green-500 disabled:opacity-50">{isLoading ? "処理中..." : "ツモ和了"}</button>
            )}
            {canPlayerPerformKan && playerState.hand.length === 14 && (
              <button type="button" onClick={handleKan} disabled={isLoading} className="clay-button action-button kan-button enabled:hover:bg-blue-600 disabled:opacity-50">{isLoading ? "処理中..." : "カン"}</button>
            )}
            {canRon && (
              <button type="button" onClick={handleRon} disabled={isLoading} className="clay-button action-button ron-button enabled:hover:bg-pink-600 disabled:opacity-50">{isLoading ? "処理中..." : "ロン"}</button>
            )}
          </div>
        )}
      </div>

      {showResultModal && gameState && (
        <GameResultModal
          gameState={gameState}
          onClose={() => setShowResultModal(false)}
          onNewGame={startNewGame}
        />
      )}
    </div>
  );
}
