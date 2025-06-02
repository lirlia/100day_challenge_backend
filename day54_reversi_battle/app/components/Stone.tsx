'use client';

import { motion } from 'framer-motion';
import { CellState } from '@/lib/reversi-engine';

interface StoneProps {
  state: CellState;
  isFlipping?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function Stone({ state, isFlipping = false, size = 'medium' }: StoneProps) {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-14 h-14',
    large: 'w-20 h-20',
  };

  if (state === 'empty') {
    return null;
  }

  const stoneVariants = {
    initial: { scale: 0, rotateY: 0 },
    animate: {
      scale: 1,
      rotateY: isFlipping ? 360 : 0,
      transition: {
        scale: { type: "spring", stiffness: 300, damping: 20 },
        rotateY: { duration: 0.6, ease: "easeInOut" }
      }
    },
    hover: {
      scale: 1.1,
      y: -2,
      rotateX: -10,
      transition: { duration: 0.2 }
    }
  };

  // 石の色に応じたスタイル設定
  const stoneColors = {
    black: {
      front: 'radial-gradient(ellipse at 30% 30%, #4a4a4a, #2a2a2a 40%, #0a0a0a 70%, #000000)',
      back: 'radial-gradient(ellipse at 30% 30%, #3a3a3a, #1a1a1a 40%, #000000 70%, #000000)',
      glow: 'rgba(0, 255, 255, 0.7)',
      highlight: 'rgba(0, 255, 255, 0.9)',
      border: 'rgba(0, 255, 255, 0.6)'
    },
    white: {
      front: 'radial-gradient(ellipse at 30% 30%, #ffffff, #f0f0f0 40%, #e0e0e0 70%, #cccccc)',
      back: 'radial-gradient(ellipse at 30% 30%, #f5f5f5, #e5e5e5 40%, #d0d0d0 70%, #bbbbbb)',
      glow: 'rgba(255, 0, 255, 0.7)',
      highlight: 'rgba(255, 0, 255, 0.9)',
      border: 'rgba(255, 0, 255, 0.6)'
    }
  };

  const colors = stoneColors[state];

  return (
    <motion.div
      className={`${sizeClasses[size]} absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 cursor-pointer`}
      variants={stoneVariants}
      initial="initial"
      animate="animate"
      whileHover="hover"
      style={{
        perspective: '200px',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* 3D石の本体 */}
      <div
        className="relative w-full h-full"
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        {/* 前面 */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: colors.front,
            boxShadow: `
              0 6px 20px rgba(0, 0, 0, 0.8),
              0 2px 8px rgba(0, 0, 0, 0.6),
              0 0 15px ${colors.glow},
              inset 0 2px 4px rgba(255, 255, 255, ${state === 'black' ? '0.1' : '0.8'}),
              inset 0 -2px 4px rgba(0, 0, 0, ${state === 'black' ? '0.3' : '0.1'})
            `,
            border: `1px solid ${colors.border}`,
            transform: 'translateZ(3px)',
          }}
        >
          {/* 前面のハイライト */}
          <div
            className="absolute top-1 left-1 rounded-full"
            style={{
              width: size === 'large' ? '24px' : size === 'medium' ? '16px' : '12px',
              height: size === 'large' ? '24px' : size === 'medium' ? '16px' : '12px',
              background: `radial-gradient(circle at 40% 40%, ${colors.highlight} 0%, rgba(255, 255, 255, ${state === 'black' ? '0.3' : '0.6'}) 30%, transparent 70%)`,
              filter: 'blur(0.5px)',
              opacity: 0.9
            }}
          />

          {/* 前面の光の反射 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: state === 'black'
                ? 'linear-gradient(145deg, rgba(0, 255, 255, 0.3) 0%, transparent 30%, transparent 70%, rgba(0, 0, 0, 0.4) 100%)'
                : 'linear-gradient(145deg, rgba(255, 255, 255, 0.8) 0%, transparent 30%, transparent 70%, rgba(0, 0, 0, 0.2) 100%)'
            }}
          />
        </div>

        {/* 背面 */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: colors.back,
            boxShadow: `
              0 6px 20px rgba(0, 0, 0, 0.6),
              0 0 10px ${colors.glow},
              inset 0 2px 4px rgba(255, 255, 255, ${state === 'black' ? '0.05' : '0.6'}),
              inset 0 -2px 4px rgba(0, 0, 0, ${state === 'black' ? '0.4' : '0.2'})
            `,
            border: `1px solid ${colors.border}`,
            transform: 'translateZ(-3px) rotateY(180deg)',
          }}
        />

        {/* ネオングロー効果 */}
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${colors.glow.replace('0.7', '0.3')}, transparent 70%)`,
            transform: 'translateZ(4px)',
          }}
          animate={{
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      {/* 底面の影効果 */}
      <div
        className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1 w-4/5 h-2 rounded-full opacity-40"
        style={{
          background: state === 'black'
            ? 'radial-gradient(ellipse, rgba(0, 0, 0, 0.8), transparent)'
            : 'radial-gradient(ellipse, rgba(0, 0, 0, 0.4), transparent)',
          filter: 'blur(2px)',
          zIndex: -1
        }}
      />

      {/* 配置時のパルスエフェクト */}
      {isFlipping && (
        <motion.div
          className="absolute -inset-4 rounded-full"
          style={{
            border: `3px solid ${colors.border.replace('0.6', '1')}`,
            boxShadow: `0 0 40px ${colors.glow}`
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      )}

      {/* 動的グロー効果 */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow: `0 0 25px ${colors.glow}`,
          transform: 'translateZ(5px)',
        }}
        animate={{
          boxShadow: [
            `0 0 25px ${colors.glow}`,
            `0 0 35px ${colors.glow.replace('0.7', '1')}`,
            `0 0 25px ${colors.glow}`
          ]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
    </motion.div>
  );
}
