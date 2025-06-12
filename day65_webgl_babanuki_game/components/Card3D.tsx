'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { Card } from '../lib/card-game'

interface Card3DProps {
  card: Card
  position: [number, number, number]
  rotation?: [number, number, number]
  isHovered?: boolean
  isSelectable?: boolean
  onClick?: () => void
  scale?: number
}

export function Card3D({
  card,
  position,
  rotation = [0, 0, 0],
  isHovered = false,
  isSelectable = false,
  onClick,
  scale = 1
}: Card3DProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)

  // スートの色を決定
  const suitColor = useMemo(() => {
    if (card.isJoker) return '#ff0066'
    if (card.suit === 'hearts' || card.suit === 'diamonds') return '#cc0000'
    return '#000000'
  }, [card.suit, card.isJoker])

  // スートのシンボル
  const suitSymbol = useMemo(() => {
    switch (card.suit) {
      case 'hearts': return '♥'
      case 'diamonds': return '♦'
      case 'clubs': return '♣'
      case 'spades': return '♠'
      case 'joker': return '🃏'
      default: return ''
    }
  }, [card.suit])

  // アニメーション
  useFrame((state) => {
    if (groupRef.current) {
      // ホバー時のアニメーション
      if (isHovered) {
        groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.05 + 0.1
        groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 2) * 0.05
      } else {
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1], 0.1)
        groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, rotation[2], 0.1)
      }
    }
  })

  const handleClick = () => {
    if (isSelectable && onClick) {
      onClick()
    }
  }

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={handleClick}
      onPointerOver={() => {
        if (isSelectable) {
          document.body.style.cursor = 'pointer'
        }
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default'
      }}
    >
      {/* カード本体 */}
      <mesh ref={meshRef}>
        <boxGeometry args={[0.6, 0.9, 0.05]} />
        <meshStandardMaterial
          color={card.isJoker ? '#2a2a2a' : '#ffffff'}
          roughness={0.1}
          metalness={0.1}
        />
      </mesh>

      {/* カード表面のテキスト */}
      <group position={[0, 0, 0.026]}>
        {/* 左上のランク */}
        <Text
          position={[-0.22, 0.32, 0]}
          fontSize={0.12}
          color={suitColor}
          font="/fonts/arial.woff"
          anchorX="center"
          anchorY="middle"
        >
          {card.rank}
        </Text>

        {/* 左上のスート */}
        <Text
          position={[-0.22, 0.22, 0]}
          fontSize={0.08}
          color={suitColor}
          font="/fonts/arial.woff"
          anchorX="center"
          anchorY="middle"
        >
          {suitSymbol}
        </Text>

        {/* 中央のスート（大きく表示） */}
        <Text
          position={[0, 0, 0]}
          fontSize={0.25}
          color={suitColor}
          font="/fonts/arial.woff"
          anchorX="center"
          anchorY="middle"
        >
          {suitSymbol}
        </Text>

        {/* 右下のランク（回転） */}
        <Text
          position={[0.22, -0.32, 0]}
          fontSize={0.12}
          color={suitColor}
          font="/fonts/arial.woff"
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, Math.PI]}
        >
          {card.rank}
        </Text>

        {/* 右下のスート（回転） */}
        <Text
          position={[0.22, -0.22, 0]}
          fontSize={0.08}
          color={suitColor}
          font="/fonts/arial.woff"
          anchorX="center"
          anchorY="middle"
          rotation={[0, 0, Math.PI]}
        >
          {suitSymbol}
        </Text>
      </group>

      {/* カード背面 */}
      <mesh position={[0, 0, -0.026]}>
        <planeGeometry args={[0.58, 0.88]} />
        <meshStandardMaterial
          color="#1a365d"
          roughness={0.3}
          metalness={0.0}
        />
      </mesh>

      {/* 選択可能な場合のグロー効果 */}
      {isSelectable && (
        <mesh>
          <boxGeometry args={[0.65, 0.95, 0.06]} />
          <meshBasicMaterial
            color="#00ff88"
            transparent
            opacity={isHovered ? 0.3 : 0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  )
}
