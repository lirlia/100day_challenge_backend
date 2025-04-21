'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Board,
  BOARD_SIZE,
  buildStateFromEvents,
  PersistedGameEvent, // DBから取得するイベントの型
  isGameWon,
  LightToggledPayload, // Payload の型をインポート
} from '../_lib/gameLogic'; // 型や関数をインポート

// APIレスポンスの型定義
interface NewGameResponse {
  gameId: string;
}

interface MoveResponse {
  latestSequence: number;
}

// ダミーの初期盤面 (API連携前)
const dummyInitialBoard: Board = Array(BOARD_SIZE)
  .fill(null)
  .map(() => Array(BOARD_SIZE).fill(false));

// ライト（ボタン）のスタイル
const lightStyle = (isOn: boolean, isHistoryView: boolean): string => {
  return `
    w-12 h-12 border border-gray-400 rounded-md transition-colors duration-150
    flex items-center justify-center text-xl font-bold
    ${isOn ? 'bg-yellow-400 shadow-inner' : 'bg-gray-600 shadow-md'}
    ${!isHistoryView ? 'hover:bg-opacity-80 active:scale-95' : ''}
     disabled:opacity-50 ${isHistoryView ? 'cursor-default' : 'disabled:cursor-not-allowed'}
  `;
};

export default function GameClient() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [events, setEvents] = useState<PersistedGameEvent[]>([]);
  const [moves, setMoves] = useState<number>(0); // 最新の手数
  const [isWon, setIsWon] = useState<boolean>(false); // 最新のクリア状態
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessingMove, setIsProcessingMove] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [displaySequence, setDisplaySequence] = useState<number | null>(null); // 表示対象のシーケンス番号 (null は最新)

  // 表示する盤面状態を計算 (イベント履歴と表示シーケンスに依存)
  const displayedBoard: Board | null = useMemo(() => {
    console.log(`useMemo triggered. Events count: ${events.length}, Display Sequence: ${displaySequence}`); // ★ログ追加

    // イベントがまだ読み込まれていない場合は null
    if (events.length === 0) {
      console.log("useMemo: No events yet, returning null."); // ★ログ追加
      return null;
    }

    try {
      // targetSequence は null または number. null なら最新状態を意味するよう buildStateFromEvents に渡す
      const targetSeq = displaySequence === null ? undefined : displaySequence;
      console.log(`useMemo: Calling buildStateFromEvents for sequence: ${targetSeq === undefined ? 'latest' : targetSeq}`); // ★ログ追加

      // buildStateFromEvents を呼び出し
      const boardResult = buildStateFromEvents(events, targetSeq);

      console.log(`useMemo: buildStateFromEvents returned ${boardResult ? 'a board' : 'null/error'}.`); // ★ログ追加
      return boardResult; // 計算結果を返す

    } catch (err) {
      console.error('Failed to build board state in useMemo:', err);
      setError('盤面状態の構築中にエラーが発生しました。useMemo'); // エラー源を明記
      return null; // エラー時は null を返す
    }
  }, [events, displaySequence]); // 依存配列は events と displaySequence

  // 表示中の手数
  const displayedMoves = useMemo(() => {
      if (!displaySequence) return moves; // 最新状態なら state の手数
      return events.filter(e => e.type === 'LightToggled' && e.sequence <= displaySequence).length;
  }, [events, displaySequence, moves]);

  const isHistoryView = displaySequence !== null;

  // 特定の gameId のイベントを取得し、状態を更新する関数
  const fetchEventsAndUpdateState = useCallback(async (currentGameId: string) => {
    if (!currentGameId) return;
    // イベント取得中は表示シーケンスを最新に戻す
    setDisplaySequence(null);
    try {
      const response = await fetch(`/api/games/${currentGameId}/events`);
      if (!response.ok) {
        if (response.status === 404) {
          setError(`Game ${currentGameId} not found or has no events yet.`);
          setEvents([]);
          setMoves(0);
          setIsWon(false);
          return;
        }
        throw new Error(`Failed to fetch events: ${response.statusText}`);
      }

      const fetchedEvents: PersistedGameEvent[] = await response.json();
      console.log('Fetched events:', JSON.stringify(fetchedEvents, null, 2));

      if (fetchedEvents.length > 0) {
        const parsedEvents = fetchedEvents.map(event => ({
          ...event,
          payload: typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload,
        }));

        setEvents(parsedEvents); // イベント state を更新

        // 最新状態を計算して moves と isWon state を更新 (表示盤面は useMemo が担当)
        console.log(`Building latest board state for ${parsedEvents.length} events...`);
        const latestBoard = buildStateFromEvents(parsedEvents); // 最新を計算
        console.log('Built latest board:', JSON.stringify(latestBoard, null, 2));
        console.log('Finished building latest board state.');
        // setBoard(latestBoard); // ★ 不要なので削除

        const latestMoveCount = parsedEvents.filter(e => e.type === 'LightToggled').length;
        const latestIsWon = isGameWon(latestBoard);
        setMoves(latestMoveCount); // 最新の手数を保存
        setIsWon(latestIsWon); // 最新のクリア状態を保存
      } else {
        setEvents([]);
        setMoves(0);
        setIsWon(false);
      }
    } catch (err) {
      setError('イベント履歴の取得または状態の構築に失敗しました。');
      console.error(err);
      setEvents([]); // エラー時はクリア
      setMoves(0);
      setIsWon(false);
    }
  }, []);


  // ゲームの初期化処理
  const initializeGame = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setGameId(null);
    setEvents([]);
    setMoves(0);
    setIsWon(false);
    setDisplaySequence(null); // 表示シーケンスもリセット

    try {
      const response = await fetch('/api/games', { method: 'POST' });
      if (!response.ok) {
        console.error('initializeGame failed', response.status, response.statusText);
        setError('ゲームの初期化に失敗しました。');
        setIsLoading(false);
        return;
      }
      const data: NewGameResponse = await response.json();
      setGameId(data.gameId);
      await fetchEventsAndUpdateState(data.gameId);

    } catch (err) {
      setError('ゲームの初期化に失敗しました。');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchEventsAndUpdateState]);

  // 初回レンダリング時にゲームを初期化
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // ライトクリック処理
  const handleLightClick = async (row: number, col: number) => {
    if (isHistoryView || !gameId || isProcessingMove || isWon) return;

    setIsProcessingMove(true);
    setError(null);

    try {
      const response = await fetch(`/api/games/${gameId}/moves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row, col }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process move');
      }
      await fetchEventsAndUpdateState(gameId);

    } catch (err: any) {
      setError(`操作に失敗しました: ${err.message}`);
      console.error(err);
    } finally {
      setIsProcessingMove(false);
    }
  };

  // 新しいゲームボタンの処理
  const handleNewGame = () => {
    initializeGame();
  };

  // 履歴クリック処理
  const handleHistoryClick = (sequence: number) => {
    setDisplaySequence(sequence);
  };

  // 最新の状態に戻る処理
  const handleBackToLatest = () => {
    setDisplaySequence(null);
  };

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Left Pane */}
      <div className={`flex-1 flex flex-col items-center p-4 bg-gray-800 rounded-lg shadow-lg border-4 ${isHistoryView ? 'border-blue-500' : 'border-gray-600'} transition-colors`}>
        <div className="w-full flex justify-between items-center mb-4 px-2">
          <span className="text-lg font-semibold text-gray-300">
            Moves: {displayedMoves} {isHistoryView ? `(Viewing Seq ${displaySequence})` : ''}
          </span>
          <button
            onClick={handleNewGame}
            disabled={isLoading || isProcessingMove}
            className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            New Game
          </button>
        </div>

        {isLoading ? (
          <div className="flex-grow flex items-center justify-center">
            <p className="text-white text-xl">Loading Game...</p>
          </div>
        ) : error ? (
          <div className="flex-grow flex items-center justify-center p-4 text-center">
            <p className="text-red-400 text-xl">{error}</p>
          </div>
        ) : displayedBoard ? (
          <div className="grid gap-1 mt-8 mb-auto" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)` }}>
            {displayedBoard.map((rowArr, rowIndex) =>
              rowArr.map((isOn, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  onClick={() => handleLightClick(rowIndex, colIndex)}
                  className={lightStyle(isOn, isHistoryView)}
                  disabled={isHistoryView || isProcessingMove || isWon}
                >
                </button>
              ))
            )}
          </div>
        ) : (
           <div className="flex-grow flex items-center justify-center">
            <p className="text-white text-xl">Initializing board...</p>
          </div>
        )}

        {isWon && !isHistoryView && (
          <div className="mt-4 p-4 bg-green-600 text-white text-center rounded shadow w-full">
            <h2 className="text-2xl font-bold">Congratulations!</h2>
            <p>You solved the puzzle in {moves} moves!</p>
          </div>
        )}
      </div>

      {/* Right Pane */}
      <div className="w-full md:w-1/3 p-4 bg-gray-700 rounded-lg shadow-lg flex flex-col">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-200">History</h2>
            {isHistoryView && (
                <button
                    onClick={handleBackToLatest}
                    className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-500 text-white rounded shadow"
                >
                    Back to Latest
                </button>
            )}
        </div>
        <div className="flex-grow h-96 overflow-y-auto bg-gray-800 p-2 rounded text-sm">
          {events.length === 0 && !isLoading && (
             <p className="text-gray-400 p-2">No history yet.</p>
          )}
          <ul>
            {events.map((event) => {
               if (event.type === 'GameInitialized') {
                   return (
                       <li key={event.id} className={`p-1 border-b border-gray-700 text-gray-500 ${displaySequence === event.sequence ? 'bg-blue-900' : ''}`}>
                           Seq {event.sequence}: Game Start
                       </li>
                   );
               }
               const isSelected = displaySequence === event.sequence;
               return (
                   <li
                       key={event.id}
                       onClick={() => handleHistoryClick(event.sequence)}
                       className={`p-1 border-b border-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer ${isSelected ? 'bg-blue-900 font-semibold' : ''}`}
                    >
                     Seq {event.sequence}: {event.type}
                     {event.type === 'LightToggled' && ` (${(event.payload as LightToggledPayload).row}, ${(event.payload as LightToggledPayload).col})`}
                     {event.type === 'GameWon' && ' - Solved!'}
                   </li>
               );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
