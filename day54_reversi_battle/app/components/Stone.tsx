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
      boxShadow: state === 'black'
        ? "0 0 25px rgba(0, 255, 255, 0.9)"
        : "0 0 25px rgba(255, 0, 255, 0.9)",
      transition: { duration: 0.2 }
    }
  };

  return (
    <motion.div
      className={`${sizeClasses[size]} rounded-full border-2 relative overflow-hidden cursor-pointer absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10`}
      variants={stoneVariants}
      initial="initial"
      animate="animate"
      whileHover="hover"
      style={{
        background: state === 'black'
          ? 'linear-gradient(135deg, #0a0a0a 0%, #2a2a2a 50%, #000 100%)'
          : 'linear-gradient(135deg, #ffffff 0%, #e0e0e0 50%, #f5f5f5 100%)',
        borderColor: state === 'black' ? '#00FFFF' : '#FF00FF',
        boxShadow: state === 'black'
          ? '0 0 15px rgba(0, 255, 255, 0.7), inset 0 0 15px rgba(0, 255, 255, 0.3)'
          : '0 0 15px rgba(255, 0, 255, 0.7), inset 0 0 15px rgba(255, 0, 255, 0.3)'
      }}
    >
      {/* ネオングロー効果のインナーライト */}
      <motion.div
        className="absolute inset-1 rounded-full opacity-70"
        style={{
          background: state === 'black'
            ? 'radial-gradient(circle at 30% 30%, rgba(0, 255, 255, 0.9), transparent 70%)'
            : 'radial-gradient(circle at 30% 30%, rgba(255, 0, 255, 0.9), transparent 70%)'
        }}
        animate={{
          opacity: [0.5, 0.9, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />

      {/* 石の表面のハイライト */}
      <div
        className="absolute top-1 left-1 w-4 h-4 rounded-full opacity-60"
        style={{
          background: state === 'black'
            ? 'radial-gradient(circle, rgba(0, 255, 255, 0.8), transparent)'
            : 'radial-gradient(circle, rgba(255, 255, 255, 0.9), transparent)'
        }}
      />

      {/* 配置時のパルスエフェクト */}
      {isFlipping && (
        <motion.div
          className="absolute -inset-3 rounded-full"
          style={{
            border: `3px solid ${state === 'black' ? '#00FFFF' : '#FF00FF'}`,
            boxShadow: `0 0 30px ${state === 'black' ? 'rgba(0, 255, 255, 0.9)' : 'rgba(255, 0, 255, 0.9)'}`
          }}
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      )}

      {/* より強いグロー効果 */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow: state === 'black'
            ? '0 0 20px rgba(0, 255, 255, 0.5)'
            : '0 0 20px rgba(255, 0, 255, 0.5)'
        }}
        animate={{
          boxShadow: state === 'black'
            ? [
                '0 0 20px rgba(0, 255, 255, 0.5)',
                '0 0 30px rgba(0, 255, 255, 0.8)',
                '0 0 20px rgba(0, 255, 255, 0.5)'
              ]
            : [
                '0 0 20px rgba(255, 0, 255, 0.5)',
                '0 0 30px rgba(255, 0, 255, 0.8)',
                '0 0 20px rgba(255, 0, 255, 0.5)'
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
