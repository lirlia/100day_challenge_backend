import type { GameState, Player, Card } from './card-game'
import { removePairs, checkGameEnd, getNextPlayerIndex } from './card-game'
import type { AIDifficulty, AIDecision, BaseAI } from './ai-system'
import { createAI, getAIThinkingTime } from './ai-system'

export interface GameController {
  gameState: GameState
  aiPlayers: Map<string, BaseAI>
  aiDifficulty: AIDifficulty
  isProcessing: boolean
  selectedCardIndex: number | null
  waitingForPlayerAction: boolean
}

export interface GameAction {
  type: 'PLAYER_SELECT_CARD' | 'AI_TURN' | 'DRAW_CARD' | 'NEXT_TURN' | 'GAME_END'
  payload?: any
}

// ゲームコントローラーを初期化
export function createGameController(
  initialGameState: GameState,
  aiDifficulty: AIDifficulty = 'normal'
): GameController {
  const aiPlayers = new Map<string, BaseAI>()

  // CPUプレイヤー用のAIを作成
  initialGameState.players.forEach(player => {
    if (!player.isHuman) {
      aiPlayers.set(player.id, createAI(aiDifficulty, player.id))
    }
  })

  return {
    gameState: initialGameState,
    aiPlayers,
    aiDifficulty,
    isProcessing: false,
    selectedCardIndex: null,
    waitingForPlayerAction: false
  }
}

// プレイヤーがカードを選択した時の処理
export function handlePlayerCardSelection(
  controller: GameController,
  cardIndex: number
): GameController {
  if (controller.isProcessing || !controller.waitingForPlayerAction) {
    return controller
  }

  const currentPlayer = controller.gameState.players[controller.gameState.currentPlayerIndex]

  if (!currentPlayer.isHuman) {
    return controller
  }

  return {
    ...controller,
    selectedCardIndex: cardIndex
  }
}

// プレイヤーが他のプレイヤーからカードを引く処理
export async function handleDrawCard(
  controller: GameController,
  targetPlayerId: string,
  cardIndex: number
): Promise<GameController> {
  if (controller.isProcessing) {
    return controller
  }

  const newController = { ...controller, isProcessing: true }
  const gameState = { ...newController.gameState }

  // プレイヤーを見つける
  const currentPlayerIndex = gameState.currentPlayerIndex
  const currentPlayer = gameState.players[currentPlayerIndex]
  const targetPlayerIndex = gameState.players.findIndex(p => p.id === targetPlayerId)

  if (targetPlayerIndex === -1 || cardIndex >= gameState.players[targetPlayerIndex].hand.length) {
    return { ...newController, isProcessing: false }
  }

  // カードを引く処理
  const targetPlayer = gameState.players[targetPlayerIndex]
  const drawnCard = targetPlayer.hand[cardIndex]

  // 新しいプレイヤー状態を作成
  const updatedPlayers = gameState.players.map((player, index) => {
    if (index === currentPlayerIndex) {
      // 現在のプレイヤーにカードを追加
      const newHand = [...player.hand, drawnCard]
      const { newHand: handAfterPairs, removedPairs } = removePairs(newHand)

      return {
        ...player,
        hand: handAfterPairs,
        pairsCollected: [...player.pairsCollected, ...removedPairs]
      }
    } else if (index === targetPlayerIndex) {
      // ターゲットプレイヤーからカードを削除
      const newHand = player.hand.filter((_, i) => i !== cardIndex)
      return {
        ...player,
        hand: newHand
      }
    }
    return player
  })

  // ゲーム終了チェック
  const { isGameEnd, winner } = checkGameEnd(updatedPlayers)

  // 次のプレイヤーインデックスを計算
  const nextPlayerIndex = isGameEnd ? currentPlayerIndex : getNextPlayerIndex(currentPlayerIndex, updatedPlayers)

  const updatedGameState: GameState = {
    ...gameState,
    players: updatedPlayers,
    currentPlayerIndex: nextPlayerIndex,
    phase: isGameEnd ? 'finished' : 'playing',
    winner,
    gameLog: [
      ...gameState.gameLog,
      `${currentPlayer.name}が${targetPlayer.name}からカードを引きました`
    ]
  }

  return {
    ...newController,
    gameState: updatedGameState,
    isProcessing: false,
    selectedCardIndex: null,
    waitingForPlayerAction: false
  }
}

