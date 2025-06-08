'use client'

import { useState, useEffect, useCallback } from 'react'
import { GameState, Building, Upgrade, Achievement } from '@/lib/types'
import {
  initialBuildings,
  initialUpgrades,
  initialAchievements,
  calculateTotalCPS,
  calculateClickPower,
  calculateBuildingCost
} from '@/lib/gameData'

interface GameHook extends GameState {
  initialized: boolean
  clickCookie: () => void
  buyBuilding: (buildingId: string) => void
  buyUpgrade: (upgradeId: string) => void
  saveGame: () => void
  resetGame: () => void
}

const SAVE_KEY = 'cookie_clicker_save'

export const useGame = (): GameHook => {
  const [gameState, setGameState] = useState<GameState>({
    cookies: 0,
    cookiesTotal: 0,
    cookiesClicked: 0,
    clickPower: 1,
    cps: 0,
    buildings: initialBuildings,
    upgrades: initialUpgrades,
    achievements: initialAchievements,
    lastTick: Date.now(),
    startTime: Date.now()
  })
  const [initialized, setInitialized] = useState(false)

  // ゲーム状態を保存
  const saveGame = useCallback(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameState))
    console.log('ゲームを保存しました')
  }, [gameState])

  // ゲーム状態を読み込み
  const loadGame = useCallback(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY)
      if (saved) {
        const loadedState = JSON.parse(saved)
        setGameState({
          ...loadedState,
          lastTick: Date.now() // 現在時刻に更新
        })
        console.log('ゲームを読み込みました')
      }
    } catch (error) {
      console.error('ゲーム読み込みエラー:', error)
    }
    setInitialized(true)
  }, [])

  // ゲームリセット
  const resetGame = useCallback(() => {
    const newState: GameState = {
      cookies: 0,
      cookiesTotal: 0,
      cookiesClicked: 0,
      clickPower: 1,
      cps: 0,
      buildings: initialBuildings,
      upgrades: initialUpgrades,
      achievements: initialAchievements,
      lastTick: Date.now(),
      startTime: Date.now()
    }
    setGameState(newState)
    localStorage.removeItem(SAVE_KEY)
    console.log('ゲームをリセットしました')
  }, [])

  // クッキーをクリック
  const clickCookie = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      cookies: prev.cookies + prev.clickPower,
      cookiesTotal: prev.cookiesTotal + prev.clickPower,
      cookiesClicked: prev.cookiesClicked + 1
    }))
  }, [])

  // 建物を購入
  const buyBuilding = useCallback((buildingId: string) => {
    setGameState(prev => {
      const building = prev.buildings.find(b => b.id === buildingId)
      if (!building) return prev

      const cost = calculateBuildingCost(building)
      if (prev.cookies < cost) return prev

      const newBuildings = prev.buildings.map(b =>
        b.id === buildingId
          ? { ...b, count: b.count + 1 }
          : b
      )

      return {
        ...prev,
        cookies: prev.cookies - cost,
        buildings: newBuildings
      }
    })
  }, [])

  // アップグレードを購入
  const buyUpgrade = useCallback((upgradeId: string) => {
    setGameState(prev => {
      const upgrade = prev.upgrades.find(u => u.id === upgradeId)
      if (!upgrade || upgrade.purchased || prev.cookies < upgrade.cost) {
        return prev
      }

      const newUpgrades = prev.upgrades.map(u =>
        u.id === upgradeId
          ? { ...u, purchased: true }
          : u
      )

      return {
        ...prev,
        cookies: prev.cookies - upgrade.cost,
        upgrades: newUpgrades
      }
    })
  }, [])

  // CPS・クリック威力・実績の更新
  const updateCalculatedValues = useCallback(() => {
    setGameState(prev => {
      const newCps = calculateTotalCPS(prev.buildings, prev.upgrades)
      const newClickPower = calculateClickPower(prev.upgrades)

      // 実績チェック
      const newAchievements = prev.achievements.map(achievement => {
        if (achievement.unlocked) return achievement

        const { type, value, buildingId } = achievement.condition
        let conditionMet = false

        switch (type) {
          case 'cookies_total':
            conditionMet = prev.cookiesTotal >= value
            break
          case 'cookies_clicked':
            conditionMet = prev.cookiesClicked >= value
            break
          case 'building_count':
            if (buildingId) {
              const building = prev.buildings.find(b => b.id === buildingId)
              conditionMet = building ? building.count >= value : false
            }
            break
          case 'cps':
            conditionMet = newCps >= value
            break
          case 'upgrades_purchased':
            const purchasedCount = prev.upgrades.filter(u => u.purchased).length
            conditionMet = purchasedCount >= value
            break
        }

        if (conditionMet && !achievement.unlocked) {
          console.log(`実績解除: ${achievement.name}`)
          return { ...achievement, unlocked: true }
        }

        return achievement
      })

      return {
        ...prev,
        cps: newCps,
        clickPower: newClickPower,
        achievements: newAchievements
      }
    })
  }, [])

  // ゲームループ（CPS処理）
  useEffect(() => {
    const gameLoop = setInterval(() => {
      setGameState(prev => {
        const now = Date.now()
        const deltaTime = (now - prev.lastTick) / 1000 // 秒単位
        const cpsGain = prev.cps * deltaTime

        return {
          ...prev,
          cookies: prev.cookies + cpsGain,
          cookiesTotal: prev.cookiesTotal + cpsGain,
          lastTick: now
        }
      })
    }, 100) // 100ms間隔

    return () => clearInterval(gameLoop)
  }, [])

  // CPS・クリック威力・実績の更新
  useEffect(() => {
    updateCalculatedValues()
  }, [gameState.buildings, gameState.upgrades, gameState.cookiesTotal, gameState.cookiesClicked, updateCalculatedValues])

  // 初期化
  useEffect(() => {
    loadGame()
  }, [loadGame])

  // 定期保存
  useEffect(() => {
    if (!initialized) return

    const autoSave = setInterval(() => {
      saveGame()
    }, 10000) // 10秒間隔

    return () => clearInterval(autoSave)
  }, [initialized, saveGame])

  return {
    ...gameState,
    initialized,
    clickCookie,
    buyBuilding,
    buyUpgrade,
    saveGame,
    resetGame
  }
}
