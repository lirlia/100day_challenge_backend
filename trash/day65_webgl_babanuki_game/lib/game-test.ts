import { createDeck, shuffleDeck, createPlayers, dealCards, initializeGame } from './card-game'

// 基本的なゲームロジックテスト
export function runBasicTests() {
  console.log('=== ババ抜きゲーム基本テスト開始 ===')

  // デッキ生成テスト
  console.log('1. デッキ生成テスト')
  const deck = createDeck()
  console.log(`デッキサイズ: ${deck.length}枚 (期待値: 53枚)`)
  console.log(`ジョーカー数: ${deck.filter(card => card.isJoker).length}枚 (期待値: 1枚)`)

  // シャッフルテスト
  console.log('\n2. シャッフルテスト')
  const originalOrder = deck.map(card => card.id).join(',')
  const shuffledDeck = shuffleDeck(deck)
  const shuffledOrder = shuffledDeck.map(card => card.id).join(',')
  console.log(`シャッフル前後で順序が変化: ${originalOrder !== shuffledOrder}`)

  // プレイヤー生成テスト
  console.log('\n3. プレイヤー生成テスト')
  const players = createPlayers()
  console.log(`プレイヤー数: ${players.length}人 (期待値: 4人)`)
  console.log(`人間プレイヤー: ${players.filter(p => p.isHuman).length}人 (期待値: 1人)`)

  // カード配布テスト
  console.log('\n4. カード配布テスト')
  const { updatedPlayers } = dealCards(deck, players)
  const totalCards = updatedPlayers.reduce((sum, player) => sum + player.hand.length, 0)
  console.log(`配布後の総カード数: ${totalCards}枚 (期待値: 53枚)`)
  updatedPlayers.forEach((player, index) => {
    console.log(`${player.name}の手札: ${player.hand.length}枚`)
  })

  // ゲーム初期化テスト
  console.log('\n5. ゲーム初期化テスト')
  const gameState = initializeGame()
  console.log(`初期フェーズ: ${gameState.phase} (期待値: setup)`)
  console.log(`デッキサイズ: ${gameState.deck.length}枚`)
  console.log(`ログ数: ${gameState.gameLog.length}件`)

  console.log('\n=== テスト完了 ===')
  return true
}
