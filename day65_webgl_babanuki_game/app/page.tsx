'use client';

import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'
import { Suspense } from 'react'
import { runBasicTests } from '../lib/game-test'

// 基本的な3Dシーンコンポーネント
function GameScene() {
  return (
    <>
      {/* テーブル */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#0f4c3a" />
      </mesh>

      {/* 仮のカード */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.6, 0.9, 0.05]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {/* ライト */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
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
            onClick={() => runBasicTests()}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-colors"
          >
            ゲーム開始（テスト実行）
          </button>
        </div>
      </div>

      {/* ゲーム情報パネル */}
      <div className="absolute bottom-4 left-4 z-10 bg-black/30 backdrop-blur-sm rounded-lg p-4">
        <div className="text-white space-y-1">
          <div className="text-sm">現在のターン: プレイヤー</div>
          <div className="text-sm">残り手札: 13枚</div>
          <div className="text-sm">除去ペア: 0組</div>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="w-full h-screen">
        <Canvas camera={{ position: [0, 5, 8], fov: 60 }}>
          <Suspense fallback={<LoadingFallback />}>
            <GameScene />
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
