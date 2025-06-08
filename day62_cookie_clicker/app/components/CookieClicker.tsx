'use client'

import { useState } from 'react'
import { GameState } from '@/lib/types'
import { formatNumber } from '@/lib/gameData'

interface CookieClickerProps {
  gameState: GameState & {
    clickCookie: () => void
    saveGame: () => void
    resetGame: () => void
    initialized: boolean
  }
}

export default function CookieClicker({ gameState }: CookieClickerProps) {
  const [clickEffect, setClickEffect] = useState<string>('')

  const handleClick = () => {
    gameState.clickCookie()

    // クリックエフェクト
    setClickEffect(`+${gameState.clickPower}`)
    setTimeout(() => setClickEffect(''), 1000)
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 text-center">
      <h2 className="text-2xl font-bold mb-4 text-brown-800">🍪 クッキー 🍪</h2>

      {/* クッキー表示 */}
      <div className="relative mb-6">
        <button
          onClick={handleClick}
          className="text-9xl hover:scale-110 transition-transform duration-200 cursor-pointer select-none"
          aria-label="クッキーをクリック"
        >
          🍪
        </button>

        {/* クリックエフェクト */}
        {clickEffect && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 text-2xl font-bold text-yellow-600 animate-bounce pointer-events-none">
            {clickEffect}
          </div>
        )}
      </div>

      {/* 統計表示 */}
      <div className="space-y-2 text-lg">
        <div className="text-brown-800">
          <span className="font-bold">クッキー: </span>
          <span className="text-yellow-600 font-mono">{formatNumber(gameState.cookies)}</span>
        </div>

        <div className="text-brown-600">
          <span className="font-bold">総クッキー: </span>
          <span className="text-yellow-500 font-mono">{formatNumber(gameState.cookiesTotal)}</span>
        </div>

        <div className="text-brown-600">
          <span className="font-bold">毎秒: </span>
          <span className="text-green-600 font-mono">{formatNumber(gameState.cps)}/秒</span>
        </div>

        <div className="text-brown-600">
          <span className="font-bold">クリック威力: </span>
          <span className="text-red-600 font-mono">{formatNumber(gameState.clickPower)}</span>
        </div>
      </div>

      {/* 操作ボタン */}
      <div className="mt-6 space-y-2">
        <button
          onClick={gameState.saveGame}
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          💾 保存
        </button>

        <button
          onClick={() => {
            if (confirm('本当にゲームをリセットしますか？')) {
              gameState.resetGame()
            }
          }}
          className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          🔄 リセット
        </button>
      </div>
    </div>
  )
}
