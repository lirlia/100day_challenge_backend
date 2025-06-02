'use client';

import { motion } from 'framer-motion';
import { GameState } from '@/lib/reversi-engine';
import Cell from './Cell';
import GameEffects from './GameEffects';

interface BoardProps {
  gameState: GameState;
  onCellClick: (row: number, col: number) => void;
  flippingCells?: { row: number; col: number }[];
  gameEffects?: Array<{
    id: string;
    type: 'shock_wave' | 'particle_burst' | 'chain_reaction' | 'stone_place';
    position: { row: number; col: number };
    color: 'blue' | 'pink' | 'green' | 'white';
  }>;
}

export default function Board({ gameState, onCellClick, flippingCells = [], gameEffects = [] }: BoardProps) {
  const { board, validMoves, currentPlayer } = gameState;

  // 指定されたセルが有効な手かどうかをチェック（プレイヤーの手番時のみ）
  const isValidMove = (row: number, col: number): boolean => {
    // CPUの手番中（white）は有効手を表示しない
    if (currentPlayer !== 'black') {
      return false;
    }
    return validMoves.some(move => move.row === row && move.col === col);
  };

  // 指定されたセルが反転中かどうかをチェック
  const isFlipping = (row: number, col: number): boolean => {
    return flippingCells.some(cell => cell.row === row && cell.col === col);
  };

  const boardVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: {
        duration: 0.8,
        ease: "easeOut",
        staggerChildren: 0.05,
        delayChildren: 0.2
      }
    }
  };

  const cellVariants = {
    initial: { scale: 0, rotateY: 180 },
    animate: {
      scale: 1,
      rotateY: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* ボードタイトル */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="mb-6"
      >
        <h2 className="text-3xl font-bold neon-glow-blue text-center">
          BATTLE ARENA
        </h2>
      </motion.div>

      {/* メインボード */}
      <motion.div
        className="relative p-4 rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(20, 20, 40, 0.9), rgba(40, 20, 60, 0.9))',
          border: '3px solid #00FFFF',
          boxShadow: '0 0 30px rgba(0, 255, 255, 0.5), inset 0 0 20px rgba(0, 255, 255, 0.1)'
        }}
        variants={boardVariants}
        initial="initial"
        animate="animate"
      >
        {/* ボードの装飾的なコーナー */}
        <div className="absolute -top-2 -left-2 w-8 h-8 border-l-4 border-t-4 border-neon-pink rounded-tl-lg"></div>
        <div className="absolute -top-2 -right-2 w-8 h-8 border-r-4 border-t-4 border-neon-pink rounded-tr-lg"></div>
        <div className="absolute -bottom-2 -left-2 w-8 h-8 border-l-4 border-b-4 border-neon-pink rounded-bl-lg"></div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 border-r-4 border-b-4 border-neon-pink rounded-br-lg"></div>

        {/* 8x8 グリッド */}
        <motion.div
          className="grid grid-cols-8 gap-1 p-2 rounded-lg relative"
          style={{
            background: 'linear-gradient(45deg, rgba(0, 0, 0, 0.8), rgba(20, 20, 20, 0.8))',
            border: '2px solid rgba(0, 255, 255, 0.3)'
          }}
        >
          {board.map((row, rowIndex) =>
            row.map((cellState, colIndex) => (
              <motion.div
                key={`${rowIndex}-${colIndex}`}
                variants={cellVariants}
                className="relative"
              >
                <Cell
                  state={cellState}
                  row={rowIndex}
                  col={colIndex}
                  isValidMove={isValidMove(rowIndex, colIndex)}
                  isFlipping={isFlipping(rowIndex, colIndex)}
                  onClick={onCellClick}
                />
              </motion.div>
            ))
          )}

          {/* ゲームエフェクトレイヤー */}
          <GameEffects effects={gameEffects} />
        </motion.div>

        {/* ボード周囲のネオンパルス */}
        <motion.div
          className="absolute -inset-1 rounded-2xl pointer-events-none"
          style={{
            border: '2px solid transparent',
            background: 'linear-gradient(45deg, #00FFFF, #FF00FF, #00FF00, #00FFFF) border-box',
            WebkitMask: 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'exclude'
          }}
          animate={{
            background: [
              'linear-gradient(45deg, #00FFFF, #FF00FF, #00FF00, #00FFFF)',
              'linear-gradient(90deg, #FF00FF, #00FF00, #00FFFF, #FF00FF)',
              'linear-gradient(135deg, #00FF00, #00FFFF, #FF00FF, #00FF00)',
              'linear-gradient(180deg, #00FFFF, #FF00FF, #00FF00, #00FFFF)',
            ]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear"
          }}
        />

        {/* バトルエフェクト（有効手がある場合の演出） */}
        {validMoves.length > 0 && currentPlayer === 'black' && (
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background: 'radial-gradient(circle at center, rgba(0, 255, 0, 0.1), transparent 60%)'
            }}
            animate={{
              scale: [1, 1.02, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        )}
      </motion.div>

      {/* ボード下部の装飾ライン */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{ delay: 1, duration: 1 }}
        className="mt-4 h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent max-w-lg"
      />
    </div>
  );
}
