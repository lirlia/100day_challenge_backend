import type { Card, Player } from './card-game'

export type AIDifficulty = 'easy' | 'normal' | 'hard'

export interface AIDecision {
  action: 'selectCard' | 'drawCard'
  cardIndex?: number // 相手から引くカードのインデックス
  targetPlayerId?: string // カードを引く相手のプレイヤーID
}

// AI基底クラス
export abstract class BaseAI {
  protected difficulty: AIDifficulty
  protected playerId: string

  constructor(difficulty: AIDifficulty, playerId: string) {
    this.difficulty = difficulty
    this.playerId = playerId
  }

  abstract makeDecision(
    currentPlayer: Player,
    allPlayers: Player[],
    gameState: any
  ): AIDecision
}

// やさしいAI（完全ランダム）
export class EasyAI extends BaseAI {
  makeDecision(currentPlayer: Player, allPlayers: Player[]): AIDecision {
    // 手札がある他のプレイヤーを探す
    const availablePlayers = allPlayers.filter(
      p => p.id !== this.playerId && p.hand.length > 0
    )

    if (availablePlayers.length === 0) {
      // 誰からも引けない場合（ゲーム終了間近）
      return { action: 'selectCard' }
    }

    // ランダムにプレイヤーを選択
    const targetPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)]

    // ランダムにカードを選択
    const cardIndex = Math.floor(Math.random() * targetPlayer.hand.length)

    return {
      action: 'drawCard',
      cardIndex,
      targetPlayerId: targetPlayer.id
    }
  }
}

// ふつうAI（基本戦略）
export class NormalAI extends BaseAI {
  makeDecision(currentPlayer: Player, allPlayers: Player[]): AIDecision {
    // 手札がある他のプレイヤーを探す
    const availablePlayers = allPlayers.filter(
      p => p.id !== this.playerId && p.hand.length > 0
    )

    if (availablePlayers.length === 0) {
      return { action: 'selectCard' }
    }

    // 戦略1: 手札が多いプレイヤーを優先的に狙う
    const sortedPlayers = availablePlayers.sort((a, b) => b.hand.length - a.hand.length)
    const targetPlayer = sortedPlayers[0]

    // 戦略2: 端のカードを避ける傾向（ジョーカーが端にある可能性）
    const handSize = targetPlayer.hand.length
    let cardIndex: number

    if (handSize <= 2) {
      // 手札が少ない場合はランダム
      cardIndex = Math.floor(Math.random() * handSize)
    } else {
      // 中央寄りのカードを選ぶ（端を避ける）
      const middleStart = Math.floor(handSize * 0.25)
      const middleEnd = Math.floor(handSize * 0.75)
      cardIndex = middleStart + Math.floor(Math.random() * (middleEnd - middleStart))
    }

    return {
      action: 'drawCard',
      cardIndex,
      targetPlayerId: targetPlayer.id
    }
  }
}

// つよいAI（高度戦略・確率計算）
export class HardAI extends BaseAI {
  makeDecision(currentPlayer: Player, allPlayers: Player[]): AIDecision {
    const availablePlayers = allPlayers.filter(
      p => p.id !== this.playerId && p.hand.length > 0
    )

    if (availablePlayers.length === 0) {
      return { action: 'selectCard' }
    }

    // 高度戦略の実装
    const bestTarget = this.selectBestTarget(currentPlayer, availablePlayers)
    const bestCardIndex = this.selectBestCard(bestTarget, currentPlayer)

    return {
      action: 'drawCard',
      cardIndex: bestCardIndex,
      targetPlayerId: bestTarget.id
    }
  }

  private selectBestTarget(currentPlayer: Player, availablePlayers: Player[]): Player {
    // 複数の要素を考慮してターゲットを選択
    let bestPlayer = availablePlayers[0]
    let bestScore = -Infinity

    for (const player of availablePlayers) {
      let score = 0

      // 要素1: 手札数（多いほど良い）
      score += player.hand.length * 10

      // 要素2: 収集済みペア数（少ないほど良い - 強いプレイヤーを妨害）
      score -= player.pairsCollected.length * 15

      // 要素3: 人間プレイヤーを優先的に狙う
      if (player.isHuman) {
        score += 20
      }

      if (score > bestScore) {
        bestScore = score
        bestPlayer = player
      }
    }

    return bestPlayer
  }

  private selectBestCard(targetPlayer: Player, currentPlayer: Player): number {
    const handSize = targetPlayer.hand.length

    // 自分の手札を分析してペアになりそうなカードを推測
    const myRanks = new Set(currentPlayer.hand.map(card => card.rank))

    // 戦略的カード選択
    if (handSize === 1) {
      // 最後の1枚は必ず選ぶ
      return 0
    } else if (handSize === 2) {
      // 2枚の場合はランダム
      return Math.floor(Math.random() * 2)
    } else if (handSize <= 4) {
      // 少ない手札の場合は中央を避ける（ジョーカー回避）
      return Math.random() < 0.5 ? 0 : handSize - 1
    } else {
      // 多い手札の場合は戦略的に選択
      // 端から1/4の位置を狙う（完全な端は避けつつ、中央も避ける）
      const quarterPoint = Math.floor(handSize * 0.25)
      const threeQuarterPoint = Math.floor(handSize * 0.75)

      return Math.random() < 0.5 ? quarterPoint : threeQuarterPoint
    }
  }
}

// AIファクトリー関数
export function createAI(difficulty: AIDifficulty, playerId: string): BaseAI {
  switch (difficulty) {
    case 'easy':
      return new EasyAI(difficulty, playerId)
    case 'normal':
      return new NormalAI(difficulty, playerId)
    case 'hard':
      return new HardAI(difficulty, playerId)
    default:
      return new EasyAI(difficulty, playerId)
  }
}

// AI思考時間シミュレーション
export function getAIThinkingTime(difficulty: AIDifficulty): number {
  switch (difficulty) {
    case 'easy':
      return 500 + Math.random() * 1000 // 0.5-1.5秒
    case 'normal':
      return 1000 + Math.random() * 1500 // 1-2.5秒
    case 'hard':
      return 1500 + Math.random() * 2000 // 1.5-3.5秒
    default:
      return 1000
  }
}
