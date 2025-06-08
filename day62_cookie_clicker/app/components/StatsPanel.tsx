'use client'

import { GameState } from '@/lib/types'
import { formatNumber } from '@/lib/gameData'

interface StatsPanelProps {
  gameState: GameState
}

export default function StatsPanel({ gameState }: StatsPanelProps) {
  const playTime = Math.floor((Date.now() - gameState.startTime) / 1000)
  const hours = Math.floor(playTime / 3600)
  const minutes = Math.floor((playTime % 3600) / 60)
  const seconds = playTime % 60

  const achievementsUnlocked = gameState.achievements.filter(a => a.unlocked).length
  const totalAchievements = gameState.achievements.length

  return (
    <div className="text-center space-y-2 text-sm">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-yellow-200 font-semibold">クッキー</div>
          <div className="font-mono text-lg">{formatNumber(gameState.cookies)}</div>
        </div>

        <div>
          <div className="text-yellow-200 font-semibold">毎秒生産</div>
          <div className="font-mono text-lg">{formatNumber(gameState.cps)}</div>
        </div>

        <div>
          <div className="text-yellow-200 font-semibold">総クッキー</div>
          <div className="font-mono text-lg">{formatNumber(gameState.cookiesTotal)}</div>
        </div>

        <div>
          <div className="text-yellow-200 font-semibold">実績</div>
          <div className="font-mono text-lg">{achievementsUnlocked}/{totalAchievements}</div>
        </div>
      </div>

      <div className="text-yellow-200 text-xs">
        プレイ時間: {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </div>
    </div>
  )
}
