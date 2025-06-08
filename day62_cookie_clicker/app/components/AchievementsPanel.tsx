'use client'

import { GameState } from '@/lib/types'

interface AchievementsPanelProps {
  gameState: GameState
}

export default function AchievementsPanel({ gameState }: AchievementsPanelProps) {
  const unlockedAchievements = gameState.achievements.filter(a => a.unlocked)
  const totalAchievements = gameState.achievements.length

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-brown-800">
        🏆 実績 ({unlockedAchievements.length}/{totalAchievements}) 🏆
      </h2>

      <div className="max-h-64 overflow-y-auto">
        <div className="space-y-2">
          {gameState.achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`border rounded-lg p-3 transition-all duration-200 ${
                achievement.unlocked
                  ? 'border-yellow-300 bg-yellow-50'
                  : 'border-gray-300 bg-gray-50 opacity-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="text-2xl">{achievement.emoji}</div>
                <div className="flex-1">
                  <div className={`font-bold ${achievement.unlocked ? 'text-yellow-700' : 'text-gray-500'}`}>
                    {achievement.name}
                  </div>
                  <div className={`text-sm ${achievement.unlocked ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {achievement.description}
                  </div>
                </div>
                {achievement.unlocked && (
                  <div className="text-yellow-500 text-sm font-bold">
                    ✓
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
