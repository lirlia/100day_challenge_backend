'use client'

import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'
import { isWebGLAvailable } from '@/lib/webgl-detector'
import FallbackCanvas from './FallbackCanvas'

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
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationRef = useRef<number | null>(null)
  const nodesRef = useRef<Node[]>([])
  const connectionsRef = useRef<Connection[]>([])
  const nodeMeshesRef = useRef<THREE.Mesh[]>([])
  const connectionLinesRef = useRef<THREE.Line[]>([])

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000811)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 0, 20)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Create neural network
    initializeNeuralNetwork()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateNeuralNetwork()
      updateConnections()

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        const time = Date.now() * 0.0005
        cameraRef.current.position.x = Math.cos(time) * 25
        cameraRef.current.position.z = Math.sin(time) * 25
        cameraRef.current.lookAt(0, 0, 0)

        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: nodesRef.current.length
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [isPlaying, updatePerformance])

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
    return <FallbackCanvas />;
  }

  return <div ref={mountRef} className="w-full h-full" />
}
