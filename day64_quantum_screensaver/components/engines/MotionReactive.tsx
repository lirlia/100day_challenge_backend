'use client'

import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'

interface MotionParticle {
  position: THREE.Vector3
  velocity: THREE.Vector3
  acceleration: THREE.Vector3
  mass: number
  charge: number
  color: THREE.Color
  life: number
  maxLife: number
  size: number
  affected: boolean
}

interface ForceField {
  position: THREE.Vector3
  strength: number
  radius: number
  type: 'attract' | 'repel' | 'vortex' | 'turbulence'
  mesh: THREE.Mesh
}

interface MotionTrail {
  points: THREE.Vector3[]
  colors: THREE.Color[]
  maxLength: number
  mesh: THREE.Line
}

interface GestureData {
  startPosition: THREE.Vector2
  currentPosition: THREE.Vector2
  velocity: THREE.Vector2
  acceleration: THREE.Vector2
  startTime: number
  type: 'tap' | 'drag' | 'swipe' | 'pinch' | 'none'
}

export default function MotionReactive() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationRef = useRef<number | null>(null)
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster())

  const motionParticlesRef = useRef<MotionParticle[]>([])
  const forceFieldsRef = useRef<ForceField[]>([])
  const motionTrailsRef = useRef<MotionTrail[]>([])
  const particleMeshRef = useRef<THREE.Points | null>(null)
  const forceFieldGroupRef = useRef<THREE.Group | null>(null)

  const mousePositionRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const mousePreviousRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const mouseVelocityRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const isMouseDownRef = useRef<boolean>(false)
  const gestureRef = useRef<GestureData>({
    startPosition: new THREE.Vector2(),
    currentPosition: new THREE.Vector2(),
    velocity: new THREE.Vector2(),
    acceleration: new THREE.Vector2(),
    startTime: 0,
    type: 'none'
  })

  const [deviceMotion, setDeviceMotion] = useState<{
    x: number, y: number, z: number
  }>({ x: 0, y: 0, z: 0 })
  const [motionPermission, setMotionPermission] = useState<boolean>(false)

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup for motion-reactive environment
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000008)
    scene.fog = new THREE.Fog(0x000008, 100, 300)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 20, 60)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Setup motion-reactive lighting
    setupMotionLighting()

    // Initialize motion systems
    createMotionParticles()
    createForceFields()
    initializeMotionTrails()

    // Add event listeners
    addEventListeners()

    // Request device motion permission (iOS)
    requestDeviceMotionPermission()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateMotionPhysics()
      updateForceFields()
      updateMotionTrails()
      updateGestureRecognition()
      updateDeviceMotionEffects()
      updateCameraMotion()

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: motionParticlesRef.current.length
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
      removeEventListeners()
    }
  }, [isPlaying, updatePerformance])

  const setupMotionLighting = () => {
    if (!sceneRef.current) return

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404080, 0.4)
    sceneRef.current.add(ambientLight)

    // Motion-reactive directional light
    const directionalLight = new THREE.DirectionalLight(0x8899ff, 1)
    directionalLight.position.set(30, 40, 30)
    directionalLight.castShadow = true
    sceneRef.current.add(directionalLight)

    // Point lights for interaction visualization
    const interactionLight = new THREE.PointLight(0xffaa33, 2, 100)
    interactionLight.position.set(0, 20, 20)
    sceneRef.current.add(interactionLight)
  }

  const createMotionParticles = () => {
    if (!sceneRef.current) return

    const particleCount = effectParams.particleCount
    motionParticlesRef.current = []

    for (let i = 0; i < particleCount; i++) {
      const particle: MotionParticle = {
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 80,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 80
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2
        ),
        acceleration: new THREE.Vector3(0, 0, 0),
        mass: 0.5 + Math.random() * 1.5,
        charge: Math.random() > 0.5 ? 1 : -1,
        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
        life: 1.0,
        maxLife: 1.0,
        size: 1 + Math.random() * 3,
        affected: false
      }

      motionParticlesRef.current.push(particle)
    }

    // Create particle mesh
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)

    motionParticlesRef.current.forEach((particle, index) => {
      positions[index * 3] = particle.position.x
      positions[index * 3 + 1] = particle.position.y
      positions[index * 3 + 2] = particle.position.z

      colors[index * 3] = particle.color.r
      colors[index * 3 + 1] = particle.color.g
      colors[index * 3 + 2] = particle.color.b

      sizes[index] = particle.size
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.PointsMaterial({
      size: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    })

    const particles = new THREE.Points(geometry, material)
    sceneRef.current.add(particles)
    particleMeshRef.current = particles
  }

  const createForceFields = () => {
    if (!sceneRef.current) return

    forceFieldsRef.current = []
    const group = new THREE.Group()

    // Create initial force fields
    const fieldCount = 5
    for (let i = 0; i < fieldCount; i++) {
      const forceField = createForceField(
        new THREE.Vector3(
          (Math.random() - 0.5) * 60,
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 60
        ),
        ['attract', 'repel', 'vortex', 'turbulence'][Math.floor(Math.random() * 4)] as any
      )
      forceFieldsRef.current.push(forceField)
      group.add(forceField.mesh)
    }

    sceneRef.current.add(group)
    forceFieldGroupRef.current = group
  }

  const createForceField = (position: THREE.Vector3, type: 'attract' | 'repel' | 'vortex' | 'turbulence'): ForceField => {
    const radius = 5 + Math.random() * 10
    const strength = 0.5 + Math.random() * 1.5

    // Visual representation based on type
    let geometry: THREE.BufferGeometry
    let color: number

    switch (type) {
      case 'attract':
        geometry = new THREE.SphereGeometry(radius * 0.3, 16, 16)
        color = 0x33ff33
        break
      case 'repel':
        geometry = new THREE.SphereGeometry(radius * 0.3, 16, 16)
        color = 0xff3333
        break
      case 'vortex':
        geometry = new THREE.TorusGeometry(radius * 0.4, radius * 0.1, 8, 16)
        color = 0x3333ff
        break
      case 'turbulence':
        geometry = new THREE.OctahedronGeometry(radius * 0.3, 1)
        color = 0xffaa33
        break
    }

    const material = new THREE.MeshPhongMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      emissive: color,
      emissiveIntensity: 0.2,
      wireframe: true
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)

    return {
      position: position.clone(),
      strength,
      radius,
      type,
      mesh
    }
  }

  const initializeMotionTrails = () => {
    motionTrailsRef.current = []
  }

  const addEventListeners = () => {
    if (!mountRef.current) return

    const element = mountRef.current

    // Mouse events
    element.addEventListener('mousemove', onMouseMove)
    element.addEventListener('mousedown', onMouseDown)
    element.addEventListener('mouseup', onMouseUp)
    element.addEventListener('mouseleave', onMouseLeave)

    // Touch events for mobile
    element.addEventListener('touchstart', onTouchStart)
    element.addEventListener('touchmove', onTouchMove)
    element.addEventListener('touchend', onTouchEnd)

    // Device motion events
    if (window.DeviceMotionEvent) {
      window.addEventListener('devicemotion', onDeviceMotion)
    }
  }

  const removeEventListeners = () => {
    if (!mountRef.current) return

    const element = mountRef.current

    element.removeEventListener('mousemove', onMouseMove)
    element.removeEventListener('mousedown', onMouseDown)
    element.removeEventListener('mouseup', onMouseUp)
    element.removeEventListener('mouseleave', onMouseLeave)
    element.removeEventListener('touchstart', onTouchStart)
    element.removeEventListener('touchmove', onTouchMove)
    element.removeEventListener('touchend', onTouchEnd)

    if (window.DeviceMotionEvent) {
      window.removeEventListener('devicemotion', onDeviceMotion)
    }
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!mountRef.current) return

    const rect = mountRef.current.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    mousePreviousRef.current.copy(mousePositionRef.current)
    mousePositionRef.current.set(x, y)
    mouseVelocityRef.current.subVectors(mousePositionRef.current, mousePreviousRef.current)

    gestureRef.current.currentPosition.copy(mousePositionRef.current)
    updateGestureVelocity()

    // Create force field at mouse position
    createMouseForceField(x, y)
  }

  const onMouseDown = (event: MouseEvent) => {
    isMouseDownRef.current = true
    gestureRef.current.startPosition.copy(mousePositionRef.current)
    gestureRef.current.startTime = Date.now()
    gestureRef.current.type = 'tap'
  }

  const onMouseUp = () => {
    isMouseDownRef.current = false
    finalizeGesture()
  }

  const onMouseLeave = () => {
    isMouseDownRef.current = false
    mouseVelocityRef.current.set(0, 0)
  }

  const onTouchStart = (event: TouchEvent) => {
    event.preventDefault()
    if (event.touches.length === 1) {
      const touch = event.touches[0]
      onMouseDown({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent)
    }
  }

  const onTouchMove = (event: TouchEvent) => {
    event.preventDefault()
    if (event.touches.length === 1) {
      const touch = event.touches[0]
      onMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent)
    }
  }

  const onTouchEnd = (event: TouchEvent) => {
    event.preventDefault()
    onMouseUp()
  }

  const onDeviceMotion = (event: DeviceMotionEvent) => {
    if (event.accelerationIncludingGravity) {
      setDeviceMotion({
        x: event.accelerationIncludingGravity.x || 0,
        y: event.accelerationIncludingGravity.y || 0,
        z: event.accelerationIncludingGravity.z || 0
      })
    }
  }

  const requestDeviceMotionPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission()
        setMotionPermission(permission === 'granted')
      } catch (error) {
        console.error('Device motion permission denied:', error)
      }
    } else {
      setMotionPermission(true)
    }
  }

  const createMouseForceField = (x: number, y: number) => {
    if (!cameraRef.current || !sceneRef.current) return

    // Convert screen coordinates to world coordinates
    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current)
    const intersectPoint = raycasterRef.current.ray.at(50, new THREE.Vector3())

    // Create temporary force field at mouse position
    const mouseForce: ForceField = {
      position: intersectPoint,
      strength: mouseVelocityRef.current.length() * 10,
      radius: 15,
      type: isMouseDownRef.current ? 'attract' : 'repel',
      mesh: new THREE.Mesh() // Dummy mesh
    }

    // Apply force to nearby particles
    motionParticlesRef.current.forEach(particle => {
      const distance = particle.position.distanceTo(intersectPoint)
      if (distance < mouseForce.radius) {
        applyForce(particle, mouseForce, distance)
        particle.affected = true
      }
    })
  }

  const updateGestureVelocity = () => {
    const prevVelocity = gestureRef.current.velocity.clone()
    gestureRef.current.velocity.subVectors(
      gestureRef.current.currentPosition,
      gestureRef.current.startPosition
    )
    gestureRef.current.acceleration.subVectors(gestureRef.current.velocity, prevVelocity)
  }

  const finalizeGesture = () => {
    const gesture = gestureRef.current
    const duration = Date.now() - gesture.startTime
    const distance = gesture.velocity.length()

    if (duration < 200 && distance < 0.1) {
      gesture.type = 'tap'
      createExplosionEffect(gesture.currentPosition)
    } else if (distance > 0.3) {
      gesture.type = 'swipe'
      createSwipeEffect(gesture.startPosition, gesture.currentPosition)
    } else {
      gesture.type = 'drag'
    }

    // Reset gesture
    gesture.type = 'none'
  }

  const createExplosionEffect = (position: THREE.Vector2) => {
    if (!cameraRef.current) return

    raycasterRef.current.setFromCamera(position, cameraRef.current)
    const explosionPoint = raycasterRef.current.ray.at(50, new THREE.Vector3())

    motionParticlesRef.current.forEach(particle => {
      const distance = particle.position.distanceTo(explosionPoint)
      if (distance < 20) {
        const direction = particle.position.clone().sub(explosionPoint).normalize()
        const force = (20 - distance) / 20 * 2
        particle.velocity.add(direction.multiplyScalar(force))
        particle.color.setHSL(Math.random(), 1, 0.8)
      }
    })
  }

  const createSwipeEffect = (start: THREE.Vector2, end: THREE.Vector2) => {
    if (!cameraRef.current) return

    raycasterRef.current.setFromCamera(start, cameraRef.current)
    const startPoint = raycasterRef.current.ray.at(50, new THREE.Vector3())

    raycasterRef.current.setFromCamera(end, cameraRef.current)
    const endPoint = raycasterRef.current.ray.at(50, new THREE.Vector3())

    const swipeDirection = endPoint.clone().sub(startPoint).normalize()
    const swipeLength = startPoint.distanceTo(endPoint)

    motionParticlesRef.current.forEach(particle => {
      const toParticle = particle.position.clone().sub(startPoint)
      const projection = toParticle.dot(swipeDirection)

      if (projection > 0 && projection < swipeLength) {
        const perpendicularDistance = toParticle.clone().sub(
          swipeDirection.clone().multiplyScalar(projection)
        ).length()

        if (perpendicularDistance < 10) {
          const force = (10 - perpendicularDistance) / 10 * 1.5
          particle.velocity.add(swipeDirection.clone().multiplyScalar(force))
        }
      }
    })
  }

  const updateMotionPhysics = () => {
    const intensity = effectParams.intensity
    const speed = effectParams.speed

    motionParticlesRef.current.forEach(particle => {
      // Reset acceleration
      particle.acceleration.set(0, 0, 0)

      // Apply gravity
      particle.acceleration.y -= 0.01

      // Apply force fields
      forceFieldsRef.current.forEach(field => {
        const distance = particle.position.distanceTo(field.position)
        if (distance < field.radius) {
          applyForce(particle, field, distance)
        }
      })

      // Update physics
      particle.velocity.add(particle.acceleration.clone().multiplyScalar(speed))
      particle.velocity.multiplyScalar(0.99) // Damping
      particle.position.add(particle.velocity.clone().multiplyScalar(speed))

      // Boundary handling
      const bounds = 40
      if (Math.abs(particle.position.x) > bounds) {
        particle.position.x = Math.sign(particle.position.x) * bounds
        particle.velocity.x *= -0.8
      }
      if (Math.abs(particle.position.y) > bounds) {
        particle.position.y = Math.sign(particle.position.y) * bounds
        particle.velocity.y *= -0.8
      }
      if (Math.abs(particle.position.z) > bounds) {
        particle.position.z = Math.sign(particle.position.z) * bounds
        particle.velocity.z *= -0.8
      }

      // Update visual properties
      const velocityMagnitude = particle.velocity.length()
      particle.size = 1 + velocityMagnitude * 2 * intensity

      if (particle.affected) {
        particle.color.setHSL(
          (Date.now() * 0.001 + particle.position.x * 0.01) % 1,
          0.8,
          0.5 + velocityMagnitude * intensity
        )
        particle.affected = false
      }
    })

    // Update particle mesh
    updateParticleMesh()
  }

  const applyForce = (particle: MotionParticle, field: ForceField, distance: number) => {
    const direction = particle.position.clone().sub(field.position).normalize()
    const forceMagnitude = field.strength / (distance * distance + 1)

    switch (field.type) {
      case 'attract':
        particle.acceleration.sub(direction.multiplyScalar(forceMagnitude / particle.mass))
        break
      case 'repel':
        particle.acceleration.add(direction.multiplyScalar(forceMagnitude / particle.mass))
        break
      case 'vortex':
        const perpendicular = new THREE.Vector3(
          -direction.z,
          direction.y,
          direction.x
        ).normalize()
        particle.acceleration.add(perpendicular.multiplyScalar(forceMagnitude / particle.mass))
        break
      case 'turbulence':
        const noise = new THREE.Vector3(
          Math.sin(Date.now() * 0.001 + particle.position.x * 0.1) * 0.5,
          Math.cos(Date.now() * 0.001 + particle.position.y * 0.1) * 0.5,
          Math.sin(Date.now() * 0.001 + particle.position.z * 0.1) * 0.5
        )
        particle.acceleration.add(noise.multiplyScalar(forceMagnitude / particle.mass))
        break
    }
  }

  const updateParticleMesh = () => {
    if (!particleMeshRef.current) return

    const positions = particleMeshRef.current.geometry.attributes.position.array as Float32Array
    const colors = particleMeshRef.current.geometry.attributes.color.array as Float32Array
    const sizes = particleMeshRef.current.geometry.attributes.size.array as Float32Array

    motionParticlesRef.current.forEach((particle, index) => {
      positions[index * 3] = particle.position.x
      positions[index * 3 + 1] = particle.position.y
      positions[index * 3 + 2] = particle.position.z

      colors[index * 3] = particle.color.r
      colors[index * 3 + 1] = particle.color.g
      colors[index * 3 + 2] = particle.color.b

      sizes[index] = particle.size
    })

    particleMeshRef.current.geometry.attributes.position.needsUpdate = true
    particleMeshRef.current.geometry.attributes.color.needsUpdate = true
    particleMeshRef.current.geometry.attributes.size.needsUpdate = true
  }

  const updateForceFields = () => {
    const time = Date.now() * 0.001
    const speed = effectParams.speed

    forceFieldsRef.current.forEach((field, index) => {
      // Animate force field positions
      field.position.x += Math.sin(time * 0.3 + index) * 0.1 * speed
      field.position.y += Math.cos(time * 0.2 + index) * 0.05 * speed
      field.position.z += Math.sin(time * 0.4 + index) * 0.08 * speed

      field.mesh.position.copy(field.position)
      field.mesh.rotation.y = time * speed + index
      field.mesh.rotation.x = time * 0.7 * speed + index * 0.5

      // Pulsing effect
      const pulse = Math.sin(time * 2 + index) * 0.5 + 0.5
      field.mesh.scale.setScalar(1 + pulse * 0.3)

      if (field.mesh.material instanceof THREE.MeshPhongMaterial) {
        field.mesh.material.emissiveIntensity = 0.2 + pulse * 0.3
      }
    })
  }

  const updateMotionTrails = () => {
    // Implementation for motion trails would go here
    // This would track particle movements and create trailing effects
  }

  const updateGestureRecognition = () => {
    // Advanced gesture recognition logic would go here
    // Pattern matching for complex gestures
  }

  const updateDeviceMotionEffects = () => {
    if (!motionPermission) return

    const tiltForce = new THREE.Vector3(
      deviceMotion.x * 0.01,
      0,
      deviceMotion.y * 0.01
    )

    motionParticlesRef.current.forEach(particle => {
      particle.acceleration.add(tiltForce)
    })
  }

  const updateCameraMotion = () => {
    if (!cameraRef.current) return

    const time = Date.now() * 0.001
    const speed = effectParams.speed

    // Gentle camera movement influenced by mouse
    const mouseInfluence = new THREE.Vector3(
      mousePositionRef.current.x * 10,
      mousePositionRef.current.y * 5,
      0
    )

    cameraRef.current.position.lerp(
      new THREE.Vector3(mouseInfluence.x, 20 + mouseInfluence.y, 60),
      0.02 * speed
    )

    // Add subtle device motion influence
    if (motionPermission) {
      cameraRef.current.position.add(new THREE.Vector3(
        deviceMotion.x * 0.1,
        deviceMotion.z * 0.1,
        deviceMotion.y * 0.1
      ))
    }

    cameraRef.current.lookAt(0, 0, 0)
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full cursor-crosshair" />

      {/* Motion controls overlay */}
      <div className="absolute top-4 right-4 z-10 space-y-2 text-right">
        <div className="text-xs font-mono text-gray-300">
          Mouse Velocity: {mouseVelocityRef.current.length().toFixed(2)}
        </div>
        <div className="text-xs font-mono text-gray-300">
          Gesture: {gestureRef.current.type}
        </div>
        {motionPermission && (
          <div className="text-xs font-mono text-gray-300">
            Device Motion: {deviceMotion.x.toFixed(1)}, {deviceMotion.y.toFixed(1)}, {deviceMotion.z.toFixed(1)}
          </div>
        )}
        <button
          onClick={requestDeviceMotionPermission}
          className={`px-3 py-1 rounded text-xs font-mono ${
            motionPermission
              ? 'bg-green-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📱 Device Motion
        </button>
      </div>
    </div>
  )
}
