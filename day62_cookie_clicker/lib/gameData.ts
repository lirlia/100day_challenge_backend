import { Building, Upgrade, Achievement } from './types'

// 建物の初期データ
export const initialBuildings: Building[] = [
  {
    id: 'cursor',
    name: 'カーソル',
    baseCost: 15,
    baseProduction: 0.1,
    count: 0,
    emoji: '👆',
    description: '自動でクッキーをクリック'
  },
  {
    id: 'grandma',
    name: 'おばあちゃん',
    baseCost: 100,
    baseProduction: 1,
    count: 0,
    emoji: '👵',
    description: '手作りクッキーを焼いてくれる'
  },
  {
    id: 'farm',
    name: '農場',
    baseCost: 1100,
    baseProduction: 8,
    count: 0,
    emoji: '🚜',
    description: 'クッキーの材料を栽培'
  },
  {
    id: 'mine',
    name: '鉱山',
    baseCost: 12000,
    baseProduction: 47,
    count: 0,
    emoji: '⛏️',
    description: '砂糖を採掘'
  },
  {
    id: 'factory',
    name: '工場',
    baseCost: 130000,
    baseProduction: 260,
    count: 0,
    emoji: '🏭',
    description: '大量のクッキーを製造'
  },
  {
    id: 'bank',
    name: '銀行',
    baseCost: 1400000,
    baseProduction: 1400,
    count: 0,
    emoji: '🏦',
    description: 'クッキーに投資してより多くのクッキーを生成'
  },
  {
    id: 'temple',
    name: '神殿',
    baseCost: 20000000,
    baseProduction: 7800,
    count: 0,
    emoji: '🏛️',
    description: '神秘の力でクッキーを召喚'
  },
  {
    id: 'wizard_tower',
    name: '魔法使いの塔',
    baseCost: 330000000,
    baseProduction: 44000,
    count: 0,
    emoji: '🧙‍♀️',
    description: '魔法でクッキーを錬成'
  }
]

// アップグレードの初期データ
export const initialUpgrades: Upgrade[] = [
  {
    id: 'reinforced_index_finger',
    name: '強化された人差し指',
    cost: 100,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 100 },
    purchased: false,
    emoji: '☝️'
  },
  {
    id: 'carpal_tunnel_prevention_cream',
    name: '手根管症候群予防クリーム',
    cost: 500,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 1000 },
    purchased: false,
    emoji: '🧴'
  },
  {
    id: 'ambidextrous',
    name: '両手利き',
    cost: 10000,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 10000 },
    purchased: false,
    emoji: '🙌'
  },
  {
    id: 'forwards_from_grandma',
    name: 'おばあちゃんからの転送',
    cost: 1000,
    description: 'おばあちゃんの効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'grandma' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'grandma' },
    purchased: false,
    emoji: '📧'
  },
  {
    id: 'steel_plated_rolling_pins',
    name: '鋼鉄メッキの麺棒',
    cost: 5000,
    description: 'おばあちゃんの効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'grandma' },
    unlockCondition: { type: 'building_count', value: 5, buildingId: 'grandma' },
    purchased: false,
    emoji: '🥖'
  },
  {
    id: 'cheap_hoes',
    name: '安いクワ',
    cost: 11000,
    description: '農場の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'farm' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'farm' },
    purchased: false,
    emoji: '🔨'
  },
  {
    id: 'fertilizer',
    name: '肥料',
    cost: 55000,
    description: '農場の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'farm' },
    unlockCondition: { type: 'building_count', value: 5, buildingId: 'farm' },
    purchased: false,
    emoji: '💩'
  }
]

