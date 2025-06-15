'use client'

import { useMemo } from 'react'
import { Card3D } from './Card3D'
import type { Player } from '../lib/card-game'

interface PlayerHandProps {
  player: Player
  onCardClick?: (cardIndex: number) => void
  selectedCardIndex?: number
  isCurrentPlayer?: boolean
  showCards?: boolean // 相手の手札は裏向きで表示するかどうか
  isAvailableTarget?: boolean // カードを引ける対象かどうか
}

export function PlayerHand({
  player,
  onCardClick,
  selectedCardIndex,
  isCurrentPlayer = false,
  showCards = true,
  isAvailableTarget = false
}: PlayerHandProps) {

  // プレイヤーの位置に基づいて手札の配置を計算
  const handPositions = useMemo(() => {
    const cardCount = player.hand.length
    if (cardCount === 0) return []

    const positions: Array<{
      position: [number, number, number]
      rotation: [number, number, number]
    }> = []

    // プレイヤーの位置に応じた配置
    switch (player.position) {
      case 0: // 下部（人間プレイヤー）
        {
          const startX = -(cardCount - 1) * 0.7 / 2
          for (let i = 0; i < cardCount; i++) {
            positions.push({
              position: [startX + i * 0.7, 0.5, 4.0], // Y位置を上げて、Z位置を手前に、間隔を広げる
              rotation: [-Math.PI / 6, 0, 0] // より見やすい角度に調整（30度）
            })
          }
        }
        break

      case 1: // 左側
        {
          const startZ = -(cardCount - 1) * 0.5 / 2
          for (let i = 0; i < cardCount; i++) {
            positions.push({
              position: [-3.5, 0.2, startZ + i * 0.5],
              rotation: [Math.PI / 12, Math.PI / 2, 0]
            })
          }
        }
        break

      case 2: // 上部
        {
          const startX = (cardCount - 1) * 0.6 / 2
          for (let i = 0; i < cardCount; i++) {
            positions.push({
              position: [startX - i * 0.6, 0.2, -3.5],
              rotation: [Math.PI / 12, Math.PI, 0]
            })
          }
        }
        break

      case 3: // 右側
        {
          const startZ = (cardCount - 1) * 0.5 / 2
          for (let i = 0; i < cardCount; i++) {
            positions.push({
              position: [3.5, 0.2, startZ - i * 0.5],
              rotation: [Math.PI / 12, -Math.PI / 2, 0]
            })
          }
        }
        break
    }

    return positions
  }, [player.hand.length, player.position])

  // プレイヤー名表示位置
  const namePosition = useMemo((): [number, number, number] => {
    switch (player.position) {
      case 0: return [0, 0.5, 5]    // 下部
      case 1: return [-5, 0.5, 0]   // 左側
      case 2: return [0, 0.5, -5]   // 上部
      case 3: return [5, 0.5, 0]    // 右側
      default: return [0, 0.5, 0]
    }
  }, [player.position])

  return (
    <group>
      {/* プレイヤー名表示 - 背景を削除してテキストのみに */}
      <group position={namePosition}>
        {/* 背景のmeshを削除またはコメントアウト */}
        {/*
        <mesh>
          <planeGeometry args={[2, 0.5]} />
          <meshBasicMaterial
            color={isCurrentPlayer ? "#00ff88" : "#ffffff"}
            transparent
            opacity={0.8}
          />
        </mesh>
        */}
        {/* TODO: プレイヤー名テキストは後で実装 */}
      </group>

      {/* 手札表示 */}
      {player.hand.map((card, index) => {
        if (index >= handPositions.length) return null

        const { position, rotation } = handPositions[index]
        const isSelectable = player.isHuman ? (player.isHuman && isCurrentPlayer) : isAvailableTarget // CPUの手札は利用可能な場合のみ選択可能
        const isHovered = selectedCardIndex === index

        // 人間プレイヤーのカードは常に表示、CPUプレイヤーのカードは裏向き
        const shouldShowCard = player.isHuman

        return (
          <Card3D
            key={`${card.id}-${index}`}
            card={shouldShowCard ? card : {
              id: `hidden-${index}`,
              suit: 'clubs',
              rank: 'A',
              isJoker: false
            }}
            position={position}
            rotation={rotation}
            isHovered={isHovered}
            isSelectable={isSelectable}
            onClick={() => onCardClick?.(index)}
            scale={player.isHuman ? 1.0 : 0.7} // 人間プレイヤーの手札を大きく表示
            showBack={!shouldShowCard} // 裏向き表示フラグを追加
            isAvailableTarget={isAvailableTarget} // 利用可能ターゲットフラグを追加
          />
        )
      })}

      {/* 手札数表示（相手プレイヤー用） - 背景を削除 */}
      {!player.isHuman && (
        <group position={[namePosition[0], namePosition[1] - 0.3, namePosition[2]]}>
          {/* 背景のmeshを削除またはコメントアウト */}
          {/*
          <mesh>
            <planeGeometry args={[1, 0.3]} />
            <meshBasicMaterial color="#333333" transparent opacity={0.7} />
          </mesh>
          */}
          {/* TODO: 手札数テキストは後で実装 */}
        </group>
      )}

      {/* 収集したペア表示エリア */}
      {player.pairsCollected.length > 0 && (
        <group position={[namePosition[0] + 2, 0, namePosition[2]]}>
          {player.pairsCollected.map((pair, pairIndex) => (
            <group key={pairIndex} position={[pairIndex * 0.3, 0, 0]}>
              <Card3D
                card={pair[0]}
                position={[0, 0, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={0.3}
              />
              <Card3D
                card={pair[1]}
                position={[0.1, 0, 0.1]}
                rotation={[Math.PI / 2, 0, 0]}
                scale={0.3}
              />
            </group>
          ))}
        </group>
      )}
    </group>
  )
}
