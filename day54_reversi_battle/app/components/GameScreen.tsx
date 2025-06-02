'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ReversiEngine, GameState } from '@/lib/reversi-engine';
import Board from './Board';
import GameInfo from './GameInfo';

interface GameScreenProps {
  onBackToTitle: () => void;
}

interface GameEffect {
  id: string;
  type: 'shock_wave' | 'particle_burst' | 'chain_reaction' | 'stone_place';
  position: { row: number; col: number };
  color: 'blue' | 'pink' | 'green' | 'white';
}

export default function GameScreen({ onBackToTitle }: GameScreenProps) {
  const [engine] = useState(() => new ReversiEngine());
  const [gameState, setGameState] = useState<GameState>(() => engine.getGameState());
  const [flippingCells, setFlippingCells] = useState<{ row: number; col: number }[]>([]);
  const [gameEffects, setGameEffects] = useState<GameEffect[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // ゲーム状態を更新
  const updateGameState = useCallback(() => {
    setGameState(engine.getGameState());
  }, [engine]);

  // エフェクトを生成
  const createEffect = (type: GameEffect['type'], position: { row: number; col: number }, color: GameEffect['color']): GameEffect => {
    return {
      id: `${type}-${position.row}-${position.col}-${Date.now()}-${Math.random()}`,
      type,
      position,
      color,
    };
  };

  // 複数のエフェクトを順次発生させる
  const triggerEffects = (effects: GameEffect[]) => {
    effects.forEach((effect, index) => {
      setTimeout(() => {
        setGameEffects(prev => [...prev, effect]);
      }, index * 50);
    });

    // エフェクトをクリア
    setTimeout(() => {
      setGameEffects([]);
    }, 1500);
  };

  // プレイヤーの手を処理
  const handleCellClick = useCallback(async (row: number, col: number) => {
    if (isProcessing || gameState.gameOver || gameState.currentPlayer !== 'black') {
      return;
    }

    setIsProcessing(true);

    // プレイヤーの手を実行
    const success = engine.makeMove(row, col, 'black');
    if (success) {
      // 配置した石と反転される石をハイライト
      const flippedStones = getFlippedStones(row, col, 'black');
      setFlippingCells([{ row, col }, ...flippedStones]);

      // エフェクトを生成
      const effects: GameEffect[] = [
        createEffect('stone_place', { row, col }, 'blue'),
        createEffect('shock_wave', { row, col }, 'blue'),
        ...flippedStones.map(stone => createEffect('chain_reaction', stone, 'blue')),
      ];

      // 複数の石が反転される場合はパーティクルバーストも追加
      if (flippedStones.length >= 3) {
        effects.push(createEffect('particle_burst', { row, col }, 'green'));
      }

      triggerEffects(effects);

      // 短いアニメーション時間でCPUの手番を処理
      setTimeout(() => {
        setFlippingCells([]);
        updateGameState();

        // CPUの手番を即座に処理
        setTimeout(() => {
          handleCPUTurn();
        }, 200);
      }, 600);
    } else {
      setIsProcessing(false);
    }
  }, [engine, gameState, isProcessing, updateGameState]);

  // 反転される石の位置を取得
  const getFlippedStones = (row: number, col: number, player: 'black' | 'white') => {
    const opponent = player === 'black' ? 'white' : 'black';
    const directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    const flipped: { row: number; col: number }[] = [];

    for (const [dr, dc] of directions) {
      const toFlip: { row: number; col: number }[] = [];
      let r = row + dr;
      let c = col + dc;

      // 反転対象の石を収集
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && gameState.board[r][c] === opponent) {
        toFlip.push({ row: r, col: c });
        r += dr;
        c += dc;
      }

      // 自分の石で挟まれている場合のみ反転リストに追加
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && gameState.board[r][c] === player && toFlip.length > 0) {
        flipped.push(...toFlip);
      }
    }

    return flipped;
  };

  // CPUの手を処理
  const handleCPUTurn = useCallback(() => {
    const currentState = engine.getGameState();

    if (currentState.gameOver || currentState.currentPlayer !== 'white') {
      setIsProcessing(false);
      return;
    }

    // CPUが有効な手を持っているかチェック
    if (currentState.validMoves.length === 0) {
      // CPUの手をスキップ
      engine.skipTurn();
      updateGameState();
      setIsProcessing(false);
      return;
    }

    // CPUの思考時間を最小限に（即座に実行）
    setTimeout(() => {
      const aiMove = engine.getAIMove('white');

      if (aiMove) {
        const success = engine.makeMove(aiMove.row, aiMove.col, 'white');

        if (success) {
          // CPUの手の反転アニメーション
          const flippedStones = getFlippedStones(aiMove.row, aiMove.col, 'white');
          setFlippingCells([aiMove, ...flippedStones]);

          // CPUのエフェクト（ピンク色）
          const effects: GameEffect[] = [
            createEffect('stone_place', aiMove, 'pink'),
            createEffect('shock_wave', aiMove, 'pink'),
            ...flippedStones.map(stone => createEffect('chain_reaction', stone, 'pink')),
          ];

          // 複数の石が反転される場合はパーティクルバーストも追加
          if (flippedStones.length >= 3) {
            effects.push(createEffect('particle_burst', aiMove, 'white'));
          }

          triggerEffects(effects);

          setTimeout(() => {
            setFlippingCells([]);
            updateGameState();
            setIsProcessing(false);
          }, 600);
        } else {
          setIsProcessing(false);
        }
      } else {
        setIsProcessing(false);
      }
    }, 100); // CPUの思考時間をさらに短縮
  }, [engine, updateGameState, gameState.board]);

  // ゲームリスタート
  const handleRestart = useCallback(() => {
    engine.reset();
    setFlippingCells([]);
    setGameEffects([]);
    setIsProcessing(false);
    updateGameState();
  }, [engine, updateGameState]);

  // プレイヤーがスキップする必要がある場合の処理
  useEffect(() => {
    if (!isProcessing && !gameState.gameOver && gameState.currentPlayer === 'black' && gameState.validMoves.length === 0) {
      // プレイヤーの有効な手がない場合、自動的にスキップ
      setTimeout(() => {
        engine.skipTurn();
        updateGameState();
        setTimeout(() => {
          handleCPUTurn();
        }, 200);
      }, 500); // スキップの待機時間を短縮
    }
  }, [gameState, isProcessing, engine, updateGameState, handleCPUTurn]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col items-center justify-center p-4 space-y-6"
    >
      {/* ゲームヘッダー - 修正されたレイアウト */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="w-full max-w-4xl"
      >
        {/* BACK TO TITLEボタンを独立した行に配置 */}
        <div className="flex justify-start mb-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBackToTitle}
            className="px-4 py-2 neon-border-pink text-neon-pink hover:bg-neon-pink hover:text-black transition-all duration-300 rounded-lg font-semibold text-sm"
          >
            ← BACK TO TITLE
          </motion.button>
        </div>

        {/* タイトルを中央に配置 */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-black neon-glow-blue">
            REVERSI BATTLE
          </h1>
        </div>
      </motion.div>

      {/* ゲーム情報パネル */}
      <motion.div
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <GameInfo
          gameState={gameState}
          onRestart={handleRestart}
        />
      </motion.div>

      {/* ゲームボード */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.6 }}
      >
        <Board
          gameState={gameState}
          onCellClick={handleCellClick}
          flippingCells={flippingCells}
          gameEffects={gameEffects}
        />
      </motion.div>

      {/* スキップ通知 - 短時間表示 */}
      {!isProcessing && !gameState.gameOver && gameState.validMoves.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-orange-600 to-red-600 px-4 py-2 rounded-lg neon-border-green z-40"
        >
          <div className="text-white font-semibold text-center text-sm">
            {gameState.currentPlayer === 'black' ? 'プレイヤー' : 'CPU'}パス
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
