'use client'

import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'

interface FractalNode {
  position: THREE.Vector3
  scale: number
  iteration: number
  generation: number
  children: FractalNode[]
  mesh?: THREE.Mesh
  color: THREE.Color
  complexity: number
}

interface FractalPattern {
  name: string
  generator: (pos: THREE.Vector3, iter: number) => THREE.Vector3[]
  color: THREE.Color
  maxIterations: number
}

interface MandelbrotPoint {
  c: THREE.Vector2
  iterations: number
  escaped: boolean
  color: THREE.Color
}

export default function FractalUniverse() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationRef = useRef<number | null>(null)
  const fractalTreeRef = useRef<FractalNode | null>(null)
  const fractalMeshesRef = useRef<THREE.Group[]>([])
  const mandelbrotPointsRef = useRef<MandelbrotPoint[]>([])
  const juliaSetRef = useRef<THREE.Points | null>(null)
  const zoomLevelRef = useRef<number>(1)
  const fractalTimeRef = useRef<number>(0)

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup with fractal-appropriate environment
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000011)
    scene.fog = new THREE.Fog(0x000011, 100, 500)
    sceneRef.current = scene

    // Camera setup for fractal exploration
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.01,
      1000
    )
    camera.position.set(0, 50, 100)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.2
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Setup fractal lighting
    setupFractalLighting()

    // Generate fractal universe
    generateFractalStructures()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateFractalEvolution()
      updateMandelbrotZoom()
      updateJuliaSet()
      updateCameraMovement()

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: fractalMeshesRef.current.length + mandelbrotPointsRef.current.length
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

  const setupFractalLighting = () => {
    if (!sceneRef.current) return

    // Ambient light for fractal depth
    const ambientLight = new THREE.AmbientLight(0x302060, 0.4)
    sceneRef.current.add(ambientLight)

    // Directional light for fractal structure definition
    const directionalLight = new THREE.DirectionalLight(0x8866ff, 1.0)
    directionalLight.position.set(50, 100, 50)
    directionalLight.castShadow = true
    sceneRef.current.add(directionalLight)

    // Point lights for fractal illumination
    const pointLight1 = new THREE.PointLight(0xff3366, 2, 200)
    pointLight1.position.set(30, 30, 30)
    sceneRef.current.add(pointLight1)

    const pointLight2 = new THREE.PointLight(0x3366ff, 2, 200)
    pointLight2.position.set(-30, 30, -30)
    sceneRef.current.add(pointLight2)

    const pointLight3 = new THREE.PointLight(0x66ff33, 1.5, 150)
    pointLight3.position.set(0, -30, 0)
    sceneRef.current.add(pointLight3)
  }

  const generateFractalStructures = () => {
    if (!sceneRef.current) return

    // Clear existing fractals
    fractalMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
    fractalMeshesRef.current = []
    mandelbrotPointsRef.current = []

    // Generate 3D fractal tree
    generateFractalTree()

    // Generate Mandelbrot set visualization
    generateMandelbrotSet()

    // Generate Julia set
    generateJuliaSet()

    // Generate Sierpiński tetrahedron
    generateSierpinskiTetrahedron()
  }

  const generateFractalTree = () => {
    if (!sceneRef.current) return

    const maxDepth = 6
    const branches = 4

    const createFractalNode = (
      position: THREE.Vector3,
      scale: number,
      iteration: number,
      generation: number
    ): FractalNode => {
      const node: FractalNode = {
        position: position.clone(),
        scale,
        iteration,
        generation,
        children: [],
        color: new THREE.Color().setHSL(
          (generation * 0.15 + iteration * 0.05) % 1,
          0.8,
          0.5 + Math.sin(iteration) * 0.3
        ),
        complexity: Math.pow(2, generation)
      }

      if (generation < maxDepth) {
        const angleStep = (Math.PI * 2) / branches
        const branchLength = scale * 0.7
        const heightOffset = scale * 0.5

        for (let i = 0; i < branches; i++) {
          const angle = i * angleStep + generation * 0.2
          const branchPos = new THREE.Vector3(
            position.x + Math.cos(angle) * branchLength,
            position.y + heightOffset,
            position.z + Math.sin(angle) * branchLength
          )

          const childNode = createFractalNode(
            branchPos,
            scale * 0.6,
            iteration + 1,
            generation + 1
          )
          node.children.push(childNode)
        }
      }

      return node
    }

    fractalTreeRef.current = createFractalNode(
      new THREE.Vector3(0, -30, 0),
      20,
      0,
      0
    )

    visualizeFractalTree(fractalTreeRef.current)
  }

  const visualizeFractalTree = (node: FractalNode) => {
    if (!sceneRef.current) return

    // Create geometric representation
    const geometry = new THREE.IcosahedronGeometry(node.scale * 0.3, 2)
    const material = new THREE.MeshPhongMaterial({
      color: node.color,
      transparent: true,
      opacity: 0.7 - node.generation * 0.1,
      emissive: node.color,
      emissiveIntensity: 0.2,
      wireframe: node.generation > 3
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(node.position)
    mesh.castShadow = true
    mesh.receiveShadow = true

    const group = new THREE.Group()
    group.add(mesh)

    // Add connections to children
    node.children.forEach(child => {
      const connectionGeometry = new THREE.CylinderGeometry(
        0.1 * node.scale / 20,
        0.1 * node.scale / 20,
        node.position.distanceTo(child.position),
        8
      )
      const connectionMaterial = new THREE.MeshPhongMaterial({
        color: node.color,
        transparent: true,
        opacity: 0.3
      })
      const connection = new THREE.Mesh(connectionGeometry, connectionMaterial)

      connection.position.copy(node.position.clone().add(child.position).multiplyScalar(0.5))
      connection.lookAt(child.position)
      connection.rotateX(Math.PI / 2)

      group.add(connection)
    })

    sceneRef.current.add(group)
    fractalMeshesRef.current.push(group)
    node.mesh = mesh

    // Recursively visualize children
    node.children.forEach(child => visualizeFractalTree(child))
  }

  const generateMandelbrotSet = () => {
    const resolution = 100
    const zoom = zoomLevelRef.current
    const centerX = -0.5
    const centerY = 0
    const width = 3 / zoom
    const height = 3 / zoom
    const maxIterations = 100

    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        const c = new THREE.Vector2(
          centerX + (x / resolution - 0.5) * width,
          centerY + (y / resolution - 0.5) * height
        )

        const iterations = calculateMandelbrotIterations(c, maxIterations)
        const escaped = iterations < maxIterations

        const point: MandelbrotPoint = {
          c,
          iterations,
          escaped,
          color: getMandelbrotColor(iterations, maxIterations)
        }

        mandelbrotPointsRef.current.push(point)
      }
    }

    visualizeMandelbrotSet()
  }

  const calculateMandelbrotIterations = (c: THREE.Vector2, maxIterations: number): number => {
    let z = new THREE.Vector2(0, 0)
    let iterations = 0

    while (z.lengthSq() < 4 && iterations < maxIterations) {
      const temp = z.x * z.x - z.y * z.y + c.x
      z.y = 2 * z.x * z.y + c.y
      z.x = temp
      iterations++
    }

    return iterations
  }

  const getMandelbrotColor = (iterations: number, maxIterations: number): THREE.Color => {
    if (iterations === maxIterations) {
      return new THREE.Color(0x000000) // Inside set - black
    }

    const t = iterations / maxIterations
    const hue = (t * 360 + 200) % 360
    return new THREE.Color().setHSL(hue / 360, 0.8, 0.5)
  }

  const visualizeMandelbrotSet = () => {
    if (!sceneRef.current) return

    const positions = new Float32Array(mandelbrotPointsRef.current.length * 3)
    const colors = new Float32Array(mandelbrotPointsRef.current.length * 3)

    mandelbrotPointsRef.current.forEach((point, index) => {
      positions[index * 3] = point.c.x * 50
      positions[index * 3 + 1] = point.c.y * 50
      positions[index * 3 + 2] = -50

      colors[index * 3] = point.color.r
      colors[index * 3 + 1] = point.color.g
      colors[index * 3 + 2] = point.color.b
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    })

    const mandelbrotMesh = new THREE.Points(geometry, material)
    sceneRef.current.add(mandelbrotMesh)

    const group = new THREE.Group()
    group.add(mandelbrotMesh)
    fractalMeshesRef.current.push(group)
  }

  const generateJuliaSet = () => {
    if (!sceneRef.current) return

    const resolution = 80
    const juliaC = new THREE.Vector2(-0.8, 0.156)
    const positions: number[] = []
    const colors: number[] = []

    for (let x = 0; x < resolution; x++) {
      for (let y = 0; y < resolution; y++) {
        const z = new THREE.Vector2(
          (x / resolution - 0.5) * 3,
          (y / resolution - 0.5) * 3
        )

        const iterations = calculateJuliaIterations(z, juliaC, 50)
        const escaped = iterations < 50

        if (escaped) {
          positions.push(z.x * 30, z.y * 30, 50)

          const t = iterations / 50
          const color = new THREE.Color().setHSL((t * 0.3 + 0.6) % 1, 0.9, 0.6)
          colors.push(color.r, color.g, color.b)
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    const material = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    })

    const juliaPoints = new THREE.Points(geometry, material)
    sceneRef.current.add(juliaPoints)
    juliaSetRef.current = juliaPoints

    const group = new THREE.Group()
    group.add(juliaPoints)
    fractalMeshesRef.current.push(group)
  }

  const calculateJuliaIterations = (z: THREE.Vector2, c: THREE.Vector2, maxIterations: number): number => {
    let iterations = 0

    while (z.lengthSq() < 4 && iterations < maxIterations) {
      const temp = z.x * z.x - z.y * z.y + c.x
      z.y = 2 * z.x * z.y + c.y
      z.x = temp
      iterations++
    }

    return iterations
  }

  const generateSierpinskiTetrahedron = () => {
    if (!sceneRef.current) return

    const vertices = [
      new THREE.Vector3(0, 50, 0),      // Top
      new THREE.Vector3(-30, -20, -17), // Bottom left
      new THREE.Vector3(30, -20, -17),  // Bottom right
      new THREE.Vector3(0, -20, 35)     // Bottom back
    ]

    const generateSierpinski = (v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, v4: THREE.Vector3, depth: number) => {
      if (depth === 0) {
        // Create tetrahedron
        const geometry = new THREE.TetrahedronGeometry(3, 0)
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color().setHSL(depth * 0.1, 0.7, 0.5),
          transparent: true,
          opacity: 0.6,
          wireframe: true
        })

        const center = new THREE.Vector3()
          .add(v1).add(v2).add(v3).add(v4)
          .multiplyScalar(0.25)

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.copy(center)

        const group = new THREE.Group()
        group.add(mesh)
        sceneRef.current?.add(group)
        fractalMeshesRef.current.push(group)
        return
      }

      // Calculate midpoints
      const m12 = v1.clone().add(v2).multiplyScalar(0.5)
      const m13 = v1.clone().add(v3).multiplyScalar(0.5)
      const m14 = v1.clone().add(v4).multiplyScalar(0.5)
      const m23 = v2.clone().add(v3).multiplyScalar(0.5)
      const m24 = v2.clone().add(v4).multiplyScalar(0.5)
      const m34 = v3.clone().add(v4).multiplyScalar(0.5)

      // Recursively generate smaller tetrahedra
      generateSierpinski(v1, m12, m13, m14, depth - 1)
      generateSierpinski(v2, m12, m23, m24, depth - 1)
      generateSierpinski(v3, m13, m23, m34, depth - 1)
      generateSierpinski(v4, m14, m24, m34, depth - 1)
    }

    generateSierpinski(vertices[0], vertices[1], vertices[2], vertices[3], 3)
  }

  const updateFractalEvolution = () => {
    const time = Date.now() * 0.001
    const speed = effectParams.speed
    const intensity = effectParams.intensity

    fractalTimeRef.current += speed * 0.01

    // Update fractal tree animation
    if (fractalTreeRef.current) {
      updateFractalNode(fractalTreeRef.current, time, speed, intensity)
    }

    // Animate fractal meshes
    fractalMeshesRef.current.forEach((group, index) => {
      group.rotation.x = time * 0.1 * speed + index * 0.1
      group.rotation.y = time * 0.2 * speed + index * 0.05
      group.rotation.z = time * 0.15 * speed

      group.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshPhongMaterial) {
          child.material.emissiveIntensity = 0.1 + Math.sin(time * 2 + index) * 0.1 * intensity
        } else if (child instanceof THREE.Points && child.material instanceof THREE.PointsMaterial) {
          child.material.opacity = 0.5 + Math.sin(time * 3 + index) * 0.2 * intensity
        }
      })
    })
  }

  const updateFractalNode = (node: FractalNode, time: number, speed: number, intensity: number) => {
    if (node.mesh) {
      // Pulsing based on fractal generation
      const pulse = Math.sin(time * 2 + node.generation * 0.5) * 0.5 + 0.5
      node.mesh.scale.setScalar(1 + pulse * 0.3 * intensity)

      // Color shifting
      const hue = (time * speed * 0.1 + node.generation * 0.2) % 1
      if (node.mesh.material instanceof THREE.MeshPhongMaterial) {
        node.mesh.material.color.setHSL(hue, 0.8, 0.5)
        node.mesh.material.emissive.setHSL(hue, 0.8, 0.2 * intensity)
      }
    }

    // Recursively update children
    node.children.forEach(child => updateFractalNode(child, time, speed, intensity))
  }

  const updateMandelbrotZoom = () => {
    const speed = effectParams.speed

    // Gradual zoom into interesting areas of Mandelbrot set
    zoomLevelRef.current *= 1 + speed * 0.001

    if (zoomLevelRef.current > 1000) {
      zoomLevelRef.current = 1 // Reset zoom
    }
  }

  const updateJuliaSet = () => {
    if (!juliaSetRef.current) return

    const time = Date.now() * 0.001
    const speed = effectParams.speed

    // Animate Julia set rotation and transformation
    juliaSetRef.current.rotation.x = time * 0.2 * speed
    juliaSetRef.current.rotation.y = time * 0.3 * speed
    juliaSetRef.current.rotation.z = time * 0.1 * speed

    // Update Julia set parameter for animation
    const c = new THREE.Vector2(
      -0.8 + Math.sin(time * speed) * 0.2,
      0.156 + Math.cos(time * speed * 0.7) * 0.1
    )
  }

  const updateCameraMovement = () => {
    if (!cameraRef.current) return

    const time = Date.now() * 0.001
    const speed = effectParams.speed

    // Camera orbiting through fractal space
    const radius = 80 + Math.sin(time * 0.3) * 20
    cameraRef.current.position.x = Math.cos(time * 0.1 * speed) * radius
    cameraRef.current.position.z = Math.sin(time * 0.1 * speed) * radius
    cameraRef.current.position.y = 20 + Math.sin(time * 0.2 * speed) * 30

    cameraRef.current.lookAt(0, 0, 0)
  }

  return <div ref={mountRef} className="w-full h-full" />
}
