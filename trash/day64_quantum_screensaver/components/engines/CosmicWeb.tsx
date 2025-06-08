'use client'

import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'

interface Galaxy {
  position: THREE.Vector3
  velocity: THREE.Vector3
  mass: number
  brightness: number
  color: THREE.Color
  connections: number[]
}

interface Filament {
  galaxies: number[]
  strength: number
  flow: number
  particles: THREE.Vector3[]
}

interface DarkMatterHalo {
  position: THREE.Vector3
  radius: number
  density: number
  influence: number
}

export default function CosmicWeb() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationRef = useRef<number | null>(null)
  const galaxiesRef = useRef<Galaxy[]>([])
  const filamentsRef = useRef<Filament[]>([])
  const darkMatterRef = useRef<DarkMatterHalo[]>([])
  const galaxyMeshesRef = useRef<THREE.Points[]>([])
  const filamentMeshesRef = useRef<(THREE.Line | THREE.Points)[]>([])
  const darkMatterMeshesRef = useRef<THREE.Points[]>([])

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000008)
    scene.fog = new THREE.Fog(0x000008, 200, 1000)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      2000
    )
    camera.position.set(0, 100, 300)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Generate cosmic web structure
    generateCosmicWeb()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateCosmicEvolution()
      updateFilamentFlow()
      updateDarkMatterInfluence()

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        // Camera movement through cosmic web
        const time = Date.now() * 0.0002
        cameraRef.current.position.x = Math.sin(time) * 400
        cameraRef.current.position.y = 100 + Math.cos(time * 0.7) * 100
        cameraRef.current.position.z = 300 + Math.sin(time * 0.3) * 200
        cameraRef.current.lookAt(0, 0, 0)

        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: galaxiesRef.current.length + darkMatterRef.current.length
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

  const generateCosmicWeb = () => {
    if (!sceneRef.current) return

    // Clear existing
    galaxyMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
    filamentMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
    darkMatterMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))

    galaxyMeshesRef.current = []
    filamentMeshesRef.current = []
    darkMatterMeshesRef.current = []
    galaxiesRef.current = []
    filamentsRef.current = []
    darkMatterRef.current = []

    // Generate galaxies using cosmic web distribution
    generateGalaxies()
    generateDarkMatterHalos()
    generateFilaments()

    createGalaxyVisualization()
    createFilamentVisualization()
    createDarkMatterVisualization()
  }

  const generateGalaxies = () => {
    const galaxyCount = Math.floor(effectParams.particleCount / 10)

    for (let i = 0; i < galaxyCount; i++) {
      // Use cosmic web-like distribution (filamentary structure)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      const r = 50 + Math.random() * 300

      // Add clustering along filaments
      const filamentBias = Math.sin(theta * 3) * Math.cos(phi * 2)
      const clusterRadius = r * (1 + filamentBias * 0.3)

      const galaxy: Galaxy = {
        position: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * clusterRadius,
          Math.cos(phi) * clusterRadius,
          Math.sin(phi) * Math.sin(theta) * clusterRadius
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        ),
        mass: 1 + Math.random() * 5,
        brightness: 0.5 + Math.random() * 0.5,
        color: getGalaxyColor(Math.random()),
        connections: []
      }

      galaxiesRef.current.push(galaxy)
    }
  }

  const generateDarkMatterHalos = () => {
    const haloCount = Math.floor(galaxiesRef.current.length / 3)

    for (let i = 0; i < haloCount; i++) {
      const halo: DarkMatterHalo = {
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 800,
          (Math.random() - 0.5) * 400,
          (Math.random() - 0.5) * 800
        ),
        radius: 20 + Math.random() * 80,
        density: Math.random(),
        influence: 1 + Math.random() * 3
      }

      darkMatterRef.current.push(halo)
    }
  }

  const generateFilaments = () => {
    // Connect nearby galaxies to form filaments
    galaxiesRef.current.forEach((galaxy, index) => {
      const nearbyGalaxies: number[] = []

      galaxiesRef.current.forEach((otherGalaxy, otherIndex) => {
        if (index !== otherIndex) {
          const distance = galaxy.position.distanceTo(otherGalaxy.position)
          if (distance < 150 && nearbyGalaxies.length < 3) {
            nearbyGalaxies.push(otherIndex)
            galaxy.connections.push(otherIndex)
          }
        }
      })

      if (nearbyGalaxies.length > 0) {
        const filament: Filament = {
          galaxies: [index, ...nearbyGalaxies],
          strength: Math.random(),
          flow: Math.random() * 2 - 1,
          particles: []
        }

        // Generate particles along filament
        for (let i = 0; i < 20; i++) {
          const t = i / 19
          const startPos = galaxy.position
          const endPos = galaxiesRef.current[nearbyGalaxies[0]].position
          const particlePos = new THREE.Vector3().lerpVectors(startPos, endPos, t)

          // Add some randomness to create realistic filament structure
          particlePos.add(new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
          ))

          filament.particles.push(particlePos)
        }

        filamentsRef.current.push(filament)
      }
    })
  }

  const getGalaxyColor = (type: number): THREE.Color => {
    if (type < 0.3) {
      return new THREE.Color(0x4488ff) // Blue - young galaxies
    } else if (type < 0.7) {
      return new THREE.Color(0xffaa44) // Orange - mature galaxies
    } else {
      return new THREE.Color(0xff4444) // Red - old galaxies
    }
  }

  const createGalaxyVisualization = () => {
    if (!sceneRef.current) return

    const positions = new Float32Array(galaxiesRef.current.length * 3)
    const colors = new Float32Array(galaxiesRef.current.length * 3)
    const sizes = new Float32Array(galaxiesRef.current.length)

    galaxiesRef.current.forEach((galaxy, index) => {
      positions[index * 3] = galaxy.position.x
      positions[index * 3 + 1] = galaxy.position.y
      positions[index * 3 + 2] = galaxy.position.z

      colors[index * 3] = galaxy.color.r
      colors[index * 3 + 1] = galaxy.color.g
      colors[index * 3 + 2] = galaxy.color.b

      sizes[index] = galaxy.mass * 2
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.PointsMaterial({
      size: 3,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    })

    const galaxies = new THREE.Points(geometry, material)
    sceneRef.current.add(galaxies)
    galaxyMeshesRef.current.push(galaxies)
  }

  const createFilamentVisualization = () => {
    if (!sceneRef.current) return

    filamentsRef.current.forEach(filament => {
      const positions = new Float32Array(filament.particles.length * 3)
      const colors = new Float32Array(filament.particles.length * 3)

      filament.particles.forEach((particle, index) => {
        positions[index * 3] = particle.x
        positions[index * 3 + 1] = particle.y
        positions[index * 3 + 2] = particle.z

        // Filament color based on strength
        const intensity = filament.strength
        colors[index * 3] = 0.2 + intensity * 0.3     // R
        colors[index * 3 + 1] = 0.1 + intensity * 0.4 // G
        colors[index * 3 + 2] = 0.4 + intensity * 0.6 // B
      })

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      const material = new THREE.PointsMaterial({
        size: 1,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      })

      const filamentMesh = new THREE.Points(geometry, material)
      sceneRef.current?.add(filamentMesh)
      filamentMeshesRef.current.push(filamentMesh)
    })
  }

  const createDarkMatterVisualization = () => {
    if (!sceneRef.current) return

    darkMatterRef.current.forEach(halo => {
      const particleCount = Math.floor(halo.radius * 2)
      const positions = new Float32Array(particleCount * 3)
      const colors = new Float32Array(particleCount * 3)

      for (let i = 0; i < particleCount; i++) {
        // Spherical distribution around halo center
        const theta = Math.random() * Math.PI * 2
        const phi = Math.random() * Math.PI
        const r = Math.random() * halo.radius

        positions[i * 3] = halo.position.x + Math.sin(phi) * Math.cos(theta) * r
        positions[i * 3 + 1] = halo.position.y + Math.cos(phi) * r
        positions[i * 3 + 2] = halo.position.z + Math.sin(phi) * Math.sin(theta) * r

        // Dark matter visualization (purple/violet)
        colors[i * 3] = 0.3 + halo.density * 0.2     // R
        colors[i * 3 + 1] = 0.1 + halo.density * 0.1 // G
        colors[i * 3 + 2] = 0.5 + halo.density * 0.5 // B
      }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      const material = new THREE.PointsMaterial({
        size: 0.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
      })

      const darkMatterMesh = new THREE.Points(geometry, material)
      sceneRef.current?.add(darkMatterMesh)
      darkMatterMeshesRef.current.push(darkMatterMesh)
    })
  }

  const updateCosmicEvolution = () => {
    const time = Date.now() * 0.001
    const speed = effectParams.speed
    const intensity = effectParams.intensity

    // Update galaxy positions (cosmic expansion + peculiar motion)
    galaxiesRef.current.forEach((galaxy, index) => {
      // Hubble expansion
      const expansionFactor = 1 + time * 0.00001 * speed
      galaxy.position.multiplyScalar(expansionFactor)

      // Peculiar velocity
      galaxy.position.add(galaxy.velocity.clone().multiplyScalar(speed))

      // Update visualization
      const galaxyMesh = galaxyMeshesRef.current[0]
      if (galaxyMesh) {
        const positions = galaxyMesh.geometry.attributes.position.array as Float32Array
        positions[index * 3] = galaxy.position.x
        positions[index * 3 + 1] = galaxy.position.y
        positions[index * 3 + 2] = galaxy.position.z
        galaxyMesh.geometry.attributes.position.needsUpdate = true
      }
    })

    // Update galaxy brightness (stellar evolution)
    galaxyMeshesRef.current.forEach(mesh => {
      if (mesh.material instanceof THREE.PointsMaterial) {
        mesh.material.opacity = 0.6 + Math.sin(time * 2) * 0.2 * intensity
      }
    })
  }

  const updateFilamentFlow = () => {
    const time = Date.now() * 0.001
    const speed = effectParams.speed

    filamentsRef.current.forEach((filament, filamentIndex) => {
      const mesh = filamentMeshesRef.current[filamentIndex]
      if (!mesh) return

      // Animate particle flow along filaments
      const positions = mesh.geometry.attributes.position.array as Float32Array
      const colors = mesh.geometry.attributes.color.array as Float32Array

      for (let i = 0; i < filament.particles.length; i++) {
        // Flow animation
        const flowOffset = (time * speed * filament.flow + i * 0.1) % (Math.PI * 2)
        const flowIntensity = Math.sin(flowOffset) * 0.5 + 0.5

        // Update color intensity based on flow
        colors[i * 3] = (0.2 + filament.strength * 0.3) * flowIntensity
        colors[i * 3 + 1] = (0.1 + filament.strength * 0.4) * flowIntensity
        colors[i * 3 + 2] = (0.4 + filament.strength * 0.6) * flowIntensity
      }

      mesh.geometry.attributes.color.needsUpdate = true
    })
  }

  const updateDarkMatterInfluence = () => {
    const time = Date.now() * 0.001
    const intensity = effectParams.intensity

    darkMatterMeshesRef.current.forEach((mesh, index) => {
      const halo = darkMatterRef.current[index]
      if (!halo) return

      // Pulsing effect based on dark matter influence
      const pulse = Math.sin(time * halo.influence) * 0.5 + 0.5

      if (mesh.material instanceof THREE.PointsMaterial) {
        mesh.material.opacity = (0.2 + pulse * 0.3) * intensity
        mesh.material.size = 0.5 + pulse * 0.5
      }

      // Rotation effect
      mesh.rotation.y = time * 0.1 * halo.influence
      mesh.rotation.x = time * 0.05 * halo.influence
    })
  }

  return <div ref={mountRef} className="w-full h-full" />
}
