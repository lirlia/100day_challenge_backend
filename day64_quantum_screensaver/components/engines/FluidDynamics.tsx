'use client'

import { useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'

interface FluidParticle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  acceleration: THREE.Vector3
  density: number
  pressure: number
  mass: number
  color: THREE.Color
  viscosity: number
  temperature: number
  life: number
}

interface VorticityField {
  position: THREE.Vector3
  strength: THREE.Vector3
  radius: number
  age: number
}

interface FluidGrid {
  width: number
  height: number
  depth: number
  cellSize: number
  velocityField: THREE.Vector3[][][]
  densityField: number[][][]
  pressureField: number[][][]
  divergenceField: number[][][]
}

export default function FluidDynamics() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationRef = useRef<number | null>(null)

  const fluidParticlesRef = useRef<FluidParticle[]>([])
  const vorticityFieldsRef = useRef<VorticityField[]>([])
  const fluidGridRef = useRef<FluidGrid | null>(null)
  const particleMeshRef = useRef<THREE.Points | null>(null)
  const flowFieldMeshRef = useRef<THREE.Line[]>([])
  const densityVisualizationRef = useRef<THREE.Points | null>(null)

  const smoothingRadius = 2.0
  const restDensity = 1000
  const stiffness = 200
  const viscosityCoeff = 0.1
  const damping = 0.99

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup for fluid simulation
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x001122)
    scene.fog = new THREE.Fog(0x001122, 50, 200)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      500
    )
    camera.position.set(0, 40, 80)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Setup fluid lighting
    setupFluidLighting()

    // Initialize fluid simulation
    initializeFluidGrid()
    createFluidParticles()
    createFlowFieldVisualization()
    createDensityVisualization()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateFluidSimulation()
      updateVorticityConfinement()
      updateFlowFieldVisualization()
      updateDensityVisualization()
      updateFluidLighting()
      updateCameraFlow()

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: fluidParticlesRef.current.length
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

  const setupFluidLighting = () => {
    if (!sceneRef.current) return

    // Ambient light for fluid visibility
    const ambientLight = new THREE.AmbientLight(0x404080, 0.4)
    sceneRef.current.add(ambientLight)

    // Directional light for flow patterns
    const directionalLight = new THREE.DirectionalLight(0x6699ff, 1)
    directionalLight.position.set(40, 60, 40)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    sceneRef.current.add(directionalLight)

    // Point lights for fluid interaction
    const flowLight1 = new THREE.PointLight(0xff6633, 2, 100)
    flowLight1.position.set(-20, 30, 20)
    sceneRef.current.add(flowLight1)

    const flowLight2 = new THREE.PointLight(0x33ff66, 2, 100)
    flowLight2.position.set(20, 30, -20)
    sceneRef.current.add(flowLight2)
  }

  const initializeFluidGrid = () => {
    const width = 32
    const height = 24
    const depth = 32
    const cellSize = 2.0

    const velocityField: THREE.Vector3[][][] = []
    const densityField: number[][][] = []
    const pressureField: number[][][] = []
    const divergenceField: number[][][] = []

    for (let x = 0; x < width; x++) {
      velocityField[x] = []
      densityField[x] = []
      pressureField[x] = []
      divergenceField[x] = []

      for (let y = 0; y < height; y++) {
        velocityField[x][y] = []
        densityField[x][y] = []
        pressureField[x][y] = []
        divergenceField[x][y] = []

        for (let z = 0; z < depth; z++) {
          velocityField[x][y][z] = new THREE.Vector3(0, 0, 0)
          densityField[x][y][z] = 0
          pressureField[x][y][z] = 0
          divergenceField[x][y][z] = 0
        }
      }
    }

    fluidGridRef.current = {
      width,
      height,
      depth,
      cellSize,
      velocityField,
      densityField,
      pressureField,
      divergenceField
    }
  }

  const createFluidParticles = () => {
    if (!sceneRef.current) return

    const particleCount = Math.floor(effectParams.particleCount * 0.5)
    fluidParticlesRef.current = []

    // Create particles in a confined space
    for (let i = 0; i < particleCount; i++) {
      // Initialize particles in a box formation
      const x = -20 + (i % 10) * 4
      const y = -10 + Math.floor(i / 100) * 4
      const z = -20 + Math.floor((i % 100) / 10) * 4

      const particle: FluidParticle = {
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 2,
          (Math.random() - 0.5) * 2
        ),
        acceleration: new THREE.Vector3(0, 0, 0),
        density: restDensity,
        pressure: 0,
        mass: 1.0,
        color: new THREE.Color().setHSL(0.6, 0.8, 0.6),
        viscosity: viscosityCoeff,
        temperature: 20 + Math.random() * 10,
        life: 1.0
      }

      fluidParticlesRef.current.push(particle)
    }

    // Create particle visualization
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)

    fluidParticlesRef.current.forEach((particle, index) => {
      positions[index * 3] = particle.position.x
      positions[index * 3 + 1] = particle.position.y
      positions[index * 3 + 2] = particle.position.z

      colors[index * 3] = particle.color.r
      colors[index * 3 + 1] = particle.color.g
      colors[index * 3 + 2] = particle.color.b

      sizes[index] = 2
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    })

    const particles = new THREE.Points(geometry, material)
    sceneRef.current.add(particles)
    particleMeshRef.current = particles
  }

  const createFlowFieldVisualization = () => {
    if (!sceneRef.current || !fluidGridRef.current) return

    flowFieldMeshRef.current = []
    const grid = fluidGridRef.current

    // Create flow field arrows
    for (let x = 0; x < grid.width; x += 4) {
      for (let y = 0; y < grid.height; y += 4) {
        for (let z = 0; z < grid.depth; z += 4) {
          const worldX = (x - grid.width / 2) * grid.cellSize
          const worldY = (y - grid.height / 2) * grid.cellSize
          const worldZ = (z - grid.depth / 2) * grid.cellSize

          const points = [
            new THREE.Vector3(worldX, worldY, worldZ),
            new THREE.Vector3(worldX + 2, worldY, worldZ)
          ]

          const geometry = new THREE.BufferGeometry().setFromPoints(points)
          const material = new THREE.LineBasicMaterial({
            color: 0x66aaff,
            transparent: true,
            opacity: 0.3
          })

          const line = new THREE.Line(geometry, material)
          sceneRef.current.add(line)
          flowFieldMeshRef.current.push(line)
        }
      }
    }
  }

  const createDensityVisualization = () => {
    if (!sceneRef.current || !fluidGridRef.current) return

    const grid = fluidGridRef.current
    const densityPoints = []
    const densityColors = []

    for (let x = 0; x < grid.width; x += 2) {
      for (let y = 0; y < grid.height; y += 2) {
        for (let z = 0; z < grid.depth; z += 2) {
          const worldX = (x - grid.width / 2) * grid.cellSize
          const worldY = (y - grid.height / 2) * grid.cellSize
          const worldZ = (z - grid.depth / 2) * grid.cellSize

          densityPoints.push(worldX, worldY, worldZ)
          densityColors.push(0.2, 0.4, 0.8)
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(densityPoints, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(densityColors, 3))

    const material = new THREE.PointsMaterial({
      size: 3,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    })

    const densityMesh = new THREE.Points(geometry, material)
    sceneRef.current.add(densityMesh)
    densityVisualizationRef.current = densityMesh
  }

  const updateFluidSimulation = () => {
    const deltaTime = 1 / 60 // Fixed timestep
    const speed = effectParams.speed
    const intensity = effectParams.intensity

    // Step 1: Calculate densities and pressures
    calculateDensityAndPressure()

    // Step 2: Calculate forces
    calculateForces()

    // Step 3: Integrate positions
    integrateParticles(deltaTime * speed)

    // Step 4: Handle boundaries
    enforceParticleBoundaries()

    // Step 5: Update fluid grid
    updateFluidGrid()

    // Step 6: Update particle visualization
    updateParticleVisualization()
  }

  const calculateDensityAndPressure = () => {
    fluidParticlesRef.current.forEach(particle => {
      let density = 0

      fluidParticlesRef.current.forEach(neighbor => {
        const distance = particle.position.distanceTo(neighbor.position)
        if (distance < smoothingRadius) {
          const kernelValue = smoothingKernel(distance, smoothingRadius)
          density += neighbor.mass * kernelValue
        }
      })

      particle.density = Math.max(density, restDensity)
      particle.pressure = stiffness * (particle.density - restDensity)
    })
  }

  const calculateForces = () => {
    fluidParticlesRef.current.forEach(particle => {
      let pressureForce = new THREE.Vector3(0, 0, 0)
      let viscosityForce = new THREE.Vector3(0, 0, 0)

      fluidParticlesRef.current.forEach(neighbor => {
        if (particle === neighbor) return

        const distance = particle.position.distanceTo(neighbor.position)
        if (distance < smoothingRadius && distance > 0) {
          const direction = particle.position.clone().sub(neighbor.position).normalize()

          // Pressure force
          const pressureKernel = smoothingKernelGradient(distance, smoothingRadius)
          const pressureMagnitude = (particle.pressure + neighbor.pressure) / (2 * neighbor.density)
          pressureForce.add(direction.clone().multiplyScalar(
            -neighbor.mass * pressureMagnitude * pressureKernel
          ))

          // Viscosity force
          const viscosityKernel = smoothingKernelLaplacian(distance, smoothingRadius)
          const velocityDifference = neighbor.velocity.clone().sub(particle.velocity)
          viscosityForce.add(velocityDifference.multiplyScalar(
            particle.viscosity * neighbor.mass * viscosityKernel / neighbor.density
          ))
        }
      })

      // External forces (gravity)
      const gravity = new THREE.Vector3(0, -9.8, 0)

      // Combine all forces
      particle.acceleration = pressureForce
        .add(viscosityForce)
        .add(gravity)
        .divideScalar(particle.density)

      // Add external forces based on parameters
      const time = Date.now() * 0.001
      const externalForce = new THREE.Vector3(
        Math.sin(time + particle.position.x * 0.1) * effectParams.intensity * 5,
        0,
        Math.cos(time + particle.position.z * 0.1) * effectParams.intensity * 5
      )
      particle.acceleration.add(externalForce)
    })
  }

  const integrateParticles = (deltaTime: number) => {
    fluidParticlesRef.current.forEach(particle => {
      // Velocity integration
      particle.velocity.add(particle.acceleration.clone().multiplyScalar(deltaTime))
      particle.velocity.multiplyScalar(damping)

      // Position integration
      particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime))

      // Update particle temperature based on velocity (kinetic energy)
      const kineticEnergy = particle.velocity.lengthSq() * 0.5 * particle.mass
      particle.temperature = 20 + kineticEnergy * 10

      // Update color based on temperature and velocity
      const velocityMagnitude = particle.velocity.length()
      const hue = Math.max(0, 0.7 - particle.temperature * 0.01)
      const saturation = 0.8
      const lightness = 0.3 + Math.min(0.5, velocityMagnitude * 0.1)
      particle.color.setHSL(hue, saturation, lightness)
    })
  }

  const enforceParticleBoundaries = () => {
    const bounds = 30

    fluidParticlesRef.current.forEach(particle => {
      // X boundaries
      if (particle.position.x < -bounds) {
        particle.position.x = -bounds
        particle.velocity.x = Math.abs(particle.velocity.x) * 0.5
      } else if (particle.position.x > bounds) {
        particle.position.x = bounds
        particle.velocity.x = -Math.abs(particle.velocity.x) * 0.5
      }

      // Y boundaries
      if (particle.position.y < -bounds) {
        particle.position.y = -bounds
        particle.velocity.y = Math.abs(particle.velocity.y) * 0.5
      } else if (particle.position.y > bounds) {
        particle.position.y = bounds
        particle.velocity.y = -Math.abs(particle.velocity.y) * 0.5
      }

      // Z boundaries
      if (particle.position.z < -bounds) {
        particle.position.z = -bounds
        particle.velocity.z = Math.abs(particle.velocity.z) * 0.5
      } else if (particle.position.z > bounds) {
        particle.position.z = bounds
        particle.velocity.z = -Math.abs(particle.velocity.z) * 0.5
      }
    })
  }

  const updateFluidGrid = () => {
    if (!fluidGridRef.current) return

    const grid = fluidGridRef.current

    // Clear grid
    for (let x = 0; x < grid.width; x++) {
      for (let y = 0; y < grid.height; y++) {
        for (let z = 0; z < grid.depth; z++) {
          grid.velocityField[x][y][z].set(0, 0, 0)
          grid.densityField[x][y][z] = 0
        }
      }
    }

    // Accumulate particle data to grid
    fluidParticlesRef.current.forEach(particle => {
      const gridX = Math.floor((particle.position.x + grid.width * grid.cellSize / 2) / grid.cellSize)
      const gridY = Math.floor((particle.position.y + grid.height * grid.cellSize / 2) / grid.cellSize)
      const gridZ = Math.floor((particle.position.z + grid.depth * grid.cellSize / 2) / grid.cellSize)

      if (gridX >= 0 && gridX < grid.width &&
          gridY >= 0 && gridY < grid.height &&
          gridZ >= 0 && gridZ < grid.depth) {
        grid.velocityField[gridX][gridY][gridZ].add(particle.velocity)
        grid.densityField[gridX][gridY][gridZ] += particle.density
      }
    })
  }

  const updateVorticityConfinement = () => {
    const time = Date.now() * 0.001

    // Update existing vorticity fields
    vorticityFieldsRef.current.forEach((vorticity, index) => {
      vorticity.age += 1 / 60

      if (vorticity.age > 5) {
        vorticityFieldsRef.current.splice(index, 1)
        return
      }

      // Apply vorticity to nearby particles
      fluidParticlesRef.current.forEach(particle => {
        const distance = particle.position.distanceTo(vorticity.position)
        if (distance < vorticity.radius) {
          const effect = (vorticity.radius - distance) / vorticity.radius
          const cross = new THREE.Vector3().crossVectors(
            vorticity.strength,
            particle.position.clone().sub(vorticity.position)
          )
          particle.acceleration.add(cross.multiplyScalar(effect * 0.5))
        }
      })
    })

    // Occasionally create new vorticity fields
    if (Math.random() < 0.02) {
      const newVorticity: VorticityField = {
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 40
        ),
        strength: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 1,
          (Math.random() - 0.5) * 2
        ),
        radius: 5 + Math.random() * 10,
        age: 0
      }
      vorticityFieldsRef.current.push(newVorticity)
    }
  }

  const updateFlowFieldVisualization = () => {
    if (!fluidGridRef.current) return

    const grid = fluidGridRef.current
    let meshIndex = 0

    for (let x = 0; x < grid.width; x += 4) {
      for (let y = 0; y < grid.height; y += 4) {
        for (let z = 0; z < grid.depth; z += 4) {
          if (meshIndex >= flowFieldMeshRef.current.length) break

          const velocity = grid.velocityField[x] && grid.velocityField[x][y] && grid.velocityField[x][y][z]
            ? grid.velocityField[x][y][z]
            : new THREE.Vector3(0, 0, 0)

          const mesh = flowFieldMeshRef.current[meshIndex]
          const positions = mesh.geometry.attributes.position.array as Float32Array

          const worldX = (x - grid.width / 2) * grid.cellSize
          const worldY = (y - grid.height / 2) * grid.cellSize
          const worldZ = (z - grid.depth / 2) * grid.cellSize

          positions[0] = worldX
          positions[1] = worldY
          positions[2] = worldZ
          positions[3] = worldX + velocity.x * 5
          positions[4] = worldY + velocity.y * 5
          positions[5] = worldZ + velocity.z * 5

          mesh.geometry.attributes.position.needsUpdate = true

          // Update color based on velocity magnitude
          const speed = velocity.length()
          if (mesh.material instanceof THREE.LineBasicMaterial) {
            mesh.material.color.setHSL(0.6 - speed * 0.1, 0.8, 0.5)
            mesh.material.opacity = Math.min(1, speed * 0.2)
          }

          meshIndex++
        }
      }
    }
  }

  const updateDensityVisualization = () => {
    if (!densityVisualizationRef.current || !fluidGridRef.current) return

    const grid = fluidGridRef.current
    const colors = densityVisualizationRef.current.geometry.attributes.color.array as Float32Array
    let pointIndex = 0

    for (let x = 0; x < grid.width; x += 2) {
      for (let y = 0; y < grid.height; y += 2) {
        for (let z = 0; z < grid.depth; z += 2) {
          if (pointIndex * 3 + 2 >= colors.length) break

          const density = grid.densityField[x] && grid.densityField[x][y] && grid.densityField[x][y][z]
            ? grid.densityField[x][y][z]
            : 0

          const normalizedDensity = Math.min(1, density / (restDensity * 2))
          colors[pointIndex * 3] = 0.2 + normalizedDensity * 0.6     // R
          colors[pointIndex * 3 + 1] = 0.4 + normalizedDensity * 0.4 // G
          colors[pointIndex * 3 + 2] = 0.8 - normalizedDensity * 0.3 // B

          pointIndex++
        }
      }
    }

    densityVisualizationRef.current.geometry.attributes.color.needsUpdate = true
  }

  const updateParticleVisualization = () => {
    if (!particleMeshRef.current) return

    const positions = particleMeshRef.current.geometry.attributes.position.array as Float32Array
    const colors = particleMeshRef.current.geometry.attributes.color.array as Float32Array
    const sizes = particleMeshRef.current.geometry.attributes.size.array as Float32Array

    fluidParticlesRef.current.forEach((particle, index) => {
      positions[index * 3] = particle.position.x
      positions[index * 3 + 1] = particle.position.y
      positions[index * 3 + 2] = particle.position.z

      colors[index * 3] = particle.color.r
      colors[index * 3 + 1] = particle.color.g
      colors[index * 3 + 2] = particle.color.b

      sizes[index] = 1.5 + particle.velocity.length() * 0.5
    })

    particleMeshRef.current.geometry.attributes.position.needsUpdate = true
    particleMeshRef.current.geometry.attributes.color.needsUpdate = true
    particleMeshRef.current.geometry.attributes.size.needsUpdate = true
  }

  const updateFluidLighting = () => {
    if (!sceneRef.current) return

    const lights = sceneRef.current.children.filter(child => child instanceof THREE.PointLight) as THREE.PointLight[]
    const time = Date.now() * 0.001

    lights.forEach((light, index) => {
      // Calculate average fluid velocity in light's vicinity
      let avgVelocity = 0
      let count = 0

      fluidParticlesRef.current.forEach(particle => {
        const distance = particle.position.distanceTo(light.position)
        if (distance < 20) {
          avgVelocity += particle.velocity.length()
          count++
        }
      })

      if (count > 0) {
        avgVelocity /= count
        light.intensity = 1 + avgVelocity * 0.5
      }

      // Animate light position based on fluid flow
      light.position.x += Math.sin(time + index) * 0.1
      light.position.z += Math.cos(time + index) * 0.1
    })
  }

  const updateCameraFlow = () => {
    if (!cameraRef.current) return

    const time = Date.now() * 0.001
    const speed = effectParams.speed

    // Camera follows fluid motion
    let avgPosition = new THREE.Vector3(0, 0, 0)
    let count = 0

    fluidParticlesRef.current.forEach(particle => {
      avgPosition.add(particle.position)
      count++
    })

    if (count > 0) {
      avgPosition.divideScalar(count)

      // Smooth camera movement towards fluid center
      const targetPosition = new THREE.Vector3(
        avgPosition.x * 0.3,
        40 + avgPosition.y * 0.2,
        80 + avgPosition.z * 0.1
      )

      cameraRef.current.position.lerp(targetPosition, 0.02 * speed)
    }

    // Add gentle oscillation
    cameraRef.current.position.y += Math.sin(time * 0.5) * 2
    cameraRef.current.lookAt(0, 0, 0)
  }

  // Smoothing kernels for SPH simulation
  const smoothingKernel = (distance: number, radius: number): number => {
    if (distance >= radius) return 0
    const x = radius * radius - distance * distance
    return (315 / (64 * Math.PI * Math.pow(radius, 9))) * x * x * x
  }

  const smoothingKernelGradient = (distance: number, radius: number): number => {
    if (distance >= radius) return 0
    const x = radius - distance
    return -(45 / (Math.PI * Math.pow(radius, 6))) * x * x
  }

  const smoothingKernelLaplacian = (distance: number, radius: number): number => {
    if (distance >= radius) return 0
    return (45 / (Math.PI * Math.pow(radius, 6))) * (radius - distance)
  }

  return <div ref={mountRef} className="w-full h-full" />
}
