'use client'

import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'
import { isWebGLAvailable } from '@/lib/webgl-detector'
import { webglManager } from '@/lib/webgl-manager'

interface Node {
  position: THREE.Vector3
  connections: number[]
  activation: number
  layer: number
  size: number
  pulseTime: number
}

interface Connection {
  from: number
  to: number
  weight: number
  activity: number
  lastPulse: number
}

export default function NeuralFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const nodesRef = useRef<Node[]>([])
  const connectionsRef = useRef<Connection[]>([])
  const nodeMeshesRef = useRef<THREE.Mesh[]>([])
  const connectionLinesRef = useRef<THREE.Line[]>([])

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000811)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 20)
    cameraRef.current = camera

    // Create neural network
    initializeNeuralNetwork()

    // クリーンアップ関数を定義
    const cleanup = () => {
      nodeMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
      connectionLinesRef.current.forEach(line => sceneRef.current?.remove(line))
      nodeMeshesRef.current = []
      connectionLinesRef.current = []
      nodesRef.current = []
      connectionsRef.current = []
    }

    // アップデート関数を定義
    const updateFunction = (deltaTime: number) => {
      updateNeuralNetwork()
      updateConnections()

      // Camera animation
      if (cameraRef.current) {
        const time = Date.now() * 0.0005
        cameraRef.current.position.x = Math.cos(time) * 25
        cameraRef.current.position.z = Math.sin(time) * 25
        cameraRef.current.lookAt(0, 0, 0)
      }
    }

    // WebGLマネージャーにエフェクトを登録
    webglManager.registerEffect('neural-flow', scene, camera, cleanup, updateFunction)
    webglManager.setActiveEffect('neural-flow')
    webglManager.startAnimation()
    cleanupRef.current = cleanup

    return () => {
      webglManager.unregisterEffect('neural-flow')
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      sceneRef.current = null
      cameraRef.current = null
    }
  }, [])

  const initializeNeuralNetwork = () => {
    if (!sceneRef.current) return

    // Clear existing
    nodeMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
    connectionLinesRef.current.forEach(line => sceneRef.current?.remove(line))

    nodeMeshesRef.current = []
    connectionLinesRef.current = []
    nodesRef.current = []
    connectionsRef.current = []

    // Network: input(8) -> hidden1(6) -> hidden2(4) -> output(2)
    const layers = [8, 6, 4, 2]
    const layerSpacing = 8
    let nodeId = 0

    // Create nodes
    layers.forEach((nodeCount, layerIndex) => {
      const layerX = (layerIndex - (layers.length - 1) / 2) * layerSpacing

      for (let i = 0; i < nodeCount; i++) {
        const nodeY = (i - (nodeCount - 1) / 2) * 2
        const nodeZ = (Math.random() - 0.5) * 2

        const node: Node = {
          position: new THREE.Vector3(layerX, nodeY, nodeZ),
          connections: [],
          activation: Math.random(),
          layer: layerIndex,
          size: 0.3 + Math.random() * 0.2,
          pulseTime: 0
        }

        nodesRef.current.push(node)

        // Visual node
        const geometry = new THREE.SphereGeometry(node.size, 16, 16)
        const material = new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.6 + layerIndex * 0.1, 0.8, 0.5),
          transparent: true,
          opacity: 0.8
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(node.position)
        sceneRef.current?.add(mesh)
        nodeMeshesRef.current.push(mesh)

        nodeId++
      }
    })

    // Create connections
    let currentNodeIndex = 0
    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex++) {
      const currentLayerSize = layers[layerIndex]
      const nextLayerSize = layers[layerIndex + 1]
      const nextLayerStart = currentNodeIndex + currentLayerSize

      for (let i = 0; i < currentLayerSize; i++) {
        for (let j = 0; j < nextLayerSize; j++) {
          const fromIndex = currentNodeIndex + i
          const toIndex = nextLayerStart + j

          if (Math.random() > 0.3) {
            const connection: Connection = {
              from: fromIndex,
              to: toIndex,
              weight: (Math.random() - 0.5) * 2,
              activity: 0,
              lastPulse: 0
            }

            connectionsRef.current.push(connection)
            nodesRef.current[fromIndex].connections.push(toIndex)

            // Visual connection
            const points = [
              nodesRef.current[fromIndex].position,
              nodesRef.current[toIndex].position
            ]
            const geometry = new THREE.BufferGeometry().setFromPoints(points)
            const material = new THREE.LineBasicMaterial({
              color: 0x444488,
              transparent: true,
              opacity: 0.3
            })
            const line = new THREE.Line(geometry, material)
            sceneRef.current?.add(line)
            connectionLinesRef.current.push(line)
          }
        }
      }
      currentNodeIndex += currentLayerSize
    }
  }

  const updateNeuralNetwork = () => {
    const time = Date.now() * 0.001
    const intensity = effectParams.intensity
    const speed = effectParams.speed

    // Update activations
    nodesRef.current.forEach((node, index) => {
      if (node.layer === 0) {
        // Input layer
        node.activation = 0.5 + 0.5 * Math.sin(time * speed + index * 0.5)
      } else {
        // Propagate from previous layer
        let sum = 0
        let count = 0
        connectionsRef.current.forEach(conn => {
          if (conn.to === index) {
            sum += nodesRef.current[conn.from].activation * conn.weight
            count++
          }
        })
        if (count > 0) {
          node.activation = 1 / (1 + Math.exp(-sum / count))
        }
      }

      // Update visual
      const mesh = nodeMeshesRef.current[index]
      if (mesh && mesh.material instanceof THREE.MeshBasicMaterial) {
        const hue = 0.6 + node.layer * 0.1
        const lightness = 0.3 + node.activation * 0.7
        mesh.material.color.setHSL(hue, 0.8 * intensity, lightness)
        mesh.material.opacity = 0.5 + node.activation * 0.5
        mesh.scale.setScalar(1 + node.activation * 0.5)
      }
    })
  }

  const updateConnections = () => {
    connectionsRef.current.forEach((connection, index) => {
      const fromNode = nodesRef.current[connection.from]
      connection.activity = fromNode.activation * Math.abs(connection.weight) * 0.5

      const line = connectionLinesRef.current[index]
      if (line && line.material instanceof THREE.LineBasicMaterial) {
        const activity = connection.activity
        const opacity = 0.1 + activity * 0.6
        const hue = connection.weight > 0 ? 0.3 : 0.0
        line.material.color.setHSL(hue, 0.8, 0.5)
        line.material.opacity = opacity
      }
    })
  }

  // WebGL利用可能性チェック
  if (!isWebGLAvailable()) {
    return <div className="w-full h-full bg-black flex items-center justify-center text-white">
      <div className="text-center">
        <div className="text-6xl mb-4">⚠️</div>
        <div className="text-xl">WebGL not available</div>
        <div className="text-sm text-white/60 mt-2">Please enable WebGL in your browser</div>
      </div>
    </div>;
  }

  return <canvas
    ref={canvasRef}
    className="screensaver-canvas"
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 1,
    }}
  />
}
