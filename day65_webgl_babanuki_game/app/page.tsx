'use client';

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { Suspense, useState, useEffect } from 'react'
import { runBasicTests } from '../lib/game-test'
import { PlayerHand } from '../components/PlayerHand'
import { initializeGame, dealCards, processInitialPairs } from '../lib/card-game'
import type { GameState } from '../lib/card-game'

// ゲームシーンコンポーネント
function GameScene({ gameState }: { gameState: GameState }) {
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
          showCards={gameState.phase === 'setup'} // テスト用に一時的に全て表示
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
    <div className="flex items-center justify-center w-full h-full">
      <div className="text-white text-xl">3Dシーンを読み込み中...</div>
    </div>
  )
}

export default function Game() {
  const [gameState, setGameState] = useState<GameState | null>(null)

  // ゲーム初期化
  useEffect(() => {
    const initialState = initializeGame()
    const { updatedPlayers } = dealCards(initialState.deck, initialState.players)
    const playersWithInitialPairs = processInitialPairs(updatedPlayers)

    setGameState({
      ...initialState,
      players: playersWithInitialPairs,
      phase: 'playing'
    })
  }, [])

  const startNewGame = () => {
    runBasicTests() // テスト実行

    const initialState = initializeGame()
    const { updatedPlayers } = dealCards(initialState.deck, initialState.players)
    const playersWithInitialPairs = processInitialPairs(updatedPlayers)

    setGameState({
      ...initialState,
      players: playersWithInitialPairs,
      phase: 'playing'
    })
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-2xl">ゲームを初期化中...</div>
      </div>
    )
  }

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
            <select className="w-full mt-1 px-2 py-1 rounded bg-white/20 text-white">
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
          <div className="text-sm">フェーズ: {gameState.phase}</div>
          <div className="text-sm">現在のターン: {gameState.players[gameState.currentPlayerIndex]?.name}</div>
          <div className="text-sm">あなたの手札: {gameState.players[0]?.hand.length || 0}枚</div>
          <div className="text-sm">除去ペア: {gameState.players[0]?.pairsCollected.length || 0}組</div>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="w-full h-screen">
        <Canvas camera={{ position: [0, 5, 8], fov: 60 }} shadows>
          <Suspense fallback={<LoadingFallback />}>
            <GameScene gameState={gameState} />
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
          <div>• カード: クリックで選択</div>
        </div>
      </div>
    </main>
  )
}