// 実績の初期データ
export const initialAchievements: Achievement[] = [
  {
    id: 'wake_and_bake',
    name: '起きて焼く',
    description: '初回クッキーを焼く',
    condition: { type: 'cookies_total', value: 1 },
    unlocked: false,
    emoji: '🌅'
  },
  {
    id: 'making_some_dough',
    name: 'お金を稼ぐ',
    description: '1,000個のクッキーを焼く',
    condition: { type: 'cookies_total', value: 1000 },
    unlocked: false,
    emoji: '💰'
  },
  {
    id: 'so_baked_right_now',
    name: '今とても焼けている',
    description: '100,000個のクッキーを焼く',
    condition: { type: 'cookies_total', value: 100000 },
    unlocked: false,
    emoji: '🔥'
  },
  {
    id: 'fledgling_bakery',
    name: '駆け出しのベーカリー',
    description: '1,000,000個のクッキーを焼く',
    condition: { type: 'cookies_total', value: 1000000 },
    unlocked: false,
    emoji: '🏪'
  },
  {
    id: 'clicktastic',
    name: 'クリック素晴らしい',
    description: '1,000回クリック',
    condition: { type: 'cookies_clicked', value: 1000 },
    unlocked: false,
    emoji: '👆'
  },
  {
    id: 'clickathlon',
    name: 'クリックマラソン',
    description: '10,000回クリック',
    condition: { type: 'cookies_clicked', value: 10000 },
    unlocked: false,
    emoji: '🏃‍♀️'
  },
  {
    id: 'clickolympics',
    name: 'クリックオリンピック',
    description: '100,000回クリック',
    condition: { type: 'cookies_clicked', value: 100000 },
    unlocked: false,
    emoji: '🥇'
  },
  {
    id: 'just_wrong',
    name: 'ただの間違い',
    description: 'おばあちゃんを1人雇う',
    condition: { type: 'building_count', value: 1, buildingId: 'grandma' },
    unlocked: false,
    emoji: '👵'
  },
  {
    id: 'retirement_home',
    name: '老人ホーム',
    description: 'おばあちゃんを50人雇う',
    condition: { type: 'building_count', value: 50, buildingId: 'grandma' },
    unlocked: false,
    emoji: '🏠'
  },
  {
    id: 'production_chain',
    name: '生産チェーン',
    description: '毎秒100個のクッキーを生産',
    condition: { type: 'cps', value: 100 },
    unlocked: false,
    emoji: '⚙️'
  }
]

// 数値フォーマット関数
export const formatNumber = (num: number): string => {
  if (num < 1000) return Math.floor(num).toString()
  if (num < 1000000) return (num / 1000).toFixed(1) + 'K'
  if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M'
  if (num < 1000000000000) return (num / 1000000000).toFixed(1) + 'B'
  return (num / 1000000000000).toFixed(1) + 'T'
}

// 建物コスト計算
export const calculateBuildingCost = (building: Building): number => {
  return Math.floor(building.baseCost * Math.pow(1.15, building.count))
}

// 建物生産量計算（アップグレード効果を含む）
export const calculateBuildingProduction = (building: Building, upgrades: Upgrade[]): number => {
  let production = building.baseProduction * building.count

  // アップグレード効果を適用
  upgrades.forEach(upgrade => {
    if (upgrade.purchased && upgrade.effect.type === 'building_multiplier' && upgrade.effect.buildingId === building.id) {
      production *= upgrade.effect.value
    }
  })

  return production
}

// 総CPS計算
export const calculateTotalCPS = (buildings: Building[], upgrades: Upgrade[]): number => {
  let totalCPS = 0

  buildings.forEach(building => {
    totalCPS += calculateBuildingProduction(building, upgrades)
  })

  // 全体CPSアップグレードを適用
  upgrades.forEach(upgrade => {
    if (upgrade.purchased && upgrade.effect.type === 'cps_multiplier') {
      totalCPS *= upgrade.effect.value
    }
  })

  return totalCPS
}

// クリック威力計算
export const calculateClickPower = (upgrades: Upgrade[]): number => {
  let clickPower = 1

  upgrades.forEach(upgrade => {
    if (upgrade.purchased && upgrade.effect.type === 'click_multiplier') {
      clickPower *= upgrade.effect.value
    }
  })

  return clickPower
}
