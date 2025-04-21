'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Board, BOARD_SIZE, buildStateFromEvents, isGameWon, solveLightsOut,
    LightToggledPayload, GameInitializedPayload,
    safeParsePayload
} from '../_lib/gameLogic';
import { DomainEvent, Prisma } from '../generated/prisma';

// 座標の型定義
type Coords = { row: number; col: number };

export default function GameClient({ gameId }: { gameId: string }) {
  console.log('GameClient mounted with gameId:', gameId);
  // 状態管理
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [moves, setMoves] = useState<number>(0);
  const [isWon, setIsWon] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [displaySequence, setDisplaySequence] = useState<number | undefined>(undefined);
  const [hintCoords, setHintCoords] = useState<Coords | null>(null);
  const hintTimeoutId = useRef<NodeJS.Timeout | null>(null);

  const isHistoryView = displaySequence !== undefined;

  // 表示用の盤面状態を計算 (メモ化)
  const displayedBoard = useMemo(() => {
    console.log('Calculating displayedBoard with events:', events);
    if (!events.length) {
      console.log('No events found, returning null for displayedBoard.');
      return null;
    }
    try {
      const board = buildStateFromEvents(events, displaySequence);
      console.log('Successfully built board state:', board);
      return board;
    } catch (e) {
      console.error('Error building board state:', e);
      setError('Failed to build board state.');
      return null;
    }
  }, [events, displaySequence]);

  // 表示用の手数を計算 (メモ化)
  const displayedMoves = useMemo(() => {
    if (displaySequence === undefined) return moves;
    return events.filter(e => e.type === 'LightToggled' && e.sequence <= displaySequence).length;
  }, [events, moves, displaySequence]);

  // イベントを取得して状態を更新する関数
  const fetchEventsAndUpdateState = useCallback(async () => {
    if (!gameId) {
      console.warn('fetchEventsAndUpdateState called without gameId');
      setIsLoading(false);
      setError('Game ID is missing.');
      return;
    }
    console.log(`Fetching events for gameId: ${gameId}...`);
    try {
      const response = await fetch(`/api/games/${gameId}/events`);
      console.log('Fetch response status:', response.status);
      if (!response.ok) {
        throw new Error(`Failed to fetch events (status: ${response.status})`);
      }
      const newEvents = await response.json() as DomainEvent[];
      console.log('Fetched events data:', newEvents);
      if (!Array.isArray(newEvents)) {
        throw new Error('Invalid events data received from API');
      }
      setEvents(newEvents);
      const latestMoves = newEvents.filter(e => e.type === 'LightToggled').length;
      const latestBoard = newEvents.length > 0 ? buildStateFromEvents(newEvents) : null;
      const latestIsWon = latestBoard ? isGameWon(latestBoard) : false;
      setMoves(latestMoves);
      setIsWon(latestIsWon);
      setError(null);
    } catch (e) {
      console.error('Error fetching events:', e);
      setError(e instanceof Error ? e.message : 'Unknown error fetching events');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  // 初期化時および gameId 変更時にイベントを取得
  useEffect(() => {
    console.log('GameClient useEffect triggered with gameId:', gameId);
    if (gameId) {
        setIsLoading(true);
        fetchEventsAndUpdateState();
    } else {
        console.warn("GameClient mounted without valid gameId.");
        setIsLoading(false);
        setError("Game ID is missing.");
    }
    return () => {
      if (hintTimeoutId.current) {
        clearTimeout(hintTimeoutId.current);
      }
    };
  }, [gameId, fetchEventsAndUpdateState]);

  // ライトをクリックしたときの処理
  const handleLightClick = async (row: number, col: number) => {
    if (isHistoryView || isProcessing || isWon || !gameId) return;
    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/games/${gameId}/moves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row, col }),
      });
      if (!response.ok) {
        let errorMsg = 'Failed to process move';
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      await fetchEventsAndUpdateState();
    } catch (e) {
      console.error('Error processing move:', e);
      setError(e instanceof Error ? e.message : 'Unknown error processing move');
    } finally {
      setIsProcessing(false);
    }
  };

  // ヒントボタンのクリックハンドラ
  const handleHintClick = useCallback(() => {
    if (!displayedBoard || isWon || isHistoryView) return;
    const solution = solveLightsOut(displayedBoard);
    if (!solution) {
      console.error('No solution found!');
      alert('Could not find a solution for the current board.');
      return;
    }
    let nextMove: Coords | null = null;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (solution[r][c]) {
          nextMove = { row: r, col: c };
          break;
        }
      }
      if (nextMove) break;
    }
    if (!nextMove) {
      console.log('Board is already solved or no next move needed according to solver.');
      alert('The board seems to be solved already!');
      return;
    }
    if (hintTimeoutId.current) {
      clearTimeout(hintTimeoutId.current);
    }
    setHintCoords(nextMove);
    hintTimeoutId.current = setTimeout(() => {
      setHintCoords(null);
    }, 3000);
  }, [displayedBoard, isWon, isHistoryView]);

  // ライトのスタイルを計算する関数
  const lightStyle = (isOn: boolean, row: number, col: number) => {
    const isHint = hintCoords?.row === row && hintCoords?.col === col;
    return `
      w-12 h-12 border rounded-md transition-colors duration-150 ease-out
      flex items-center justify-center text-xl font-bold
      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
      ${isOn ? 'bg-yellow-400 border-yellow-500 shadow-inner' : 'bg-gray-600 border-gray-700 shadow-md'}
      ${!isHistoryView && !isProcessing && !isWon ? 'hover:bg-opacity-80 active:scale-95 cursor-pointer' : 'cursor-default'}
      ${isHint ? 'border-4 border-green-500 animate-pulse' : ''}
      disabled:opacity-50 disabled:cursor-not-allowed
    `;
  };

  // New Game ボタンのハンドラ (ページリロード)
  const handleNewGame = () => {
      window.location.reload();
  };

  // 履歴クリックのハンドラ
  const handleHistoryClick = (sequence: number) => {
      setDisplaySequence(sequence);
      setHintCoords(null);
      if(hintTimeoutId.current) clearTimeout(hintTimeoutId.current);
  };

  // 最新の状態に戻るハンドラ
  const handleBackToLatest = () => {
      setDisplaySequence(undefined);
      setHintCoords(null);
      if(hintTimeoutId.current) clearTimeout(hintTimeoutId.current);
  };

  if (isLoading) {
    // isLoading が true の間は、全体的なローディング表示を返す
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl text-gray-400 animate-pulse">Loading Game...</p>
      </div>
    );
  }

  // ローディング完了後のエラー表示
  if (error) return <div className="text-center p-4 text-red-500">Error: {error} <button onClick={fetchEventsAndUpdateState} className="ml-2 px-2 py-1 bg-blue-500 text-white rounded">Retry</button></div>;

  // ローディング完了後、エラーはないがボードがない場合 (通常は発生しないはず)
  if (!displayedBoard) return <div className="text-center p-4">No game state available (after load).</div>;

  // ローディング完了、エラーなし、ボードありの場合、2ペインレイアウトを表示
  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto p-4">
      {/* Left Pane: Game Board and Controls */}
      <div className={`flex-1 flex flex-col items-center p-4 bg-gray-800 rounded-lg shadow-lg border-4 ${isHistoryView ? 'border-blue-600' : 'border-gray-700'} transition-colors`}>
        <div className="w-full flex justify-between items-center mb-4 px-2">
          <span className="text-lg font-semibold text-gray-300">
            Moves: {displayedMoves} {isHistoryView ? `(Viewing Seq ${displaySequence})` : ''}
          </span>
          <div>
            <button
                onClick={handleHintClick}
                disabled={isWon || isHistoryView || !displayedBoard}
                className="px-3 py-1 mr-2 bg-green-600 hover:bg-green-700 text-white rounded shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
                Hint
            </button>
            <button
                onClick={handleNewGame}
                disabled={isLoading || isProcessing}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
                New Game
            </button>
           </div>
        </div>

        {displayedBoard && (
            <div className="grid gap-1 my-auto" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}>
              {displayedBoard.map((rowArr, rowIndex) =>
                rowArr.map((isOn, colIndex) => (
                  <button
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => handleLightClick(rowIndex, colIndex)}
                    className={lightStyle(isOn, rowIndex, colIndex)}
                    disabled={isHistoryView || isProcessing || isWon}
                    aria-label={`Light at row ${rowIndex + 1}, column ${colIndex + 1} is ${isOn ? 'on' : 'off'}`}
                  />
                ))
              )}
            </div>
        )}

        {isWon && !isHistoryView && (
            <div className="mt-auto w-full p-4 bg-green-600 text-white text-center rounded-b-lg shadow">
              <h2 className="text-2xl font-bold">Congratulations!</h2>
              <p>You solved the puzzle in {moves} moves!</p>
            </div>
        )}
         {!isWon && <div className="h-20 flex-shrink-0"></div>}
      </div>

      {/* Right Pane: History */}
      <div className="w-full md:w-1/3 p-4 bg-gray-700 rounded-lg shadow-lg flex flex-col">
         <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-200">History</h2>
            {isHistoryView && (
                <button onClick={handleBackToLatest} className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded shadow"> Back to Latest </button>
            )}
        </div>
        <div className="flex-grow h-96 overflow-y-auto bg-gray-800 p-2 rounded text-sm space-y-1">
          {/* History List */}
          <ul>
            {events.length === 0 && !isLoading && (<p className="text-gray-400 p-2">No history yet.</p>)}
            {events.slice().reverse().map((event) => {
              const isSelected = displaySequence === event.sequence;
              const baseStyle = `p-1.5 border-b border-gray-700 hover:bg-gray-600 rounded transition-colors`;
              const selectedStyle = isSelected ? 'bg-blue-800 ring-1 ring-blue-500' : '';
              let eventText = '';
              if (event.type === 'GameInitialized') {
                  eventText = 'Game Start';
              } else if (event.type === 'LightToggled') {
                  const payload = safeParsePayload<LightToggledPayload>(event.payload);
                  eventText = payload ? `Toggle (${payload.row}, ${payload.col})` : 'Toggle (invalid payload)';
              } else if (event.type === 'GameWon') {
                  eventText = '🎉 Game Won!';
              }

              return (
                <li
                    key={event.id}
                    onClick={() => event.type !== 'GameInitialized' && handleHistoryClick(event.sequence)}
                    className={`${baseStyle} ${event.type === 'GameInitialized' ? 'text-gray-500' : 'text-gray-300'} ${event.type !== 'GameInitialized' ? 'cursor-pointer' : 'cursor-default'} ${selectedStyle}`}
                >
                   Seq {event.sequence}: {eventText}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <style jsx global>{`
          @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.7; transform: scale(1.05); }
          }
          .animate-pulse {
              animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
      `}</style>
    </div>
  );
}
