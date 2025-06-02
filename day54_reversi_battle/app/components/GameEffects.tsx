'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface GameEffectsProps {
  effects: EffectData[];
}

interface EffectData {
  id: string;
  type: 'shock_wave' | 'particle_burst' | 'chain_reaction' | 'stone_place';
  position: { row: number; col: number };
  color: 'blue' | 'pink' | 'green' | 'white';
  duration?: number;
}

export default function GameEffects({ effects }: GameEffectsProps) {
  const [activeEffects, setActiveEffects] = useState<EffectData[]>([]);

  useEffect(() => {
    setActiveEffects(effects);

    // エフェクトの自動削除
    const timer = setTimeout(() => {
      setActiveEffects([]);
    }, 2000);

    return () => clearTimeout(timer);
  }, [effects]);

  // セル位置をピクセル座標に変換
  const getCellPosition = (row: number, col: number) => {
    const cellSize = 64; // Cell.tsxのw-16 h-16 = 64px
    const gap = 4; // gap-1 = 4px
    const padding = 8; // p-2 = 8px

    return {
      x: padding + col * (cellSize + gap) + cellSize / 2,
      y: padding + row * (cellSize + gap) + cellSize / 2,
    };
  };

  // 衝撃波エフェクト
  const ShockWaveEffect = ({ effect }: { effect: EffectData }) => {
    const position = getCellPosition(effect.position.row, effect.position.col);
    const colors = {
      blue: 'rgba(0, 255, 255, 0.8)',
      pink: 'rgba(255, 0, 255, 0.8)',
      green: 'rgba(0, 255, 0, 0.8)',
      white: 'rgba(255, 255, 255, 0.8)',
    };

    return (
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
        }}
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: 3, opacity: 0 }}
        exit={{ scale: 4, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <div
          className="w-16 h-16 rounded-full border-4"
          style={{
            borderColor: colors[effect.color],
            boxShadow: `0 0 30px ${colors[effect.color]}`,
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-full border-2"
          style={{
            borderColor: colors[effect.color],
            boxShadow: `0 0 20px ${colors[effect.color]}`,
          }}
          animate={{ scale: [1, 1.5, 2] }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </motion.div>
    );
  };

  // パーティクルバーストエフェクト
  const ParticleBurstEffect = ({ effect }: { effect: EffectData }) => {
    const position = getCellPosition(effect.position.row, effect.position.col);
    const colors = {
      blue: '#00FFFF',
      pink: '#FF00FF',
      green: '#00FF00',
      white: '#FFFFFF',
    };

    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{
              backgroundColor: colors[effect.color],
              boxShadow: `0 0 10px ${colors[effect.color]}`,
            }}
            initial={{ scale: 0, x: 0, y: 0 }}
            animate={{
              scale: [0, 1, 0],
              x: Math.cos((i * 30) * Math.PI / 180) * 80,
              y: Math.sin((i * 30) * Math.PI / 180) * 80,
            }}
            transition={{
              duration: 1.2,
              ease: "easeOut",
              delay: i * 0.05,
            }}
          />
        ))}
      </div>
    );
  };

  // 連鎖反転エフェクト
  const ChainReactionEffect = ({ effect }: { effect: EffectData }) => {
    const position = getCellPosition(effect.position.row, effect.position.col);
    const colors = {
      blue: 'rgba(0, 255, 255, 0.6)',
      pink: 'rgba(255, 0, 255, 0.6)',
      green: 'rgba(0, 255, 0, 0.6)',
      white: 'rgba(255, 255, 255, 0.6)',
    };

    return (
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
        }}
        initial={{ scale: 0, rotateZ: 0 }}
        animate={{ scale: [0, 1.2, 0], rotateZ: 360 }}
        transition={{ duration: 1, ease: "easeInOut" }}
      >
        <div
          className="w-20 h-20 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${colors[effect.color]}, transparent, ${colors[effect.color]})`,
            filter: 'blur(2px)',
          }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2"
          style={{
            borderColor: colors[effect.color],
            borderStyle: 'dashed',
          }}
          animate={{ rotateZ: -360 }}
          transition={{ duration: 1, ease: "linear" }}
        />
      </motion.div>
    );
  };

  // 石配置エフェクト
  const StonePlaceEffect = ({ effect }: { effect: EffectData }) => {
    const position = getCellPosition(effect.position.row, effect.position.col);
    const colors = {
      blue: 'rgba(0, 255, 255, 0.9)',
      pink: 'rgba(255, 0, 255, 0.9)',
      green: 'rgba(0, 255, 0, 0.9)',
      white: 'rgba(255, 255, 255, 0.9)',
    };

    return (
      <motion.div
        className="absolute pointer-events-none"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
        }}
      >
        {/* 中央の爆発 */}
        <motion.div
          className="w-4 h-4 rounded-full absolute"
          style={{
            background: colors[effect.color],
            boxShadow: `0 0 25px ${colors[effect.color]}`,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: [0, 3, 0] }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />

        {/* 放射状のライン */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-12 rounded-full"
            style={{
              background: `linear-gradient(to bottom, ${colors[effect.color]}, transparent)`,
              transformOrigin: 'bottom center',
              transform: `rotate(${i * 45}deg)`,
              bottom: '50%',
              left: '50%',
              marginLeft: '-2px',
            }}
            initial={{ scaleY: 0, opacity: 1 }}
            animate={{ scaleY: [0, 1, 0], opacity: [1, 0.5, 0] }}
            transition={{
              duration: 0.8,
              ease: "easeOut",
              delay: i * 0.05,
            }}
          />
        ))}
      </motion.div>
    );
  };

  const renderEffect = (effect: EffectData) => {
    switch (effect.type) {
      case 'shock_wave':
        return <ShockWaveEffect key={effect.id} effect={effect} />;
      case 'particle_burst':
        return <ParticleBurstEffect key={effect.id} effect={effect} />;
      case 'chain_reaction':
        return <ChainReactionEffect key={effect.id} effect={effect} />;
      case 'stone_place':
        return <StonePlaceEffect key={effect.id} effect={effect} />;
      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <AnimatePresence>
        {activeEffects.map(renderEffect)}
      </AnimatePresence>
    </div>
  );
}
