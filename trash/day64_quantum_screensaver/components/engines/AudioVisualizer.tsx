'use client'

import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { useQuantumStore } from '@/lib/store'

interface AudioNode {
  frequency: number
  amplitude: number
  phase: number
  position: THREE.Vector3
  color: THREE.Color
  velocity: THREE.Vector3
  life: number
}

interface SpectrumBar {
  frequency: number
  amplitude: number
  height: number
  mesh: THREE.Mesh
  targetHeight: number
}

interface WaveformPoint {
  position: THREE.Vector3
  amplitude: number
  time: number
  color: THREE.Color
}

export default function AudioVisualizer() {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animationRef = useRef<number | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const frequencyDataRef = useRef<Uint8Array | null>(null)
  const timeDataRef = useRef<Uint8Array | null>(null)

  const audioNodesRef = useRef<AudioNode[]>([])
  const spectrumBarsRef = useRef<SpectrumBar[]>([])
  const waveformPointsRef = useRef<WaveformPoint[]>([])
  const particleMeshesRef = useRef<THREE.Points[]>([])
  const spectrumMeshRef = useRef<THREE.Group | null>(null)
  const waveformMeshRef = useRef<THREE.Line | null>(null)

  const [audioPermission, setAudioPermission] = useState<boolean>(false)
  const [audioMode, setAudioMode] = useState<'microphone' | 'generated'>('generated')

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  useEffect(() => {
    if (!mountRef.current) return

    // Scene setup for audio visualization
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000011)
    scene.fog = new THREE.Fog(0x000011, 100, 400)
    sceneRef.current = scene

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(0, 30, 80)
    cameraRef.current = camera

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Setup audio-reactive lighting
    setupAudioLighting()

    // Initialize audio context
    initializeAudio()

    // Create initial visualization structures
    createSpectrumAnalyzer()
    createWaveformVisualizer()
    createAudioParticles()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateAudioAnalysis()
      updateSpectrumVisualization()
      updateWaveformVisualization()
      updateAudioParticles()
      updateAudioLighting()
      updateCameraMovement()

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: audioNodesRef.current.length + spectrumBarsRef.current.length
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

      // Clean up audio resources
      cleanupAudio()
    }
  }, [isPlaying, updatePerformance])

  const initializeAudio = async () => {
    try {
      // Create audio context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

      // Create analyser node
      const analyser = audioContextRef.current.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.85
      analyserRef.current = analyser

      // Create data arrays
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array
      timeDataRef.current = new Uint8Array(analyser.fftSize) as Uint8Array

      // Start with generated audio
      startGeneratedAudio()

    } catch (error) {
      console.error('Audio initialization failed:', error)
    }
  }

  const startMicrophoneAudio = async () => {
    if (!audioContextRef.current || !analyserRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      microphoneRef.current = source
      setAudioPermission(true)
      setAudioMode('microphone')

      // Stop generated audio if running
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
        oscillatorRef.current = null
      }
    } catch (error) {
      console.error('Microphone access failed:', error)
      setAudioPermission(false)
    }
  }

  const startGeneratedAudio = () => {
    if (!audioContextRef.current || !analyserRef.current) return

    // Create multiple oscillators for rich audio
    const oscillators: OscillatorNode[] = []
    const gainNode = audioContextRef.current.createGain()
    gainNode.gain.value = 0.1
    gainNode.connect(analyserRef.current)

    // Base frequency oscillator
    const baseOsc = audioContextRef.current.createOscillator()
    baseOsc.type = 'sine'
    baseOsc.frequency.value = 220
    baseOsc.connect(gainNode)
    baseOsc.start()
    oscillators.push(baseOsc)

    // Harmonic oscillators
    for (let i = 1; i < 5; i++) {
      const harmonic = audioContextRef.current.createOscillator()
      harmonic.type = i % 2 === 0 ? 'sawtooth' : 'triangle'
      harmonic.frequency.value = 220 * (i + 1) * 0.5

      const harmonicGain = audioContextRef.current.createGain()
      harmonicGain.gain.value = 0.1 / (i + 1)
      harmonic.connect(harmonicGain)
      harmonicGain.connect(gainNode)
      harmonic.start()
      oscillators.push(harmonic)
    }

    // Animate frequencies for dynamic visualization
    const animateFrequencies = () => {
      const time = Date.now() * 0.001
      oscillators.forEach((osc, index) => {
        const baseFreq = 220 * (index + 1) * 0.5
        const modulation = Math.sin(time * (0.1 + index * 0.05)) * 50
        osc.frequency.value = baseFreq + modulation
      })

      if (oscillatorRef.current) {
        requestAnimationFrame(animateFrequencies)
      }
    }
    animateFrequencies()

    oscillatorRef.current = baseOsc
    setAudioMode('generated')
  }

  const cleanupAudio = () => {
    if (microphoneRef.current) {
      microphoneRef.current.disconnect()
      microphoneRef.current = null
    }

    if (oscillatorRef.current) {
      oscillatorRef.current.stop()
      oscillatorRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }

  const setupAudioLighting = () => {
    if (!sceneRef.current) return

    // Ambient light with audio-reactive intensity
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3)
    sceneRef.current.add(ambientLight)

    // Directional light for main illumination
    const directionalLight = new THREE.DirectionalLight(0x8888ff, 1)
    directionalLight.position.set(30, 50, 30)
    directionalLight.castShadow = true
    sceneRef.current.add(directionalLight)

    // Point lights for frequency bands
    const lowFreqLight = new THREE.PointLight(0xff3333, 2, 100)
    lowFreqLight.position.set(-30, 20, 0)
    sceneRef.current.add(lowFreqLight)

    const midFreqLight = new THREE.PointLight(0x33ff33, 2, 100)
    midFreqLight.position.set(0, 20, 30)
    sceneRef.current.add(midFreqLight)

    const highFreqLight = new THREE.PointLight(0x3333ff, 2, 100)
    highFreqLight.position.set(30, 20, 0)
    sceneRef.current.add(highFreqLight)
  }

  const createSpectrumAnalyzer = () => {
    if (!sceneRef.current) return

    const barCount = 128
    const barWidth = 1
    const spacing = 1.5

    spectrumBarsRef.current = []

    for (let i = 0; i < barCount; i++) {
      const geometry = new THREE.BoxGeometry(barWidth, 1, barWidth)
      const hue = (i / barCount) * 360
      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(hue / 360, 0.8, 0.5),
        transparent: true,
        opacity: 0.8,
        emissive: new THREE.Color().setHSL(hue / 360, 0.8, 0.2)
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.x = (i - barCount / 2) * spacing
      mesh.position.y = 0
      mesh.castShadow = true

      const spectrumBar: SpectrumBar = {
        frequency: (i / barCount) * 22050, // Nyquist frequency
        amplitude: 0,
        height: 0,
        mesh,
        targetHeight: 0
      }

      spectrumBarsRef.current.push(spectrumBar)
    }

    const spectrumGroup = new THREE.Group()
    spectrumBarsRef.current.forEach(bar => spectrumGroup.add(bar.mesh))
    sceneRef.current.add(spectrumGroup)
    spectrumMeshRef.current = spectrumGroup
  }

  const createWaveformVisualizer = () => {
    if (!sceneRef.current) return

    const points = []
    const colors = []
    const sampleCount = 256

    for (let i = 0; i < sampleCount; i++) {
      const x = (i / sampleCount - 0.5) * 100
      points.push(x, 0, 20)

      const hue = (i / sampleCount) * 360
      const color = new THREE.Color().setHSL(hue / 360, 1, 0.5)
      colors.push(color.r, color.g, color.b)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 3,
      transparent: true,
      opacity: 0.9
    })

    const waveform = new THREE.Line(geometry, material)
    sceneRef.current.add(waveform)
    waveformMeshRef.current = waveform
  }

  const createAudioParticles = () => {
    if (!sceneRef.current) return

    // Clear existing particles
    particleMeshesRef.current.forEach(mesh => sceneRef.current?.remove(mesh))
    particleMeshesRef.current = []
    audioNodesRef.current = []

    const particleCount = Math.floor(effectParams.particleCount / 2)
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const sizes = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      // Initialize audio-reactive particles
      const audioNode: AudioNode = {
        frequency: Math.random() * 22050,
        amplitude: 0,
        phase: Math.random() * Math.PI * 2,
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 50,
          (Math.random() - 0.5) * 100
        ),
        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        ),
        life: 1.0
      }

      audioNodesRef.current.push(audioNode)

      positions[i * 3] = audioNode.position.x
      positions[i * 3 + 1] = audioNode.position.y
      positions[i * 3 + 2] = audioNode.position.z

      colors[i * 3] = audioNode.color.r
      colors[i * 3 + 1] = audioNode.color.g
      colors[i * 3 + 2] = audioNode.color.b

      sizes[i] = 2 + Math.random() * 3
    }

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

    const particles = new THREE.Points(geometry, material)
    sceneRef.current.add(particles)
    particleMeshesRef.current.push(particles)
  }

  const updateAudioAnalysis = () => {
    if (!analyserRef.current || !frequencyDataRef.current || !timeDataRef.current) return

    // Get frequency and time domain data
    analyserRef.current.getByteFrequencyData(frequencyDataRef.current as any)
    analyserRef.current.getByteTimeDomainData(timeDataRef.current as any)
  }

  const updateSpectrumVisualization = () => {
    if (!frequencyDataRef.current) return

    const intensity = effectParams.intensity
    const speed = effectParams.speed

    spectrumBarsRef.current.forEach((bar, index) => {
      const dataIndex = Math.floor((index / spectrumBarsRef.current.length) * frequencyDataRef.current!.length)
      const amplitude = frequencyDataRef.current![dataIndex] / 255

      bar.amplitude = amplitude
      bar.targetHeight = amplitude * 30 * intensity

      // Smooth height transitions
      bar.height += (bar.targetHeight - bar.height) * 0.2 * speed

      // Update mesh
      bar.mesh.scale.y = Math.max(0.1, bar.height)
      bar.mesh.position.y = bar.height / 2

      // Update color based on amplitude
      if (bar.mesh.material instanceof THREE.MeshPhongMaterial) {
        const hue = (index / spectrumBarsRef.current.length + Date.now() * 0.0001) % 1
        bar.mesh.material.color.setHSL(hue, 0.8, 0.3 + amplitude * 0.4)
        bar.mesh.material.emissive.setHSL(hue, 0.8, amplitude * 0.3 * intensity)
      }
    })
  }

  const updateWaveformVisualization = () => {
    if (!timeDataRef.current || !waveformMeshRef.current) return

    const positions = waveformMeshRef.current.geometry.attributes.position.array as Float32Array
    const colors = waveformMeshRef.current.geometry.attributes.color.array as Float32Array
    const intensity = effectParams.intensity

    for (let i = 0; i < timeDataRef.current.length && i < positions.length / 3; i++) {
      const amplitude = (timeDataRef.current[i] - 128) / 128
      positions[i * 3 + 1] = amplitude * 20 * intensity

      // Update color based on amplitude
      const colorIntensity = Math.abs(amplitude) * intensity
      colors[i * 3] = 0.5 + colorIntensity * 0.5     // R
      colors[i * 3 + 1] = 0.3 + colorIntensity * 0.4 // G
      colors[i * 3 + 2] = 0.8 + colorIntensity * 0.2 // B
    }

    waveformMeshRef.current.geometry.attributes.position.needsUpdate = true
    waveformMeshRef.current.geometry.attributes.color.needsUpdate = true
  }

  const updateAudioParticles = () => {
    if (!frequencyDataRef.current || particleMeshesRef.current.length === 0) return

    const particles = particleMeshesRef.current[0]
    const positions = particles.geometry.attributes.position.array as Float32Array
    const colors = particles.geometry.attributes.color.array as Float32Array
    const sizes = particles.geometry.attributes.size.array as Float32Array

    const intensity = effectParams.intensity
    const speed = effectParams.speed
    const time = Date.now() * 0.001

    audioNodesRef.current.forEach((audioNode, index) => {
      // Map particle to frequency bin
      const freqIndex = Math.floor((audioNode.frequency / 22050) * frequencyDataRef.current!.length)
      const amplitude = frequencyDataRef.current![freqIndex] / 255

      audioNode.amplitude = amplitude

      // Update particle movement based on audio
      const audioForce = amplitude * intensity * 2
      audioNode.velocity.multiplyScalar(0.98) // Damping
      audioNode.velocity.add(new THREE.Vector3(
        Math.sin(time + audioNode.phase) * audioForce,
        Math.cos(time + audioNode.phase * 1.3) * audioForce,
        Math.sin(time * 0.7 + audioNode.phase * 0.8) * audioForce
      ))

      audioNode.position.add(audioNode.velocity.clone().multiplyScalar(speed))

      // Boundary wrapping
      if (Math.abs(audioNode.position.x) > 50) audioNode.position.x *= -0.9
      if (Math.abs(audioNode.position.y) > 25) audioNode.position.y *= -0.9
      if (Math.abs(audioNode.position.z) > 50) audioNode.position.z *= -0.9

      // Update geometry
      positions[index * 3] = audioNode.position.x
      positions[index * 3 + 1] = audioNode.position.y
      positions[index * 3 + 2] = audioNode.position.z

      // Update color based on amplitude
      const hue = (audioNode.frequency / 22050 + time * 0.1) % 1
      audioNode.color.setHSL(hue, 0.8, 0.3 + amplitude * 0.5)
      colors[index * 3] = audioNode.color.r
      colors[index * 3 + 1] = audioNode.color.g
      colors[index * 3 + 2] = audioNode.color.b

      // Update size based on amplitude
      sizes[index] = 2 + amplitude * 8 * intensity
    })

    particles.geometry.attributes.position.needsUpdate = true
    particles.geometry.attributes.color.needsUpdate = true
    particles.geometry.attributes.size.needsUpdate = true
  }

  const updateAudioLighting = () => {
    if (!sceneRef.current || !frequencyDataRef.current) return

    const lights = sceneRef.current.children.filter(child => child instanceof THREE.PointLight) as THREE.PointLight[]
    const intensity = effectParams.intensity

    if (lights.length >= 3) {
      // Low frequency (bass) - Red light
      const bassLevel = frequencyDataRef.current.slice(0, 32).reduce((sum, val) => sum + val, 0) / 32 / 255
      lights[0].intensity = 1 + bassLevel * 3 * intensity

      // Mid frequency - Green light
      const midLevel = frequencyDataRef.current.slice(32, 128).reduce((sum, val) => sum + val, 0) / 96 / 255
      lights[1].intensity = 1 + midLevel * 3 * intensity

      // High frequency (treble) - Blue light
      const trebleLevel = frequencyDataRef.current.slice(128).reduce((sum, val) => sum + val, 0) / (frequencyDataRef.current.length - 128) / 255
      lights[2].intensity = 1 + trebleLevel * 3 * intensity
    }
  }

  const updateCameraMovement = () => {
    if (!cameraRef.current || !frequencyDataRef.current) return

    const time = Date.now() * 0.001
    const speed = effectParams.speed
    const intensity = effectParams.intensity

    // Calculate overall audio level
    const audioLevel = frequencyDataRef.current.reduce((sum, val) => sum + val, 0) / frequencyDataRef.current.length / 255

    // Camera movement influenced by audio
    const radius = 60 + audioLevel * 20 * intensity
    const height = 20 + Math.sin(time * 0.3) * 10 + audioLevel * 15 * intensity

    cameraRef.current.position.x = Math.cos(time * 0.1 * speed) * radius
    cameraRef.current.position.z = Math.sin(time * 0.1 * speed) * radius
    cameraRef.current.position.y = height

    // Camera shake on high audio levels
    if (audioLevel > 0.7) {
      cameraRef.current.position.add(new THREE.Vector3(
        (Math.random() - 0.5) * audioLevel * intensity * 2,
        (Math.random() - 0.5) * audioLevel * intensity * 2,
        (Math.random() - 0.5) * audioLevel * intensity * 2
      ))
    }

    cameraRef.current.lookAt(0, 0, 0)
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />

      {/* Audio controls overlay */}
      <div className="absolute top-4 left-4 z-10 space-y-2">
        <button
          onClick={startMicrophoneAudio}
          className={`px-3 py-1 rounded text-xs font-mono ${
            audioMode === 'microphone' && audioPermission
              ? 'bg-green-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🎤 Microphone
        </button>

        <button
          onClick={startGeneratedAudio}
          className={`px-3 py-1 rounded text-xs font-mono ${
            audioMode === 'generated'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🎵 Generated
        </button>
      </div>
    </div>
  )
}
