'use client'

import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'

interface BasePair {
  position: THREE.Vector3
  rotation: number
  type: 'AT' | 'GC'
  color1: THREE.Color
  color2: THREE.Color
  energy: number
  bonded: boolean
}

interface Gene {
  startIndex: number
  endIndex: number
  expression: number
  function: string
  active: boolean
}

interface Chromosome {
  basePairs: BasePair[]
  genes: Gene[]
  length: number
  integrity: number
}

export default function DNAHelix() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationRef = useRef<number | null>(null)
  const chromosomeRef = useRef<Chromosome | null>(null)
  const basePairMeshesRef = useRef<THREE.Group[]>([])
  const backboneMeshesRef = useRef<THREE.Mesh[]>([])
  const replicationForkRef = useRef<number>(0)

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup with biological lighting
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a1a)
    scene.fog = new THREE.Fog(0x0a0a1a, 50, 200)
    sceneRef.current = scene

    // Camera setup for DNA viewing
    const camera = new THREE.PerspectiveCamera(
      45,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      500
    )
    camera.position.set(20, 10, 50)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Lighting setup
    setupLighting()

    // Generate DNA structure
    generateDNAChromosome()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateDNAStructure()
      updateGeneExpression()
      updateReplication()
      updateCameraRotation()

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: basePairMeshesRef.current.length
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

  const setupLighting = () => {
    if (!sceneRef.current) return

    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0x404080, 0.3)
    sceneRef.current.add(ambientLight)

    // Directional light for DNA structure definition
    const directionalLight = new THREE.DirectionalLight(0x6699ff, 0.8)
    directionalLight.position.set(30, 30, 30)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    sceneRef.current.add(directionalLight)

    // Point lights for gene activity visualization
    const pointLight1 = new THREE.PointLight(0xff6600, 1, 100)
    pointLight1.position.set(15, 0, 0)
    sceneRef.current.add(pointLight1)

    const pointLight2 = new THREE.PointLight(0x00ff66, 1, 100)
    pointLight2.position.set(-15, 0, 0)
    sceneRef.current.add(pointLight2)
  }

  const generateDNAChromosome = () => {
    if (!sceneRef.current) return

    // Clear existing
    basePairMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
    backboneMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
    basePairMeshesRef.current = []
    backboneMeshesRef.current = []

    const basePairCount = Math.floor(effectParams.particleCount / 2)
    const helixRadius = 8
    const helixHeight = basePairCount * 0.34 // 3.4 Angstroms per base pair
    const turnLength = 10.5 // base pairs per full turn

    const chromosome: Chromosome = {
      basePairs: [],
      genes: [],
      length: basePairCount,
      integrity: 1.0
    }

    // Generate base pairs
    for (let i = 0; i < basePairCount; i++) {
      const angle = (i / turnLength) * Math.PI * 2
      const y = (i / basePairCount) * helixHeight - helixHeight / 2

      // Determine base pair type (realistic distribution)
      const type: 'AT' | 'GC' = Math.random() < 0.6 ? 'AT' : 'GC'

      const basePair: BasePair = {
        position: new THREE.Vector3(0, y, 0),
        rotation: angle,
        type,
        color1: getBaseColor(type.charAt(0)),
        color2: getBaseColor(type.charAt(1)),
        energy: type === 'GC' ? 3 : 2, // GC bonds are stronger
        bonded: true
      }

      chromosome.basePairs.push(basePair)
    }

    // Generate genes (functional regions)
    generateGenes(chromosome)

    chromosomeRef.current = chromosome
    createDNAVisualization()
  }

  const generateGenes = (chromosome: Chromosome) => {
    const geneCount = Math.floor(chromosome.length / 100) // Average gene size
    const geneFunctions = [
      'Enzyme Production', 'Structural Protein', 'Regulatory',
      'Transport', 'Defense', 'Metabolism', 'Signaling'
    ]

    for (let i = 0; i < geneCount; i++) {
      const startIndex = Math.floor(Math.random() * (chromosome.length - 50))
      const geneLength = 50 + Math.floor(Math.random() * 200)

      const gene: Gene = {
        startIndex,
        endIndex: Math.min(startIndex + geneLength, chromosome.length - 1),
        expression: Math.random(),
        function: geneFunctions[Math.floor(Math.random() * geneFunctions.length)],
        active: Math.random() > 0.7
      }

      chromosome.genes.push(gene)
    }
  }

  const getBaseColor = (base: string): THREE.Color => {
    switch (base) {
      case 'A': return new THREE.Color(0xff4444) // Adenine - Red
      case 'T': return new THREE.Color(0x4444ff) // Thymine - Blue
      case 'G': return new THREE.Color(0x44ff44) // Guanine - Green
      case 'C': return new THREE.Color(0xffff44) // Cytosine - Yellow
      default: return new THREE.Color(0xffffff)
    }
  }

  const createDNAVisualization = () => {
    if (!sceneRef.current || !chromosomeRef.current) return

    const helixRadius = 8

    chromosomeRef.current.basePairs.forEach((basePair, index) => {
      // Create base pair group
      const group = new THREE.Group()

      // Calculate positions for double helix
      const angle = basePair.rotation
      const x1 = Math.cos(angle) * helixRadius
      const z1 = Math.sin(angle) * helixRadius
      const x2 = Math.cos(angle + Math.PI) * helixRadius
      const z2 = Math.sin(angle + Math.PI) * helixRadius

      // Create base meshes
      const baseGeometry = new THREE.SphereGeometry(0.8, 16, 16)

      const base1Material = new THREE.MeshPhongMaterial({
        color: basePair.color1,
        transparent: true,
        opacity: 0.8
      })
      const base1 = new THREE.Mesh(baseGeometry, base1Material)
      base1.position.set(x1, basePair.position.y, z1)
      base1.castShadow = true
      group.add(base1)

      const base2Material = new THREE.MeshPhongMaterial({
        color: basePair.color2,
        transparent: true,
        opacity: 0.8
      })
      const base2 = new THREE.Mesh(baseGeometry, base2Material)
      base2.position.set(x2, basePair.position.y, z2)
      base2.castShadow = true
      group.add(base2)

      // Create hydrogen bonds
      if (basePair.bonded) {
        const bondGeometry = new THREE.CylinderGeometry(0.1, 0.1, helixRadius * 2, 8)
        const bondMaterial = new THREE.MeshPhongMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.4
        })
        const bond = new THREE.Mesh(bondGeometry, bondMaterial)
        bond.position.set(0, basePair.position.y, 0)
        bond.rotation.z = Math.PI / 2
        bond.rotation.y = angle
        group.add(bond)
      }

      sceneRef.current?.add(group)
      basePairMeshesRef.current.push(group)
    })

    // Create DNA backbone
    createBackbone()
  }

  const createBackbone = () => {
    if (!sceneRef.current || !chromosomeRef.current) return

    const helixRadius = 8
    const points1: THREE.Vector3[] = []
    const points2: THREE.Vector3[] = []

    chromosomeRef.current.basePairs.forEach((basePair) => {
      const angle = basePair.rotation
      const x1 = Math.cos(angle) * helixRadius
      const z1 = Math.sin(angle) * helixRadius
      const x2 = Math.cos(angle + Math.PI) * helixRadius
      const z2 = Math.sin(angle + Math.PI) * helixRadius

      points1.push(new THREE.Vector3(x1, basePair.position.y, z1))
      points2.push(new THREE.Vector3(x2, basePair.position.y, z2))
    })

    // Create backbone curves
    const curve1 = new THREE.CatmullRomCurve3(points1)
    const curve2 = new THREE.CatmullRomCurve3(points2)

    const tubeGeometry1 = new THREE.TubeGeometry(curve1, points1.length * 2, 0.3, 8, false)
    const tubeGeometry2 = new THREE.TubeGeometry(curve2, points2.length * 2, 0.3, 8, false)

    const backboneMaterial = new THREE.MeshPhongMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.7
    })

    const backbone1 = new THREE.Mesh(tubeGeometry1, backboneMaterial)
    const backbone2 = new THREE.Mesh(tubeGeometry2, backboneMaterial)

    backbone1.castShadow = true
    backbone2.castShadow = true

    sceneRef.current.add(backbone1)
    sceneRef.current.add(backbone2)
    backboneMeshesRef.current.push(backbone1, backbone2)
  }

  const updateDNAStructure = () => {
    const time = Date.now() * 0.001
    const speed = effectParams.speed
    const intensity = effectParams.intensity

    // DNA breathing motion
    const breathingFactor = 1 + Math.sin(time * 2) * 0.05 * intensity

    basePairMeshesRef.current.forEach((group, index) => {
      // Gentle rotation of entire helix
      group.rotation.y = time * 0.1 * speed

      // Breathing motion
      group.scale.setScalar(breathingFactor)

      // Update base pair colors based on activity
      const basePair = chromosomeRef.current?.basePairs[index]
      if (basePair) {
        const activity = Math.sin(time * 3 + index * 0.1) * 0.5 + 0.5
        group.children.forEach((child, childIndex) => {
          if (child instanceof THREE.Mesh && childIndex < 2) {
            const material = child.material as THREE.MeshPhongMaterial
            material.emissive.setScalar(activity * intensity * 0.2)
          }
        })
      }
    })
  }

  const updateGeneExpression = () => {
    if (!chromosomeRef.current) return

    const time = Date.now() * 0.001
    const intensity = effectParams.intensity

    chromosomeRef.current.genes.forEach((gene) => {
      if (gene.active) {
        // Simulate gene expression waves
        const expressionWave = Math.sin(time * 2 + gene.startIndex * 0.01) * 0.5 + 0.5
        gene.expression = expressionWave * intensity

        // Update visual representation
        for (let i = gene.startIndex; i <= gene.endIndex && i < basePairMeshesRef.current.length; i++) {
          const group = basePairMeshesRef.current[i]
          if (group) {
            const glowIntensity = gene.expression * 0.5
            group.children.forEach((child) => {
              if (child instanceof THREE.Mesh) {
                const material = child.material as THREE.MeshPhongMaterial
                material.emissive.setRGB(glowIntensity, glowIntensity * 0.5, 0)
              }
            })
          }
        }
      }
    })
  }

  const updateReplication = () => {
    const time = Date.now() * 0.001
    const speed = effectParams.speed

    // Simulate replication fork movement
    replicationForkRef.current = (time * speed * 10) % (chromosomeRef.current?.length || 100)

    const forkPosition = Math.floor(replicationForkRef.current)

    // Update base pair bonding around replication fork
    basePairMeshesRef.current.forEach((group, index) => {
      const distanceFromFork = Math.abs(index - forkPosition)

      if (distanceFromFork < 5) {
        // Near replication fork - bases separate
        const separationFactor = (5 - distanceFromFork) / 5
        const bondChild = group.children[2] // Hydrogen bond

        if (bondChild instanceof THREE.Mesh) {
          const material = bondChild.material as THREE.MeshPhongMaterial
          material.opacity = 0.4 * (1 - separationFactor * 0.8)
        }

        // Add replication glow
        group.children.forEach((child, childIndex) => {
          if (child instanceof THREE.Mesh && childIndex < 2) {
            const material = child.material as THREE.MeshPhongMaterial
            material.emissive.setRGB(
              separationFactor * 0.3,
              separationFactor * 0.6,
              separationFactor * 0.9
            )
          }
        })
      }
    })
  }

  const updateCameraRotation = () => {
    if (!cameraRef.current) return

    const time = Date.now() * 0.001
    const speed = effectParams.speed

    // Orbiting camera for DNA observation
    const radius = 50
    cameraRef.current.position.x = Math.cos(time * 0.2 * speed) * radius
    cameraRef.current.position.z = Math.sin(time * 0.2 * speed) * radius
    cameraRef.current.position.y = 10 + Math.sin(time * 0.1 * speed) * 20
    cameraRef.current.lookAt(0, 0, 0)
  }

  return <div ref={mountRef} className="w-full h-full" />
}
