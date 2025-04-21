'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, BOARD_SIZE, buildStateFromEvents, isGameWon, solveLightsOut } from '../_lib/gameLogic';
import { DomainEvent } from '../generated/prisma';

// 座標の型定義
type Coords = { row: number; col: number };

export default function GameClient({ gameId }: { gameId: string }) {
  console.log('GameClient mounted with gameId:', gameId); // gameId 確認ログ
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

  // 表示用の盤面状態を計算 (メモ化)
  const displayedBoard = useMemo(() => {
    console.log('Calculating displayedBoard with events:', events); // イベント確認ログ
    if (!events.length) {
      console.log('No events found, returning null for displayedBoard.');
      return null;
    }
    try {
      const board = buildStateFromEvents(events, displaySequence);
      console.log('Successfully built board state:', board); // 構築成功ログ
      return board;
    } catch (e) {
      console.error('Error building board state:', e); // エラーログ
      setError('Failed to build board state.'); // エラー状態を設定
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
      // setIsLoading(true); // useEffect で設定するので不要
      const response = await fetch(`/api/games/${gameId}/events`);
      console.log('Fetch response status:', response.status); // レスポンスステータス確認
      if (!response.ok) {
        throw new Error(`Failed to fetch events (status: ${response.status})`);
      }
      const newEvents = await response.json() as DomainEvent[];
      console.log('Fetched events data:', newEvents); // ★取得したイベントデータ確認
      if (!Array.isArray(newEvents)) {
        throw new Error('Invalid events data received from API');
      }
      setEvents(newEvents);
      setMoves(newEvents.filter(e => e.type === 'LightToggled').length);
      setIsWon(newEvents.some(e => e.type === 'GameWon'));
      setError(null); // 成功したらエラークリア
    } catch (e) {
      console.error('Error fetching events:', e);
      setError(e instanceof Error ? e.message : 'Unknown error fetching events');
      setEvents([]); // エラー時はイベントを空にする
    } finally {
      setIsLoading(false);
    }
  }, [gameId]);

  // 初期化時にイベントを取得
  useEffect(() => {
    console.log('GameClient useEffect triggered with gameId:', gameId);
    if (gameId) { // gameId が存在する場合のみ実行
        setIsLoading(true); // ローディング開始
        fetchEventsAndUpdateState();
    } else {
        console.warn("GameClient mounted without valid gameId.");
        setIsLoading(false); // gameId がなければローディング終了
        setError("Game ID is missing."); // エラー表示
    }
    // クリーンアップ関数でタイムアウトをクリア
    return () => {
      if (hintTimeoutId.current) {
        clearTimeout(hintTimeoutId.current);
      }
    };
  }, [gameId, fetchEventsAndUpdateState]);

  // ライトをクリックしたときの処理
  const handleLightClick = async (row: number, col: number) => {
    if (isProcessing || isWon || displaySequence !== undefined || !gameId) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/games/${gameId}/moves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row, col }),
      });
      if (!response.ok) throw new Error('Failed to process move');
      await fetchEventsAndUpdateState(); // 状態を再取得
    } catch (e) {
      console.error('Error processing move:', e);
      setError(e instanceof Error ? e.message : 'Unknown error processing move');
    } finally {
      setIsProcessing(false);
    }
  };

  // ヒントボタンのクリックハンドラ
  const handleHintClick = useCallback(() => {
    if (!displayedBoard || isWon || displaySequence !== undefined) return;

    // 解法を計算
    const solution = solveLightsOut(displayedBoard);
    if (!solution) {
      console.error('No solution found!');
      alert('Could not find a solution for the current board.'); // ユーザーへのフィードバック
      return;
    }

    // 最初に押すべきボタンを探す
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
      // すべてクリア済みか、解法はあるが押す必要がない場合 (理論上は起こらないはず)
      console.log('Board is already solved or no next move needed according to solver.');
      alert('The board seems to be solved already!');
      return;
    }

    // 既存のタイマーをクリア
    if (hintTimeoutId.current) {
      clearTimeout(hintTimeoutId.current);
    }

    // ヒントを表示し、3秒後に消す
    setHintCoords(nextMove);
    hintTimeoutId.current = setTimeout(() => {
      setHintCoords(null);
    }, 3000);
  }, [displayedBoard, isWon, displaySequence]);

  // ライトのスタイルを計算する関数
  const lightStyle = (isOn: boolean, row: number, col: number) => {
    const isHint = hintCoords?.row === row && hintCoords?.col === col;
    return {
      width: '50px',
      height: '50px',
      backgroundColor: isOn ? '#ffeb3b' : '#424242',
      border: isHint ? '3px solid #4caf50' : '1px solid #212121',
      borderRadius: '4px',
      cursor: isProcessing || isWon || displaySequence !== undefined ? 'default' : 'pointer',
      transition: 'all 0.3s ease',
      animation: isHint ? 'pulse 1.5s infinite' : undefined,
    };
  };

  if (isLoading) return <div className="text-center p-4">Loading Game...</div>;
  // エラー表示を改善
  if (error) return <div className="text-center p-4 text-red-500">Error: {error} <button onClick={fetchEventsAndUpdateState} className="ml-2 px-2 py-1 bg-blue-500 text-white rounded">Retry</button></div>;
  if (!displayedBoard) return <div className="text-center p-4">No game state available</div>;

  return (
    <div className="container mx-auto p-4">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-4">Lights Out Game</h1>
        <div className="flex justify-center gap-4 mb-4">
          <button
            onClick={() => setDisplaySequence(undefined)}
            disabled={displaySequence === undefined}
            className={`px-4 py-2 rounded ${
              displaySequence === undefined
                ? 'bg-blue-600 text-white'
                : 'bg-blue-200 hover:bg-blue-300'
            }`}
          >
            Current
          </button>
          <button
            onClick={() => {
              const maxSeq = Math.max(...events.map(e => e.sequence), 0); // 空配列対策
              setDisplaySequence(s =>
                s === undefined ? maxSeq : Math.max(0, s - 1) // 初期化イベント(seq=0)も考慮
              );
            }}
            disabled={!events.length}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
          >
            ←
          </button>
          <button
            onClick={() => {
              const maxSeq = Math.max(...events.map(e => e.sequence), 0);
              setDisplaySequence(s =>
                s === undefined ? undefined : Math.min(maxSeq, s + 1)
              );
            }}
            disabled={!events.length || displaySequence === undefined || displaySequence === Math.max(...events.map(e => e.sequence), 0)}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
          >
            →
          </button>
          <button
            onClick={handleHintClick}
            disabled={isWon || displaySequence !== undefined}
            className={`px-4 py-2 rounded ${
              isWon || displaySequence !== undefined
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            Hint
          </button>
        </div>
        <div className="mb-4">
          Moves: {displayedMoves}
          {isWon && <span className="ml-2 text-green-500">🎉 Cleared!</span>}
          {displaySequence !== undefined && <span className="ml-2 text-gray-500">(History Seq: {displaySequence})</span>}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        {displayedBoard.map((row, r) => (
          <div key={r} className="flex gap-1">
            {row.map((isOn, c) => (
              <button
                key={`${r}-${c}`}
                onClick={() => handleLightClick(r, c)}
                disabled={isProcessing || isWon || displaySequence !== undefined}
                style={lightStyle(isOn, r, c)}
                className="focus:outline-none"
              />
            ))}
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
