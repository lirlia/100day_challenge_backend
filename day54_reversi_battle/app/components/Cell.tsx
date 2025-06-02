'use client';

import { motion } from 'framer-motion';
import { CellState } from '@/lib/reversi-engine';
import Stone from './Stone';

interface CellProps {
  state: CellState;
  row: number;
  col: number;
  isValidMove: boolean;
  isFlipping?: boolean;
  onClick: (row: number, col: number) => void;
}

export default function Cell({ state, row, col, isValidMove, isFlipping = false, onClick }: CellProps) {
  const handleClick = () => {
    if (isValidMove && state === 'empty') {
      onClick(row, col);
    }
  };

  const cellVariants = {
    hover: {
      scale: 1.05,
      boxShadow: isValidMove
        ? "0 0 25px rgba(0, 255, 0, 0.8), inset 0 0 15px rgba(0, 255, 0, 0.3)"
        : "0 0 15px rgba(100, 100, 100, 0.3)",
      transition: { duration: 0.2 }
    }
  };

  return (
    <motion.div
      className="relative w-16 h-16 border border-gray-600 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center cursor-pointer overflow-visible"
      variants={cellVariants}
      whileHover="hover"
      onClick={handleClick}
      style={{
        borderColor: isValidMove ? '#00FF00' : '#444',
        boxShadow: isValidMove
          ? '0 0 15px rgba(0, 255, 0, 0.7), inset 0 0 8px rgba(0, 255, 0, 0.3)'
          : 'inset 0 0 8px rgba(0, 0, 0, 0.6)'
      }}
    >
      {/* セルの背景グリッド効果 */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'linear-gradient(45deg, transparent 40%, rgba(0, 255, 255, 0.2) 50%, transparent 60%)',
          backgroundSize: '8px 8px'
        }}
      />

      {/* 配置可能位置のハイライト */}
      {isValidMove && state === 'empty' && (
        <motion.div
          className="absolute inset-1 rounded-full border-2 border-neon-green z-5"
          style={{
            boxShadow: '0 0 20px rgba(0, 255, 0, 0.8)',
            background: 'radial-gradient(circle, rgba(0, 255, 0, 0.3), transparent 70%)'
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.6, 0.9, 0.6],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}

      {/* 配置可能位置の中央ドット */}
      {isValidMove && state === 'empty' && (
        <motion.div
          className="w-4 h-4 rounded-full bg-neon-green z-5"
          style={{
            boxShadow: '0 0 15px rgba(0, 255, 0, 0.9)'
          }}
          animate={{
            scale: [0.8, 1.3, 0.8],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}

      {/* 石の表示 */}
      {state !== 'empty' && (
        <Stone
          state={state}
          isFlipping={isFlipping}
          size="medium"
        />
      )}

      {/* クリック時のリップル効果 */}
      {isValidMove && (
        <motion.div
          className="absolute inset-0 rounded-md"
          initial={{ scale: 0, opacity: 0 }}
          whileTap={{ scale: 1.5, opacity: 0.4 }}
          transition={{ duration: 0.3 }}
          style={{
            background: 'radial-gradient(circle, rgba(0, 255, 0, 0.5), transparent 70%)'
          }}
        />
      )}

      {/* セルの座標表示（デバッグ用、必要に応じて削除） */}
      <div className="absolute top-0 left-0 text-xs text-gray-500 opacity-30 pointer-events-none z-0">
        {row},{col}
      </div>
    </motion.div>
  );
}
