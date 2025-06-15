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

// WebGLサポートを検出する関数
function detectWebGLSupport(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch (e) {
    return false;
  }
}

// 2D フォールバック用のカードゲームコンポーネント
function FallbackCardGame({
  gameState,
  selectedCardIndex,
  onCardClick,
  onPlayerHandClick,
  availableTargets,
  canPlayerAct
}: {
  gameState: GameState
  selectedCardIndex: number | null
  onCardClick: (cardIndex: number) => void
  onPlayerHandClick: (playerId: string, cardIndex: number) => void
  availableTargets: any[]
  canPlayerAct: boolean
}) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-green-800 to-green-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">ババ抜き (2D版)</h2>
          <p className="text-green-200">WebGL が利用できないため、2D版で表示しています</p>
        </div>

        {/* プレイヤー情報を格子状に配置 */}
        <div className="grid grid-cols-2 gap-8">
          {gameState.players.map((player, index) => {
            const isCurrentPlayer = index === gameState.currentPlayerIndex
            const isAvailableTarget = canPlayerAct && availableTargets.some(t => t.id === player.id)

            return (
              <div
                key={player.id}
                className={`
                  p-6 rounded-lg border-2 transition-all duration-300
                  ${isCurrentPlayer ? 'border-yellow-400 bg-yellow-900/30' : 'border-gray-600 bg-gray-800/30'}
                  ${isAvailableTarget ? 'border-blue-400 bg-blue-900/30 cursor-pointer hover:bg-blue-800/40' : ''}
                `}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-lg font-semibold ${isCurrentPlayer ? 'text-yellow-300' : 'text-white'}`}>
                    {player.name} {player.isHuman ? '(あなた)' : '(CPU)'}
                  </h3>
                  <div className="text-sm text-gray-300">
                    手札: {player.hand.length}枚
                  </div>
                </div>

                {/* 手札表示 */}
                <div className="flex flex-wrap gap-2">
                  {player.isHuman ? (
                    // 人間プレイヤーの場合、カードの内容を表示
                    player.hand.map((card, cardIndex) => (
                      <div
                        key={cardIndex}
                        onClick={() => onCardClick(cardIndex)}
                        className={`
                          w-12 h-16 bg-white rounded border-2 flex items-center justify-center text-xs font-bold cursor-pointer
                          ${selectedCardIndex === cardIndex ? 'border-yellow-400 bg-yellow-100' : 'border-gray-300'}
                          hover:border-gray-400 transition-colors
                        `}
                      >
                        {card.suit === 'joker' ? '🃏' : `${card.rank}${card.suit}`}
                      </div>
                    ))
                  ) : (
                    // CPUプレイヤーの場合、カードの裏面を表示
                    player.hand.map((_, cardIndex) => (
                      <div
                        key={cardIndex}
                        onClick={() => isAvailableTarget && onPlayerHandClick(player.id, cardIndex)}
                        className={`
                          w-12 h-16 bg-blue-600 rounded border-2 border-blue-700 flex items-center justify-center text-white text-xs
                          ${isAvailableTarget ? 'cursor-pointer hover:bg-blue-500 hover:border-blue-400' : 'cursor-default'}
                          transition-colors
                        `}
                      >
                        🂠
                      </div>
                    ))
                  )}
                </div>

                {/* ペア情報 */}
                {player.pairsCollected.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-300 mb-2">捨てたペア: {player.pairsCollected.length}組</p>
                    <div className="flex flex-wrap gap-1">
                      {player.pairsCollected.map((pair, pairIndex) => (
                        <div key={pairIndex} className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                          {pair.map(card => `${card.rank}${card.suit}`).join(', ')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ゲームシーンコンポーネント
function GameScene({
  gameState,
  selectedCardIndex,
  onCardClick,
  onPlayerHandClick,
  availableTargets,
  canPlayerAct
}: {
  gameState: GameState
  selectedCardIndex: number | null
  onCardClick: (cardIndex: number) => void
  onPlayerHandClick: (playerId: string, cardIndex: number) => void
  availableTargets: any[]
  canPlayerAct: boolean
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
      {gameState.players.map((player, index) => {
        const isCurrentPlayer = index === gameState.currentPlayerIndex
        const isAvailableTarget = canPlayerAct && availableTargets.some(t => t.id === player.id)

        return (
          <PlayerHand
            key={player.id}
            player={player}
            isCurrentPlayer={isCurrentPlayer}
            showCards={player.isHuman}
            selectedCardIndex={player.isHuman ? (selectedCardIndex ?? undefined) : undefined}
            onCardClick={player.isHuman ? onCardClick : (cardIndex) => onPlayerHandClick(player.id, cardIndex)}
            isAvailableTarget={isAvailableTarget}
          />
        )
      })}

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
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null)

  // WebGLサポートチェック
  useEffect(() => {
    setWebglSupported(detectWebGLSupport())
  }, [])

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

    // 人間プレイヤーのターンの場合、waitingForPlayerActionを設定
    const currentPlayer = controller.gameState.players[controller.gameState.currentPlayerIndex]
    const updatedController = {
      ...controller,
      waitingForPlayerAction: currentPlayer.isHuman
    }

    setGameController(updatedController)

    if (currentPlayer.isHuman) {
      setGameMessage('ゲーム開始！青く光っている相手の手札からカードを選んでください。')
    } else {
      setGameMessage('ゲーム開始！CPUのターンです...')
    }
  }, [aiDifficulty])

  // 初回ゲーム初期化
  useEffect(() => {
    initializeNewGame()
  }, [initializeNewGame])

  // ゲームターン進行
  useEffect(() => {
    if (!gameController || gameController.gameState.phase !== 'playing') return;

    const currentPlayer = gameController.gameState.players[gameController.gameState.currentPlayerIndex];
    const isHumanTurn = currentPlayer.isHuman;

    // 人間のターンの場合、何もしない（ユーザーの入力を待つ）
    if (isHumanTurn || gameController.waitingForPlayerAction || gameController.isProcessing) {
      return;
    }

    // AIのターンの場合、ゲームを進める
    const processAITurns = async () => {
      console.log('Starting AI turn processing...');
      const updatedController = await advanceToNextTurn(gameController);

      if (updatedController !== gameController) {
        setGameController(updatedController);

        // メッセージ更新
        const newCurrentPlayer = updatedController.gameState.players[updatedController.gameState.currentPlayerIndex];
        if (newCurrentPlayer.isHuman && canPlayerAct(updatedController)) {
          const availableCount = getAvailableTargets(updatedController).length;
          setGameMessage(`あなたのターン！青く光っている${availableCount}人の手札からカードを選んでください 💙`);
        } else if (!newCurrentPlayer.isHuman) {
          setGameMessage(`${newCurrentPlayer.name}が考え中... 🤔`);
        }

        // ゲーム終了チェック
        if (updatedController.gameState.phase === 'finished') {
          const humanPlayer = updatedController.gameState.players.find(p => p.isHuman);
          if (humanPlayer && humanPlayer.hand.length === 0) {
            setGameMessage('おめでとうございます！あなたの勝利です！');
          } else {
            setGameMessage('ゲーム終了！ジョーカーを持っているプレイヤーの負けです。');
          }
        }
      }
    };

    processAITurns().catch(error => {
      console.error('Error processing AI turns:', error);
      setGameMessage('エラーが発生しました。新しいゲームを開始してください。');
    });

  }, [gameController]);

  // プレイヤーが自分の手札をクリック
  const handlePlayerCardClick = useCallback((cardIndex: number) => {
    if (!gameController || !canPlayerAct(gameController)) return

    // 自分の手札をクリックしても何もしない（他のプレイヤーからカードを引く必要がある）
    setGameMessage('❌ 自分の手札は選べません！青く光っている相手の手札からカードを選んでください 💙')
  }, [gameController])

  // プレイヤーが他のプレイヤーの手札をクリック
  const handlePlayerHandClick = useCallback(async (playerId: string, cardIndex: number) => {
    if (!gameController || !canPlayerAct(gameController)) return

    const availableTargets = getAvailableTargets(gameController)
    const targetPlayer = availableTargets.find(p => p.id === playerId)

    if (!targetPlayer) {
      setGameMessage('❌ そのプレイヤーからは引けません！青く光っている手札を選んでください 💙')
      return
    }

    setGameMessage('カードを引いています... 🎴')
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

  // 利用可能なターゲットプレイヤーを取得
  const availableTargets = gameController ? getAvailableTargets(gameController) : []

  if (!gameController) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-2xl">ゲームを初期化中...</div>
      </div>
    )
  }

  // WebGLサポートチェック中
  if (webglSupported === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-2xl">WebGLサポートを確認中...</div>
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
        <p className="text-white/80 mt-1">
          CPU対戦・{webglSupported ? '3D表示' : '2D表示 (WebGL非対応)'}
        </p>
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

      {/* メインゲーム表示 - WebGLサポートに応じて切り替え */}
      <div className="w-full h-screen">
        {webglSupported ? (
          // 3D WebGL版
          <Canvas
            camera={{ position: [0, 5, 8], fov: 60 }}
            shadows
            onCreated={({ gl }) => {
              // WebGLコンテキスト作成成功時の処理
              console.log('WebGL context created successfully');
            }}
            onError={(error) => {
              // WebGLエラー時の処理
              console.error('WebGL Canvas error:', error);
              setWebglSupported(false);
            }}
          >
            <Suspense fallback={<LoadingFallback />}>
              <GameScene
                gameState={gameController.gameState}
                selectedCardIndex={gameController.selectedCardIndex}
                onCardClick={handlePlayerCardClick}
                onPlayerHandClick={handlePlayerHandClick}
                availableTargets={availableTargets}
                canPlayerAct={canPlayerAct(gameController)}
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
        ) : (
          // 2D フォールバック版
          <FallbackCardGame
            gameState={gameController.gameState}
            selectedCardIndex={gameController.selectedCardIndex}
            onCardClick={handlePlayerCardClick}
            onPlayerHandClick={handlePlayerHandClick}
            availableTargets={availableTargets}
            canPlayerAct={canPlayerAct(gameController)}
          />
        )}
      </div>

      {/* 操作ガイド */}
      <div className="absolute bottom-4 right-4 z-10 bg-black/30 backdrop-blur-sm rounded-lg p-4">
        <h4 className="text-white font-semibold mb-2">操作方法</h4>
        <div className="text-white/80 text-sm space-y-1">
          {webglSupported ? (
            <>
              <div>• マウス: カメラ回転</div>
              <div>• ホイール: ズーム</div>
              <div>• 相手の手札: クリックでカードを引く</div>
              <div>• あなたのターンで他プレイヤーからカードを選択</div>
            </>
          ) : (
            <>
              <div>• 相手の手札: クリックでカードを引く</div>
              <div>• 青く光っている手札が選択可能</div>
              <div>• あなたのターンで他プレイヤーからカードを選択</div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
