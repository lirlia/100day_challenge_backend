// クッキークリッカーゲームの型定義

export interface Building {
  id: string
  name: string
  baseCost: number
  baseProduction: number
  count: number
  emoji: string
  description: string
}

export interface Upgrade {
  id: string
  name: string
  cost: number
  description: string
  effect: UpgradeEffect
  unlockCondition: UnlockCondition
  purchased: boolean
  emoji: string
}

export interface UpgradeEffect {
  type: 'click_multiplier' | 'cps_multiplier' | 'building_multiplier' | 'global_multiplier'
  value: number
  buildingId?: string // building_multiplier の場合に指定
}

export interface UnlockCondition {
  type: 'cookies_total' | 'cookies_clicked' | 'building_count' | 'cps' | 'total_buildings'
  value: number
  buildingId?: string // building_count の場合に指定
}

export interface Achievement {
  id: string
  name: string
  description: string
  condition: AchievementCondition
  unlocked: boolean
  emoji: string
}

export interface AchievementCondition {
  type: 'cookies_total' | 'cookies_clicked' | 'building_count' | 'cps' | 'upgrades_purchased' | 'total_buildings'
  value: number
  buildingId?: string
}

export interface GameState {
  cookies: number
  cookiesTotal: number
  cookiesClicked: number
  clickPower: number
  cps: number // Cookies Per Second
  buildings: Building[]
  upgrades: Upgrade[]
  achievements: Achievement[]
  lastTick: number
  startTime: number
}

export interface GameStats {
  totalCookies: number
  currentCps: number
  buildingsOwned: number
  upgradesPurchased: number
  achievementsUnlocked: number
  playTime: number
}
