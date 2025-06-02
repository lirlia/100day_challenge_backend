'use client';

import { motion } from 'framer-motion';
import { GameState, Player } from '@/lib/reversi-engine';
import Stone from './Stone';

interface GameInfoProps {
  gameState: GameState;
  onRestart: () => void;
}

export default function GameInfo({ gameState, onRestart }: GameInfoProps) {
  const { currentPlayer, blackCount, whiteCount, gameOver, winner } = gameState;

  const getPlayerName = (player: Player): string => {
    return player === 'black' ? 'プレイヤー' : 'CPU';
  };

  const getWinnerMessage = (): string => {
    if (!gameOver) return '';
    if (winner === 'draw') return '引き分け！';
    if (winner === 'black') return 'プレイヤーの勝利！';
    return 'CPUの勝利！';
  };

  const scoreVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: { duration: 0.5, type: "spring" }
    },
    pulse: {
      scale: [1, 1.1, 1],
      transition: { duration: 0.3 }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* メインインフォパネル */}
      <motion.div
        className="bg-gradient-to-r from-purple-900/80 to-blue-900/80 rounded-2xl p-6 mb-6"
        style={{
          border: '2px solid rgba(0, 255, 255, 0.5)',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)'
        }}
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">

          {/* プレイヤー情報（黒石） */}
          <motion.div
            className="flex items-center justify-center space-x-4"
            variants={scoreVariants}
            initial="initial"
            animate="animate"
            whileHover="pulse"
          >
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <Stone state="black" size="large" />
                <div>
                  <h3 className="text-xl font-bold neon-glow-blue">
                    {getPlayerName('black')}
                  </h3>
                  <motion.div
                    className="text-3xl font-black neon-glow-blue"
                    animate={currentPlayer === 'black' ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    {blackCount}
                  </motion.div>
                </div>
              </div>
              {currentPlayer === 'black' && !gameOver && (
                <motion.div
                  className="text-sm neon-glow-green font-semibold"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  ▼ YOUR TURN ▼
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* 中央のVSまたはゲーム状況 */}
          <div className="text-center">
            {gameOver ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", bounce: 0.6 }}
                className="space-y-4"
              >
                <h2 className="text-3xl font-black neon-glow-pink">
                  GAME OVER
                </h2>
                <div className="text-2xl font-bold neon-glow-green">
                  {getWinnerMessage()}
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onRestart}
                  className="px-6 py-3 neon-border-green text-neon-green hover:bg-neon-green hover:text-black transition-all duration-300 rounded-lg font-semibold"
                >
                  NEW GAME
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                animate={{
                  rotateY: [0, 180, 360],
                  scale: [1, 1.1, 1]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="text-4xl font-black neon-glow-pink"
              >
                VS
              </motion.div>
            )}
          </div>

          {/* CPU情報（白石） */}
          <motion.div
            className="flex items-center justify-center space-x-4"
            variants={scoreVariants}
            initial="initial"
            animate="animate"
            whileHover="pulse"
          >
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <div>
                  <h3 className="text-xl font-bold neon-glow-pink">
                    {getPlayerName('white')}
                  </h3>
                  <motion.div
                    className="text-3xl font-black neon-glow-pink"
                    animate={currentPlayer === 'white' ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    {whiteCount}
                  </motion.div>
                </div>
                <Stone state="white" size="large" />
              </div>
              {currentPlayer === 'white' && !gameOver && (
                <motion.div
                  className="text-sm neon-glow-green font-semibold"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  ▼ CPU TURN ▼
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>

        {/* プログレスバー（石の比率表示） */}
        <motion.div
          className="mt-6"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <div className="flex items-center space-x-2">
            <span className="text-sm neon-glow-blue font-semibold">BLACK</span>
            <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden relative">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500"
                style={{
                  width: `${(blackCount / (blackCount + whiteCount)) * 100}%`,
                  boxShadow: '0 0 10px rgba(0, 255, 255, 0.8)'
                }}
                initial={{ width: 0 }}
                animate={{ width: `${(blackCount / (blackCount + whiteCount)) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
              <motion.div
                className="absolute right-0 top-0 h-full bg-gradient-to-l from-pink-400 to-purple-500"
                style={{
                  width: `${(whiteCount / (blackCount + whiteCount)) * 100}%`,
                  boxShadow: '0 0 10px rgba(255, 0, 255, 0.8)'
                }}
                initial={{ width: 0 }}
                animate={{ width: `${(whiteCount / (blackCount + whiteCount)) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-sm neon-glow-pink font-semibold">WHITE</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