// AIのターン処理
export async function processAITurn(controller: GameController): Promise<GameController> {
  if (controller.isProcessing) {
    return controller
  }

  const currentPlayer = controller.gameState.players[controller.gameState.currentPlayerIndex]

  if (currentPlayer.isHuman) {
    return {
      ...controller,
      waitingForPlayerAction: true
    }
  }

  const newController = { ...controller, isProcessing: true }
  const ai = newController.aiPlayers.get(currentPlayer.id)

  if (!ai) {
    return { ...newController, isProcessing: false }
  }

  // AI思考時間をシミュレート
  const thinkingTime = getAIThinkingTime(newController.aiDifficulty)
  await new Promise(resolve => setTimeout(resolve, thinkingTime))

  // AIの決定を取得
  const decision: AIDecision = ai.makeDecision(
    currentPlayer,
    newController.gameState.players,
    newController.gameState
  )

  // AIの決定を実行
  if (decision.action === 'drawCard' && decision.targetPlayerId && decision.cardIndex !== undefined) {
    return await handleDrawCard(newController, decision.targetPlayerId, decision.cardIndex)
  }

  return { ...newController, isProcessing: false }
}

// ゲームの次のターンに進む
export async function advanceToNextTurn(controller: GameController): Promise<GameController> {
  const currentPlayer = controller.gameState.players[controller.gameState.currentPlayerIndex]

  // ゲーム終了チェック
  if (controller.gameState.phase === 'finished') {
    return controller
  }

  // 現在のプレイヤーが人間の場合、プレイヤーの入力を待つ
  if (currentPlayer.isHuman && !controller.waitingForPlayerAction) {
    return {
      ...controller,
      waitingForPlayerAction: true
    }
  }

  // AIのターンの場合、AI処理を実行
  if (!currentPlayer.isHuman) {
    return await processAITurn(controller)
  }

  return controller
}

// ゲーム状態をリセット
export function resetGame(
  controller: GameController,
  newGameState: GameState
): GameController {
  return {
    ...controller,
    gameState: newGameState,
    isProcessing: false,
    selectedCardIndex: null,
    waitingForPlayerAction: false
  }
}

// 現在のプレイヤーが行動可能かチェック
export function canPlayerAct(controller: GameController): boolean {
  const currentPlayer = controller.gameState.players[controller.gameState.currentPlayerIndex]
  return (
    !controller.isProcessing &&
    currentPlayer.isHuman &&
    controller.gameState.phase === 'playing' &&
    controller.waitingForPlayerAction
  )
}

// 他のプレイヤーからカードを引けるかチェック
export function getAvailableTargets(controller: GameController): Player[] {
  const currentPlayer = controller.gameState.players[controller.gameState.currentPlayerIndex]
  return controller.gameState.players.filter(
    p => p.id !== currentPlayer.id && p.hand.length > 0
  )
}

// ゲーム統計を取得
export function getGameStats(controller: GameController) {
  const players = controller.gameState.players
  const totalCards = players.reduce((sum, p) => sum + p.hand.length, 0)
  const totalPairs = players.reduce((sum, p) => sum + p.pairsCollected.length, 0)

  return {
    totalCards,
    totalPairs,
    currentTurn: controller.gameState.players[controller.gameState.currentPlayerIndex]?.name || '',
    gamePhase: controller.gameState.phase,
    isProcessing: controller.isProcessing,
    canPlayerAct: canPlayerAct(controller)
  }
}
