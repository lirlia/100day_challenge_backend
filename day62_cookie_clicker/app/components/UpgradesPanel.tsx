'use client'

import { GameState } from '@/lib/types'
import { formatNumber } from '@/lib/gameData'

interface UpgradesPanelProps {
  gameState: GameState & {
    buyUpgrade: (upgradeId: string) => void
    initialized: boolean
  }
}

export default function UpgradesPanel({ gameState }: UpgradesPanelProps) {
  // 購入可能なアップグレードをフィルタリング
  const availableUpgrades = gameState.upgrades.filter(upgrade => {
    if (upgrade.purchased) return false

    const { type, value, buildingId } = upgrade.unlockCondition

    switch (type) {
      case 'cookies_total':
        return gameState.cookiesTotal >= value
      case 'cookies_clicked':
        return gameState.cookiesClicked >= value
      case 'building_count':
        if (buildingId) {
          const building = gameState.buildings.find(b => b.id === buildingId)
          return building ? building.count >= value : false
        }
        return false
      case 'cps':
        return gameState.cps >= value
      default:
        return false
    }
  })

  if (availableUpgrades.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4 text-brown-800">⬆️ アップグレード ⬆️</h2>
        <div className="text-center text-gray-500">
          まだアップグレードは利用できません
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-brown-800">⬆️ アップグレード ⬆️</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3">
        {availableUpgrades.map((upgrade) => {
          const canAfford = gameState.cookies >= upgrade.cost

          return (
            <div
              key={upgrade.id}
              className={`border rounded-lg p-3 transition-all duration-200 cursor-pointer ${
                canAfford
                  ? 'border-purple-300 bg-purple-50 hover:bg-purple-100'
                  : 'border-gray-300 bg-gray-50 opacity-60 cursor-not-allowed'
              }`}
              onClick={() => canAfford && gameState.buyUpgrade(upgrade.id)}
              title={upgrade.description}
            >
              <div className="text-center">
                <div className="text-2xl mb-1">{upgrade.emoji}</div>
                <div className="font-bold text-xs text-brown-800 mb-1">
                  {upgrade.name}
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  {upgrade.description}
                </div>
                <div className={`text-sm font-mono ${canAfford ? 'text-purple-600' : 'text-red-500'}`}>
                  {formatNumber(upgrade.cost)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
