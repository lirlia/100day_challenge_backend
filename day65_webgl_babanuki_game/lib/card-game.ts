// カードの種類を定義
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'joker'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER'

export interface Card {
  id: string
  suit: Suit
  rank: Rank
  isJoker: boolean
}

export interface Player {
  id: string
  name: string
  isHuman: boolean
  hand: Card[]
  pairsCollected: Array<[Card, Card]>
  position: number // 0: bottom (human), 1: left, 2: top, 3: right
}

export type GamePhase = 'setup' | 'dealing' | 'initial_pairs' | 'playing' | 'finished'

export interface GameState {
  phase: GamePhase
  players: Player[]
  currentPlayerIndex: number
  deck: Card[]
  gameLog: string[]
  winner: string | null
  finishedOrder: string[] // 完走順
}

// デッキを生成する関数
export function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades']
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
  const deck: Card[] = []

  // 通常のカードを生成
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        isJoker: false
      })
    }
  }

  // ジョーカーを追加
  deck.push({
    id: 'joker',
    suit: 'joker',
    rank: 'JOKER',
    isJoker: true
  })

  return deck
}

// デッキをシャッフルする関数
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// カードのペアを判定する関数
export function findPairs(hand: Card[]): Array<[Card, Card]> {
  const pairs: Array<[Card, Card]> = []
  const used = new Set<number>()

  for (let i = 0; i < hand.length; i++) {
    if (used.has(i) || hand[i].isJoker) continue

    for (let j = i + 1; j < hand.length; j++) {
      if (used.has(j) || hand[j].isJoker) continue

      // 同じランクならペア
      if (hand[i].rank === hand[j].rank) {
        pairs.push([hand[i], hand[j]])
        used.add(i)
        used.add(j)
        break
      }
    }
  }

  return pairs
}

// 手札からペアを除去する関数
export function removePairs(hand: Card[]): { newHand: Card[], removedPairs: Array<[Card, Card]> } {
  const pairs = findPairs(hand)
  const allPairCards: Card[] = []
  pairs.forEach(pair => allPairCards.push(...pair))
  const pairCards = new Set(allPairCards.map(card => card.id))
  const newHand = hand.filter(card => !pairCards.has(card.id))

  return { newHand, removedPairs: pairs }
}

// プレイヤーを初期化する関数
export function createPlayers(): Player[] {
  return [
    {
      id: 'human',
      name: 'あなた',
      isHuman: true,
      hand: [],
      pairsCollected: [],
      position: 0
    },
    {
      id: 'cpu1',
      name: 'CPU-1',
      isHuman: false,
      hand: [],
      pairsCollected: [],
      position: 1
    },
    {
      id: 'cpu2',
      name: 'CPU-2',
      isHuman: false,
      hand: [],
      pairsCollected: [],
      position: 2
    },
    {
      id: 'cpu3',
      name: 'CPU-3',
      isHuman: false,
      hand: [],
      pairsCollected: [],
      position: 3
    }
  ]
}

// カードを配布する関数
export function dealCards(deck: Card[], players: Player[]): { updatedPlayers: Player[], remainingDeck: Card[] } {
  const shuffledDeck = shuffleDeck(deck)
  const updatedPlayers: Player[] = players.map(player => ({
    ...player,
    hand: [] as Card[],
    pairsCollected: [] as Array<[Card, Card]>
  }))
  let deckIndex = 0

  // 全てのカードを均等に配布
  while (deckIndex < shuffledDeck.length) {
    for (let i = 0; i < players.length && deckIndex < shuffledDeck.length; i++) {
      updatedPlayers[i].hand.push(shuffledDeck[deckIndex])
      deckIndex++
    }
  }

  return { updatedPlayers, remainingDeck: [] }
}

// 初期ペア除去を実行する関数
export function processInitialPairs(players: Player[]): Player[] {
  return players.map(player => {
    const { newHand, removedPairs } = removePairs(player.hand)
    return {
      ...player,
      hand: newHand,
      pairsCollected: [...player.pairsCollected, ...removedPairs]
    }
  })
}

// ゲームが終了しているかチェック
export function checkGameEnd(players: Player[]): { isGameEnd: boolean, winner: string | null } {
  const playersWithCards = players.filter(player => player.hand.length > 0)

  if (playersWithCards.length <= 1) {
    // 最後に残ったプレイヤーが負け、他が勝ち
    if (playersWithCards.length === 1) {
      return { isGameEnd: true, winner: null } // 負けプレイヤーのみ残り
    } else {
      return { isGameEnd: true, winner: null } // 全員完走（通常起こらない）
    }
  }

  return { isGameEnd: false, winner: null }
}

// 次のプレイヤーインデックスを取得
export function getNextPlayerIndex(currentIndex: number, players: Player[]): number {
  let nextIndex = (currentIndex + 1) % players.length

  // 手札がないプレイヤーをスキップ
  while (players[nextIndex].hand.length === 0) {
    nextIndex = (nextIndex + 1) % players.length

    // 無限ループ防止（全員手札なしの場合）
    if (nextIndex === currentIndex) break
  }

  return nextIndex
}

// ゲーム状態を初期化
export function initializeGame(): GameState {
  return {
    phase: 'setup',
    players: createPlayers(),
    currentPlayerIndex: 0,
    deck: createDeck(),
    gameLog: ['ゲームを開始します'],
    winner: null,
    finishedOrder: []
  }
}
