'use client';

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { Suspense, useState, useEffect, useCallback } from 'react'
import { runBasicTests } from '../lib/game-test'
import { PlayerHand } from '../components/PlayerHand'
import { initializeGame, dealCards, processInitialPairs } from '../lib/card-game'
import type { GameState } from '../lib/card-game'
import type { AIDifficulty } from '../lib/ai-system'
import {
  createGameController,
  advanceToNextTurn,
  handleDrawCard,
  canPlayerAct,
  getAvailableTargets,
  getGameStats,
  resetGame
} from '../lib/game-controller'
import type { GameController } from '../lib/game-controller'

// ゲームシーンコンポーネント
function GameScene({
  gameState,
  selectedCardIndex,
  onCardClick,
  onPlayerHandClick
}: {
  gameState: GameState
  selectedCardIndex: number | null
  onCardClick: (cardIndex: number) => void
  onPlayerHandClick: (playerId: string, cardIndex: number) => void
}) {
  return (
    <>
      {/* テーブル */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#0f4c3a" />
      </mesh>

      {/* テーブル中央のロゴ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.49, 0]}>
        <circleGeometry args={[1.5]} />
        <meshBasicMaterial color="#1a5c3a" transparent opacity={0.3} />
      </mesh>

      {/* 各プレイヤーの手札表示 */}
      {gameState.players.map((player, index) => (
        <PlayerHand
          key={player.id}
          player={player}
          isCurrentPlayer={index === gameState.currentPlayerIndex}
          showCards={player.isHuman}
          selectedCardIndex={player.isHuman ? (selectedCardIndex ?? undefined) : undefined}
          onCardClick={player.isHuman ? onCardClick : (cardIndex) => onPlayerHandClick(player.id, cardIndex)}
        />
      ))}

      {/* ライトセットアップ */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[0, 4, 0]} intensity={0.3} color="#ffffff" />
    </>
  )
}

function LoadingFallback() {
  return (
    <group>
      {/* 3D空間でのローディング表示 */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[4, 1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>
    </group>
  )
}

export default function Game() {
  const [gameController, setGameController] = useState<GameController | null>(null)
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('normal')
  const [gameMessage, setGameMessage] = useState<string>('')

  // ゲーム初期化
  const initializeNewGame = useCallback(() => {
    const initialState = initializeGame()
    const { updatedPlayers } = dealCards(initialState.deck, initialState.players)
    const playersWithInitialPairs = processInitialPairs(updatedPlayers)

    const gameState: GameState = {
      ...initialState,
      players: playersWithInitialPairs,
      phase: 'playing'
    }

    const controller = createGameController(gameState, aiDifficulty)
    setGameController(controller)
    setGameMessage('ゲーム開始！あなたのターンです。')
  }, [aiDifficulty])

  // 初回ゲーム初期化
  useEffect(() => {
    initializeNewGame()
  }, [initializeNewGame])

  // ゲームターン進行
  useEffect(() => {
    if (!gameController) return

    const processGameTurn = async () => {
      const updatedController = await advanceToNextTurn(gameController)

      if (updatedController !== gameController) {
        setGameController(updatedController)

        // メッセージ更新
        const currentPlayer = updatedController.gameState.players[updatedController.gameState.currentPlayerIndex]
        if (currentPlayer.isHuman && canPlayerAct(updatedController)) {
          setGameMessage('あなたのターンです。他のプレイヤーからカードを選んでください。')
        } else if (!currentPlayer.isHuman) {
          setGameMessage(`${currentPlayer.name}が考え中...`)
        }

        // ゲーム終了チェック
        if (updatedController.gameState.phase === 'finished') {
          const humanPlayer = updatedController.gameState.players.find(p => p.isHuman)
          if (humanPlayer && humanPlayer.hand.length === 0) {
            setGameMessage('おめでとうございます！あなたの勝利です！')
          } else {
            setGameMessage('ゲーム終了！ジョーカーを持っているプレイヤーの負けです。')
          }
        }
      }
    }

    // AIターンの場合は自動で進行
    const currentPlayer = gameController.gameState.players[gameController.gameState.currentPlayerIndex]
    if (!currentPlayer.isHuman && !gameController.isProcessing && gameController.gameState.phase === 'playing') {
      const timer = setTimeout(processGameTurn, 500)
      return () => clearTimeout(timer)
    }
  }, [gameController])

  // プレイヤーが自分の手札をクリック
  const handlePlayerCardClick = useCallback((cardIndex: number) => {
    if (!gameController || !canPlayerAct(gameController)) return

    // 自分の手札をクリックしても何もしない（他のプレイヤーからカードを引く必要がある）
    setGameMessage('他のプレイヤーの手札からカードを選んでください。')
  }, [gameController])

  // プレイヤーが他のプレイヤーの手札をクリック
  const handlePlayerHandClick = useCallback(async (playerId: string, cardIndex: number) => {
    if (!gameController || !canPlayerAct(gameController)) return

    const availableTargets = getAvailableTargets(gameController)
    const targetPlayer = availableTargets.find(p => p.id === playerId)

    if (!targetPlayer) {
      setGameMessage('そのプレイヤーからはカードを引けません。')
      return
    }

    setGameMessage('カードを引いています...')
    const updatedController = await handleDrawCard(gameController, playerId, cardIndex)
    setGameController(updatedController)
  }, [gameController])

  // 新しいゲーム開始
  const startNewGame = useCallback(() => {
    runBasicTests() // テスト実行
    initializeNewGame()
  }, [initializeNewGame])

  // AI難易度変更
  const handleDifficultyChange = useCallback((newDifficulty: AIDifficulty) => {
    setAiDifficulty(newDifficulty)
    // 新しい難易度でゲームを再開始
    setTimeout(() => {
      initializeNewGame()
    }, 100)
  }, [initializeNewGame])

  if (!gameController) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-2xl">ゲームを初期化中...</div>
      </div>
    )
  }

  const gameStats = getGameStats(gameController)

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* ゲームタイトル */}
      <div className="absolute top-4 left-4 z-10">
        <h1 className="text-3xl font-bold text-white drop-shadow-lg">
          Day 65 - WebGL ババ抜き 🎴
        </h1>
        <p className="text-white/80 mt-1">CPU対戦・3D表示</p>
      </div>

      {/* ゲーム設定パネル */}
      <div className="absolute top-4 right-4 z-10 bg-black/30 backdrop-blur-sm rounded-lg p-4">
        <h3 className="text-white font-semibold mb-2">ゲーム設定</h3>
        <div className="space-y-2">
          <div>
            <label className="text-white text-sm">AI難易度</label>
            <select
              className="w-full mt-1 px-2 py-1 rounded bg-white/20 text-white"
              value={aiDifficulty}
              onChange={(e) => handleDifficultyChange(e.target.value as AIDifficulty)}
            >
              <option value="easy">やさしい</option>
              <option value="normal">ふつう</option>
              <option value="hard">つよい</option>
            </select>
          </div>
          <button
            onClick={startNewGame}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-colors"
          >
            新しいゲーム
          </button>
        </div>
      </div>

      {/* ゲーム情報パネル */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/30 backdrop-blur-sm rounded-lg p-4">
        <div className="text-white space-y-1">
          <div className="text-sm">フェーズ: {gameController.gameState.phase}</div>
          <div className="text-sm">現在のターン: {gameStats.currentTurn}</div>
          <div className="text-sm">あなたの手札: {gameController.gameState.players[0]?.hand.length || 0}枚</div>
          <div className="text-sm">除去ペア: {gameController.gameState.players[0]?.pairsCollected.length || 0}組</div>
          <div className="text-sm">残りカード: {gameStats.totalCards}枚</div>
        </div>
      </div>

      {/* ゲームメッセージ */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-black/50 backdrop-blur-sm rounded-lg p-4 max-w-md">
        <div className="text-white text-center">
          <p className="text-lg font-semibold">{gameMessage}</p>
          {gameStats.isProcessing && (
            <div className="mt-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div>
            </div>
          )}
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="w-full h-screen">
        <Canvas camera={{ position: [0, 5, 8], fov: 60 }} shadows>
          <Suspense fallback={<LoadingFallback />}>
            <GameScene
              gameState={gameController.gameState}
              selectedCardIndex={gameController.selectedCardIndex}
              onCardClick={handlePlayerCardClick}
              onPlayerHandClick={handlePlayerHandClick}
            />
            <Environment preset="night" />
            <OrbitControls
              enablePan={false}
              enableZoom={true}
              enableRotate={true}
              maxPolarAngle={Math.PI / 2}
              minDistance={5}
              maxDistance={15}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* 操作ガイド */}
      <div className="absolute bottom-4 right-4 z-10 bg-black/30 backdrop-blur-sm rounded-lg p-4">
        <h4 className="text-white font-semibold mb-2">操作方法</h4>
        <div className="text-white/80 text-sm space-y-1">
          <div>• マウス: カメラ回転</div>
          <div>• ホイール: ズーム</div>
          <div>• 相手の手札: クリックでカードを引く</div>
          <div>• あなたのターンで他プレイヤーからカードを選択</div>
        </div>
      </div>
    </main>
  )
}
