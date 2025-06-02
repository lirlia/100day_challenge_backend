'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import GameScreen from './components/GameScreen';

export default function HomePage() {
  const [gameStarted, setGameStarted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: 1000, height: 1000 });

  // windowオブジェクトの初期化を確実に行う
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });

      const handleResize = () => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  if (gameStarted) {
    return (
      <GameScreen onBackToTitle={() => setGameStarted(false)} />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full max-w-4xl mx-auto">
      {/* メインタイトル */}
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="text-center mb-12"
      >
        <h1 className="text-6xl md:text-8xl font-black neon-glow-pink mb-4 tracking-wider">
          REVERSI
        </h1>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5, duration: 1, type: "spring", bounce: 0.4 }}
          className="text-3xl md:text-4xl font-bold neon-glow-blue"
        >
          BATTLE
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="text-xl md:text-2xl font-light text-neon-green mt-4 tracking-wide"
        >
          派手派手演出で戦う未来のオセロ
        </motion.p>
      </motion.div>

      {/* 装飾的なサイバーライン */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: "100%" }}
        transition={{ delay: 1.5, duration: 1.5 }}
        className="h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent mb-12 max-w-md"
      />

      {/* メニューボタン群 */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 1 }}
        className="flex flex-col space-y-6 w-full max-w-sm"
      >
        {/* ゲーム開始ボタン */}
        <motion.button
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(0, 255, 255, 0.8)"
          }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setGameStarted(true)}
          className="group relative px-8 py-4 neon-border-blue text-neon-blue hover:bg-neon-blue hover:text-black transition-all duration-500 rounded-lg font-bold text-xl overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-20"
            animate={{ x: [-100, 300] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
          <span className="relative z-10">GAME START</span>
        </motion.button>

        {/* 設定ボタン */}
        <motion.button
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(255, 0, 255, 0.8)"
          }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowSettings(!showSettings)}
          className="px-8 py-4 neon-border-pink text-neon-pink hover:bg-neon-pink hover:text-black transition-all duration-500 rounded-lg font-bold text-xl"
        >
          SETTINGS
        </motion.button>

        {/* ルールボタン */}
        <motion.button
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(0, 255, 0, 0.8)"
          }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-4 neon-border-green text-neon-green hover:bg-neon-green hover:text-black transition-all duration-500 rounded-lg font-bold text-xl"
        >
          HOW TO PLAY
        </motion.button>
      </motion.div>

      {/* 設定パネル */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ y: 50 }}
            animate={{ y: 0 }}
            className="bg-gradient-to-br from-purple-900 to-blue-900 p-8 rounded-2xl neon-border-pink max-w-md w-full mx-4"
          >
            <h2 className="text-3xl font-bold neon-glow-pink mb-6 text-center">SETTINGS</h2>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-neon-blue font-semibold">音楽</span>
                <div className="w-12 h-6 bg-gray-700 rounded-full relative cursor-pointer">
                  <div className="w-5 h-5 bg-neon-green rounded-full absolute top-0.5 left-6 transition-all duration-300"></div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-neon-blue font-semibold">効果音</span>
                <div className="w-12 h-6 bg-gray-700 rounded-full relative cursor-pointer">
                  <div className="w-5 h-5 bg-neon-green rounded-full absolute top-0.5 left-6 transition-all duration-300"></div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-neon-blue font-semibold">難易度</span>
                <select className="bg-gray-800 text-neon-green border border-neon-green rounded px-3 py-1">
                  <option>簡単</option>
                  <option>普通</option>
                  <option>難しい</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-8 px-6 py-3 neon-border-blue text-neon-blue hover:bg-neon-blue hover:text-black transition-all duration-300 rounded-lg font-semibold"
            >
              閉じる
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* 装飾的な浮遊要素 */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-neon-blue rounded-full opacity-60"
            animate={{
              x: [Math.random() * windowSize.width, Math.random() * windowSize.width],
              y: [Math.random() * windowSize.height, Math.random() * windowSize.height],
            }}
            transition={{
              duration: 10 + i * 2,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{
              left: Math.random() * windowSize.width,
              top: Math.random() * windowSize.height,
            }}
          />
        ))}
      </div>
    </div>
  );
}
