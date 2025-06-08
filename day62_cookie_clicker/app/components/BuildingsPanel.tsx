'use client'

import { GameState } from '@/lib/types'
import { formatNumber, calculateBuildingCost, calculateBuildingProduction } from '@/lib/gameData'

interface BuildingsPanelProps {
  gameState: GameState & {
    buyBuilding: (buildingId: string) => void
    initialized: boolean
  }
}

export default function BuildingsPanel({ gameState }: BuildingsPanelProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-brown-800">🏪 建物 🏪</h2>

      <div className="space-y-3">
        {gameState.buildings.map((building) => {
          const cost = calculateBuildingCost(building)
          const production = calculateBuildingProduction(building, gameState.upgrades)
          const canAfford = gameState.cookies >= cost

          return (
            <div
              key={building.id}
              className={`border rounded-lg p-3 transition-all duration-200 ${
                canAfford
                  ? 'border-green-300 bg-green-50 hover:bg-green-100 cursor-pointer'
                  : 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60'
              }`}
              onClick={() => canAfford && gameState.buyBuilding(building.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">{building.emoji}</div>
                  <div>
                    <div className="font-bold text-brown-800">
                      {building.name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {building.description}
                    </div>
                    <div className="text-xs text-blue-600">
                      {building.count > 0 && (
                        <>生産量: {formatNumber(production)}/秒</>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-lg">
                    {building.count}
                  </div>
                  <div className={`text-sm font-mono ${canAfford ? 'text-green-600' : 'text-red-500'}`}>
                    {formatNumber(cost)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
