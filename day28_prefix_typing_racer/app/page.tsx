'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const GAME_DURATION_SECONDS = 60;

export default function HomePage() {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'finished'>('idle');
  const [prefix, setPrefix] = useState<string>('');
  const [score, setScore] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_DURATION_SECONDS);
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // タイマー処理
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    } else if (timeLeft === 0 && gameState === 'playing') {
      setGameState('finished');
      if (timerRef.current) clearTimeout(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gameState, timeLeft]);

  // ゲーム開始処理
  const startGame = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/game/start');
      if (!response.ok) {
        throw new Error('Failed to start game');
      }
      const data = await response.json();
      setPrefix(data.prefix);
      setScore(0);
      setTimeLeft(GAME_DURATION_SECONDS);
      setInputValue('');
      setGameState('playing');
      inputRef.current?.focus(); // 開始時にinputにフォーカス
    } catch (error) {
      console.error('Error starting game:', error);
      setFeedback('ゲームの開始に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 単語提出処理
  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputValue || isLoading || gameState !== 'playing') return;

    setIsLoading(true);
    setFeedback(null);
    const submittedWord = inputValue;
    setInputValue(''); // 入力欄をクリア

    try {
      const response = await fetch('/api/game/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPrefix: prefix, typedWord: submittedWord }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // エラーボディ取得試行
        throw new Error(errorData.error || 'Failed to submit word');
      }

      const result = await response.json();

      if (result.isValid) {
        setScore((prevScore) => prevScore + result.scoreIncrement);
        setFeedback('正解！ 🎉');
      } else {
        // 不正解の理由に応じてフィードバック
        if (result.reason === 'wrong_prefix') {
            setFeedback(`'${prefix}' で始まっていません... 😥`);
        } else if (result.reason === 'not_a_word') {
            setFeedback('辞書にない単語です... 🤔');
        } else {
            setFeedback('不正解... 😭');
        }
      }
      setPrefix(result.nextPrefix); // 次の接頭辞を設定

      // フィードバックを短時間表示して消す
      setTimeout(() => setFeedback(null), 1500);

    } catch (error) {
      console.error('Error submitting word:', error);
      setFeedback('エラーが発生しました。');
       // エラーが起きても次の問題に進む（APIが nextPrefix を返せなかった場合を除く）
       // 必要ならここでゲームを停止するなどの処理を追加
    } finally {
      setIsLoading(false);
      inputRef.current?.focus(); // 次の問題のためにフォーカス
    }
  }, [inputValue, prefix, isLoading, gameState]);

  // リセット処理
  const resetGame = () => {
    setGameState('idle');
    setPrefix('');
    setScore(0);
    setTimeLeft(GAME_DURATION_SECONDS);
    setInputValue('');
    setIsLoading(false);
    setFeedback(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-sky-50 to-indigo-100 font-sans p-4">
      <h1 className="text-4xl font-bold text-indigo-700 mb-8">Day 28 - Prefix Typing Racer</h1>

      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8 text-center">
        {gameState === 'idle' && (
          <button
            onClick={startGame}
            disabled={isLoading}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition duration-200 disabled:opacity-50"
          >
            {isLoading ? '準備中...' : 'ゲーム開始'}
          </button>
        )}

        {gameState === 'playing' && (
          <>
            <div className="flex justify-between items-center mb-6">
              <div className="text-lg font-medium text-gray-600">Score: <span className="font-bold text-indigo-600">{score}</span></div>
              <div className="text-lg font-medium text-gray-600">Time: <span className="font-bold text-red-500">{timeLeft}</span></div>
            </div>
            <div className="mb-6">
              <p className="text-sm text-gray-500 mb-1">この接頭辞で始まる単語を入力:</p>
              <p className="text-5xl font-bold tracking-wider text-gray-800 mb-4 font-mono">{prefix}</p>
            </div>
            <form onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toLowerCase())} // 小文字に統一
                disabled={isLoading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4 font-mono lowercase"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                autoFocus
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue}
                className="w-full px-6 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition duration-200 disabled:opacity-50"
              >
                {isLoading ? '判定中...' : '提出'}
              </button>
            </form>
            {feedback && (
              <p className={`mt-4 text-lg ${feedback.includes('正解') ? 'text-green-600' : 'text-red-600'}`}>
                {feedback}
              </p>
            )}
          </>
        )}

        {gameState === 'finished' && (
          <div className="flex flex-col items-center">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">ゲーム終了！</h2>
            <p className="text-xl text-gray-600 mb-6">最終スコア: <span className="font-bold text-indigo-600">{score}</span></p>
            <button
              onClick={resetGame}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition duration-200"
            >
              もう一度プレイ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
