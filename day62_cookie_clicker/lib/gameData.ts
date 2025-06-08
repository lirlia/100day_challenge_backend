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
    id: 'thousand_fingers',
    name: '千本の指',
    cost: 100000,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 25000 },
    purchased: false,
    emoji: '🖐️'
  },
  {
    id: 'million_fingers',
    name: '百万本の指',
    cost: 1000000,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 100000 },
    purchased: false,
    emoji: '🫵'
  },
  {
    id: 'billion_fingers',
    name: '十億本の指',
    cost: 10000000,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 500000 },
    purchased: false,
    emoji: '👋'
  },
  {
    id: 'trillion_fingers',
    name: '一兆本の指',
    cost: 100000000,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 1000000 },
    purchased: false,
    emoji: '🙏'
  },
  {
    id: 'quadrillion_fingers',
    name: '千兆本の指',
    cost: 1000000000,
    description: 'クリック効率を3倍にします',
    effect: { type: 'click_multiplier', value: 3 },
    unlockCondition: { type: 'cookies_clicked', value: 10000000 },
    purchased: false,
    emoji: '🌟'
  },
  {
    id: 'quintillion_fingers',
    name: '百京本の指',
    cost: 10000000000,
    description: 'クリック効率を5倍にします',
    effect: { type: 'click_multiplier', value: 5 },
    unlockCondition: { type: 'cookies_clicked', value: 100000000 },
    purchased: false,
    emoji: '✨'
  },
  {
    id: 'sextillion_fingers',
    name: '十垓本の指',
    cost: 100000000000,
    description: 'クリック効率を10倍にします',
    effect: { type: 'click_multiplier', value: 10 },
    unlockCondition: { type: 'cookies_clicked', value: 1000000000 },
    purchased: false,
    emoji: '💫'
  },
  {
    id: 'septillion_fingers',
    name: '穣本の指',
    cost: 1000000000000,
    description: 'クリック効率を20倍にします',
    effect: { type: 'click_multiplier', value: 20 },
    unlockCondition: { type: 'cookies_clicked', value: 10000000000 },
    purchased: false,
    emoji: '🌈'
  },
  {
    id: 'octillion_fingers',
    name: '溝本の指',
    cost: 10000000000000,
    description: 'クリック効率を50倍にします',
    effect: { type: 'click_multiplier', value: 50 },
    unlockCondition: { type: 'cookies_clicked', value: 100000000000 },
    purchased: false,
    emoji: '🚀'
  },
  {
    id: 'plastic_mouse',
    name: 'プラスチックマウス',
    cost: 50000,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 50000 },
    purchased: false,
    emoji: '🖱️'
  },
  {
    id: 'iron_mouse',
    name: '鉄製マウス',
    cost: 5000000,
    description: 'クリック効率を2倍にします',
    effect: { type: 'click_multiplier', value: 2 },
    unlockCondition: { type: 'cookies_clicked', value: 5000000 },
    purchased: false,
    emoji: '⚙️'
  },
  {
    id: 'titanium_mouse',
    name: 'チタン製マウス',
    cost: 500000000,
    description: 'クリック効率を3倍にします',
    effect: { type: 'click_multiplier', value: 3 },
    unlockCondition: { type: 'cookies_clicked', value: 50000000 },
    purchased: false,
    emoji: '🛠️'
  },
  {
    id: 'adamantium_mouse',
    name: 'アダマンチウム製マウス',
    cost: 50000000000,
    description: 'クリック効率を5倍にします',
    effect: { type: 'click_multiplier', value: 5 },
    unlockCondition: { type: 'cookies_clicked', value: 500000000 },
    purchased: false,
    emoji: '💎'
  },
  {
    id: 'unobtainium_mouse',
    name: 'アンオブタイニウム製マウス',
    cost: 5000000000000,
    description: 'クリック効率を10倍にします',
    effect: { type: 'click_multiplier', value: 10 },
    unlockCondition: { type: 'cookies_clicked', value: 5000000000 },
    purchased: false,
    emoji: '✨'
  },
  {
    id: 'eludium_mouse',
    name: 'エルディウム製マウス',
    cost: 500000000000000,
    description: 'クリック効率を20倍にします',
    effect: { type: 'click_multiplier', value: 20 },
    unlockCondition: { type: 'cookies_clicked', value: 50000000000 },
    purchased: false,
    emoji: '🌟'
  },
  {
    id: 'wishalloy_mouse',
    name: 'ウィッシュアロイ製マウス',
    cost: 50000000000000000,
    description: 'クリック効率を100倍にします',
    effect: { type: 'click_multiplier', value: 100 },
    unlockCondition: { type: 'cookies_clicked', value: 500000000000 },
    purchased: false,
    emoji: '⭐'
  },
  {
    id: 'fantasteel_mouse',
    name: 'ファンタスチール製マウス',
    cost: 5000000000000000000,
    description: 'クリック効率を1000倍にします',
    effect: { type: 'click_multiplier', value: 1000 },
    unlockCondition: { type: 'cookies_clicked', value: 5000000000000 },
    purchased: false,
    emoji: '💫'
  },
  {
    id: 'nevercrack_mouse',
    name: 'ネバークラック製マウス',
    cost: 500000000000000000000,
    description: 'クリック効率を10000倍にします',
    effect: { type: 'click_multiplier', value: 10000 },
    unlockCondition: { type: 'cookies_clicked', value: 50000000000000 },
    purchased: false,
    emoji: '🌈'
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
  },
  {
    id: 'thousand_fingers_synergy',
    name: '千本指シナジー',
    cost: 500000,
    description: 'カーソルの効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'cursor' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'cursor' },
    purchased: false,
    emoji: '☝️'
  },
  {
    id: 'million_fingers_synergy',
    name: '百万指シナジー',
    cost: 50000000,
    description: 'カーソルの効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'cursor' },
    unlockCondition: { type: 'building_count', value: 10, buildingId: 'cursor' },
    purchased: false,
    emoji: '🖐️'
  },
  {
    id: 'billion_fingers_synergy',
    name: '十億指シナジー',
    cost: 5000000000,
    description: 'カーソルの効率を3倍にします',
    effect: { type: 'building_multiplier', value: 3, buildingId: 'cursor' },
    unlockCondition: { type: 'building_count', value: 25, buildingId: 'cursor' },
    purchased: false,
    emoji: '🙌'
  },
  {
    id: 'sugar_gas',
    name: '砂糖ガス',
    cost: 120000,
    description: 'マインの効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'mine' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'mine' },
    purchased: false,
    emoji: '💨'
  },
  {
    id: 'megadrill',
    name: 'メガドリル',
    cost: 600000,
    description: 'マインの効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'mine' },
    unlockCondition: { type: 'building_count', value: 5, buildingId: 'mine' },
    purchased: false,
    emoji: '⛏️'
  },
  {
    id: 'ultradrill',
    name: 'ウルトラドリル',
    cost: 60000000,
    description: 'マインの効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'mine' },
    unlockCondition: { type: 'building_count', value: 10, buildingId: 'mine' },
    purchased: false,
    emoji: '🔥'
  },
  {
    id: 'ultimadrill',
    name: 'アルティマドリル',
    cost: 6000000000,
    description: 'マインの効率を3倍にします',
    effect: { type: 'building_multiplier', value: 3, buildingId: 'mine' },
    unlockCondition: { type: 'building_count', value: 25, buildingId: 'mine' },
    purchased: false,
    emoji: '💎'
  },
  {
    id: 'sturdier_conveyor_belts',
    name: 'より頑丈なベルトコンベア',
    cost: 1300000,
    description: '工場の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'factory' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'factory' },
    purchased: false,
    emoji: '🔧'
  },
  {
    id: 'child_labor',
    name: '児童労働',
    cost: 6500000,
    description: '工場の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'factory' },
    unlockCondition: { type: 'building_count', value: 5, buildingId: 'factory' },
    purchased: false,
    emoji: '👶'
  },
  {
    id: 'sweatshop',
    name: 'スウェットショップ',
    cost: 650000000,
    description: '工場の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'factory' },
    unlockCondition: { type: 'building_count', value: 10, buildingId: 'factory' },
    purchased: false,
    emoji: '💪'
  },
  {
    id: 'radium_reactors',
    name: 'ラジウム原子炉',
    cost: 65000000000,
    description: '工場の効率を3倍にします',
    effect: { type: 'building_multiplier', value: 3, buildingId: 'factory' },
    unlockCondition: { type: 'building_count', value: 25, buildingId: 'factory' },
    purchased: false,
    emoji: '☢️'
  },
  {
    id: 'taller_tellers',
    name: 'より背の高い窓口係',
    cost: 14000000,
    description: '銀行の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'bank' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'bank' },
    purchased: false,
    emoji: '🏃‍♂️'
  },
  {
    id: 'scissor_resistant_credit_cards',
    name: 'ハサミ耐性クレジットカード',
    cost: 70000000,
    description: '銀行の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'bank' },
    unlockCondition: { type: 'building_count', value: 5, buildingId: 'bank' },
    purchased: false,
    emoji: '💳'
  },
  {
    id: 'acid_proof_vaults',
    name: '耐酸性金庫',
    cost: 7000000000,
    description: '銀行の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'bank' },
    unlockCondition: { type: 'building_count', value: 10, buildingId: 'bank' },
    purchased: false,
    emoji: '🔒'
  },
  {
    id: 'chocolate_coins',
    name: 'チョコレートコイン',
    cost: 700000000000,
    description: '銀行の効率を3倍にします',
    effect: { type: 'building_multiplier', value: 3, buildingId: 'bank' },
    unlockCondition: { type: 'building_count', value: 25, buildingId: 'bank' },
    purchased: false,
    emoji: '🍫'
  },
  {
    id: 'golden_idols',
    name: '黄金の偶像',
    cost: 200000000,
    description: '神殿の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'temple' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'temple' },
    purchased: false,
    emoji: '👑'
  },
  {
    id: 'sacrifices',
    name: '生け贄',
    cost: 1000000000,
    description: '神殿の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'temple' },
    unlockCondition: { type: 'building_count', value: 5, buildingId: 'temple' },
    purchased: false,
    emoji: '⚰️'
  },
  {
    id: 'delicious_blessing',
    name: '美味しい祝福',
    cost: 100000000000,
    description: '神殿の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'temple' },
    unlockCondition: { type: 'building_count', value: 10, buildingId: 'temple' },
    purchased: false,
    emoji: '🙏'
  },
  {
    id: 'sun_festival',
    name: '太陽祭',
    cost: 10000000000000,
    description: '神殿の効率を3倍にします',
    effect: { type: 'building_multiplier', value: 3, buildingId: 'temple' },
    unlockCondition: { type: 'building_count', value: 25, buildingId: 'temple' },
    purchased: false,
    emoji: '☀️'
  },
  {
    id: 'pointier_hats',
    name: 'より尖った帽子',
    cost: 3300000000,
    description: '魔法使いの塔の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'wizard_tower' },
    unlockCondition: { type: 'building_count', value: 1, buildingId: 'wizard_tower' },
    purchased: false,
    emoji: '🎩'
  },
  {
    id: 'beardlier_beards',
    name: 'より豊かなひげ',
    cost: 16500000000,
    description: '魔法使いの塔の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'wizard_tower' },
    unlockCondition: { type: 'building_count', value: 5, buildingId: 'wizard_tower' },
    purchased: false,
    emoji: '🧙‍♂️'
  },
  {
    id: 'ancient_tablet',
    name: '古代のタブレット',
    cost: 1650000000000,
    description: '魔法使いの塔の効率を2倍にします',
    effect: { type: 'building_multiplier', value: 2, buildingId: 'wizard_tower' },
    unlockCondition: { type: 'building_count', value: 10, buildingId: 'wizard_tower' },
    purchased: false,
    emoji: '📜'
  },
  {
    id: 'insane_oatmeal_cookies',
    name: '狂気のオートミールクッキー',
    cost: 165000000000000,
    description: '魔法使いの塔の効率を3倍にします',
    effect: { type: 'building_multiplier', value: 3, buildingId: 'wizard_tower' },
    unlockCondition: { type: 'building_count', value: 25, buildingId: 'wizard_tower' },
    purchased: false,
    emoji: '🌙'
  },
  // グローバル効果アップグレード
  {
    id: 'lucky_day',
    name: 'ラッキーデイ',
    cost: 777777,
    description: '全ての建物の効率を1.5倍にします',
    effect: { type: 'global_multiplier', value: 1.5 },
    unlockCondition: { type: 'total_buildings', value: 10 },
    purchased: false,
    emoji: '🍀'
  },
  {
    id: 'serendipity',
    name: 'セレンディピティ',
    cost: 77777777,
    description: '全ての建物の効率を1.5倍にします',
    effect: { type: 'global_multiplier', value: 1.5 },
    unlockCondition: { type: 'total_buildings', value: 50 },
    purchased: false,
    emoji: '✨'
  },
  {
    id: 'get_lucky',
    name: 'ゲット・ラッキー',
    cost: 7777777777,
    description: '全ての建物の効率を2倍にします',
    effect: { type: 'global_multiplier', value: 2 },
    unlockCondition: { type: 'total_buildings', value: 100 },
    purchased: false,
    emoji: '🌟'
  },
  {
    id: 'true_chocolate',
    name: '真のチョコレート',
    cost: 777777777777,
    description: '全ての建物の効率を2倍にします',
    effect: { type: 'global_multiplier', value: 2 },
    unlockCondition: { type: 'total_buildings', value: 150 },
    purchased: false,
    emoji: '🍫'
  },
  {
    id: 'charm_quarks',
    name: 'チャームクォーク',
    cost: 77777777777777,
    description: '全ての建物の効率を3倍にします',
    effect: { type: 'global_multiplier', value: 3 },
    unlockCondition: { type: 'total_buildings', value: 200 },
    purchased: false,
    emoji: '⚛️'
  },
  {
    id: 'leprechaun_village',
    name: 'レプラコーンの村',
    cost: 7777777777777777,
    description: '全ての建物の効率を5倍にします',
    effect: { type: 'global_multiplier', value: 5 },
    unlockCondition: { type: 'total_buildings', value: 300 },
    purchased: false,
    emoji: '🧚‍♂️'
  },
  {
    id: 'kitten_helpers',
    name: '子猫のヘルパー',
    cost: 9000000,
    description: '全ての建物の効率を2倍にします',
    effect: { type: 'global_multiplier', value: 2 },
    unlockCondition: { type: 'total_buildings', value: 25 },
    purchased: false,
    emoji: '🐱'
  },
  {
    id: 'kitten_workers',
    name: '子猫の労働者',
    cost: 900000000,
    description: '全ての建物の効率を2倍にします',
    effect: { type: 'global_multiplier', value: 2 },
    unlockCondition: { type: 'total_buildings', value: 75 },
    purchased: false,
    emoji: '😸'
  },
  {
    id: 'kitten_engineers',
    name: '子猫のエンジニア',
    cost: 90000000000,
    description: '全ての建物の効率を2倍にします',
    effect: { type: 'global_multiplier', value: 2 },
    unlockCondition: { type: 'total_buildings', value: 125 },
    purchased: false,
    emoji: '😻'
  },
  {
    id: 'kitten_overseers',
    name: '子猫の監督者',
    cost: 9000000000000,
    description: '全ての建物の効率を2倍にします',
    effect: { type: 'global_multiplier', value: 2 },
    unlockCondition: { type: 'total_buildings', value: 175 },
    purchased: false,
    emoji: '😽'
  },
  {
    id: 'kitten_managers',
    name: '子猫のマネージャー',
    cost: 900000000000000,
    description: '全ての建物の効率を2倍にします',
    effect: { type: 'global_multiplier', value: 2 },
    unlockCondition: { type: 'total_buildings', value: 250 },
    purchased: false,
    emoji: '😾'
  },
  {
    id: 'kitten_accountants',
    name: '子猫の会計士',
    cost: 90000000000000000,
    description: '全ての建物の効率を3倍にします',
    effect: { type: 'global_multiplier', value: 3 },
    unlockCondition: { type: 'total_buildings', value: 350 },
    purchased: false,
    emoji: '🙀'
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
    id: 'clickpocalypse',
    name: 'クリック黙示録',
    description: '1,000,000回クリック',
    condition: { type: 'cookies_clicked', value: 1000000 },
    unlocked: false,
    emoji: '☄️'
  },
  {
    id: 'clickmageddon',
    name: 'クリックマゲドン',
    description: '10,000,000回クリック',
    condition: { type: 'cookies_clicked', value: 10000000 },
    unlocked: false,
    emoji: '💥'
  },
  {
    id: 'clickfinity',
    name: 'クリック無限',
    description: '100,000,000回クリック',
    condition: { type: 'cookies_clicked', value: 100000000 },
    unlocked: false,
    emoji: '∞'
  },
  {
    id: 'clickternity',
    name: 'クリック永遠',
    description: '1,000,000,000回クリック',
    condition: { type: 'cookies_clicked', value: 1000000000 },
    unlocked: false,
    emoji: '🌌'
  },
  {
    id: 'clicknarok',
    name: 'クリックラグナロク',
    description: '10,000,000,000回クリック',
    condition: { type: 'cookies_clicked', value: 10000000000 },
    unlocked: false,
    emoji: '⚡'
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
  },
  {
    id: 'industrial_complex',
    name: '産業複合体',
    description: '毎秒1,000個のクッキーを生産',
    condition: { type: 'cps', value: 1000 },
    unlocked: false,
    emoji: '🏭'
  },
  {
    id: 'global_economy',
    name: '世界経済',
    description: '毎秒10,000個のクッキーを生産',
    condition: { type: 'cps', value: 10000 },
    unlocked: false,
    emoji: '🌍'
  },
  {
    id: 'galactic_empire',
    name: '銀河帝国',
    description: '毎秒100,000個のクッキーを生産',
    condition: { type: 'cps', value: 100000 },
    unlocked: false,
    emoji: '🌌'
  },
  {
    id: 'building_spree',
    name: '建設ラッシュ',
    description: '合計100個の建物を所有',
    condition: { type: 'total_buildings', value: 100 },
    unlocked: false,
    emoji: '🏗️'
  },
  {
    id: 'architectural_wonder',
    name: '建築の驚異',
    description: '合計500個の建物を所有',
    condition: { type: 'total_buildings', value: 500 },
    unlocked: false,
    emoji: '🏛️'
  },
  {
    id: 'metropolis',
    name: 'メトロポリス',
    description: '合計1,000個の建物を所有',
    condition: { type: 'total_buildings', value: 1000 },
    unlocked: false,
    emoji: '🏙️'
  },
  {
    id: 'upgrade_enthusiast',
    name: 'アップグレード愛好家',
    description: '10個のアップグレードを購入',
    condition: { type: 'upgrades_purchased', value: 10 },
    unlocked: false,
    emoji: '📈'
  },
  {
    id: 'upgrade_addict',
    name: 'アップグレード中毒者',
    description: '25個のアップグレードを購入',
    condition: { type: 'upgrades_purchased', value: 25 },
    unlocked: false,
    emoji: '📊'
  },
  {
    id: 'upgrade_master',
    name: 'アップグレードマスター',
    description: '50個のアップグレードを購入',
    condition: { type: 'upgrades_purchased', value: 50 },
    unlocked: false,
    emoji: '🎯'
  }
]

// 数値フォーマット関数
export const formatNumber = (num: number): string => {
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T'
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
  if (num >= 1) return Math.floor(num).toString()
  if (num > 0) return num.toFixed(1)
  return '0'
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

  // グローバル倍率アップグレードを適用
  upgrades.forEach(upgrade => {
    if (upgrade.purchased && upgrade.effect.type === 'global_multiplier') {
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

  // グローバル倍率アップグレードを適用
  upgrades.forEach(upgrade => {
    if (upgrade.purchased && upgrade.effect.type === 'global_multiplier') {
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
