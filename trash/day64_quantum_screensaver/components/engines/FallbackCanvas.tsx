'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useQuantumStore } from '@/lib/store'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  alpha: number
  life: number
}

export default function FallbackCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])

  const effectParams = useQuantumStore((state) => state.effectParams)
  const isPlaying = useQuantumStore((state) => state.isPlaying)
  const updatePerformance = useQuantumStore((state) => state.updatePerformance)

  const getRandomColor = useCallback((): string => {
    const colors = [
      '#00ccff', // Cyan
      '#ff6600', // Orange
      '#44ff44', // Green
      '#ff4444', // Red
      '#ffff44', // Yellow
      '#ff44ff', // Magenta
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }, [])

  const initializeParticles = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    particlesRef.current = []
    const particleCount = Math.min(effectParams.particleCount, 500) // Limit for performance

    for (let i = 0; i < particleCount; i++) {
      particlesRef.current.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: Math.random() * 3 + 1,
        color: getRandomColor(),
        alpha: Math.random() * 0.8 + 0.2,
        life: Math.random() * 100 + 50
      })
    }
  }, [effectParams.particleCount, getRandomColor])

  const updateParticles = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const speed = effectParams.speed
    const intensity = effectParams.intensity

    particlesRef.current.forEach((particle) => {
      // Update position
      particle.x += particle.vx * speed
      particle.y += particle.vy * speed

      // Bounce off walls
      if (particle.x <= 0 || particle.x >= canvas.width) {
        particle.vx *= -1
        particle.x = Math.max(0, Math.min(canvas.width, particle.x))
      }
      if (particle.y <= 0 || particle.y >= canvas.height) {
        particle.vy *= -1
        particle.y = Math.max(0, Math.min(canvas.height, particle.y))
      }

      // Update life and alpha
      particle.life -= 1
      particle.alpha = Math.max(0, particle.life / 100) * intensity

      // Respawn particle if dead
      if (particle.life <= 0) {
        particle.x = Math.random() * canvas.width
        particle.y = Math.random() * canvas.height
        particle.vx = (Math.random() - 0.5) * 2
        particle.vy = (Math.random() - 0.5) * 2
        particle.life = Math.random() * 100 + 50
        particle.color = getRandomColor()
      }
    })
  }, [effectParams.speed, effectParams.intensity, getRandomColor])

  const renderParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw particles
    particlesRef.current.forEach(particle => {
      ctx.save()
      ctx.globalAlpha = particle.alpha

      // Create gradient
      const gradient = ctx.createRadialGradient(
        particle.x, particle.y, 0,
        particle.x, particle.y, particle.radius
      )
      gradient.addColorStop(0, particle.color)
      gradient.addColorStop(1, 'transparent')

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
    })

    // Draw connections between nearby particles
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1

    for (let i = 0; i < particlesRef.current.length; i++) {
      for (let j = i + 1; j < particlesRef.current.length; j++) {
        const p1 = particlesRef.current[i]
        const p2 = particlesRef.current[j]
        const distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)

        if (distance < 100) {
          ctx.globalAlpha = (100 - distance) / 100 * 0.3
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
        }
      }
    }
    ctx.globalAlpha = 1
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
    }

    updateSize()
    window.addEventListener('resize', updateSize)

    // Initialize particles
    initializeParticles()

    const animate = () => {
      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      updateParticles()
      renderParticles(ctx)

      updatePerformance({
        fps: 60,
        memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        particleCount: particlesRef.current.length
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      window.removeEventListener('resize', updateSize)
    }
  }, [isPlaying, updatePerformance, initializeParticles, updateParticles, renderParticles])

  return (
    <div className="w-full h-full relative bg-black">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Overlay message */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center text-white/60">
          <div className="text-2xl mb-2">🎨</div>
          <div className="text-sm">Canvas 2D Fallback Mode</div>
          <div className="text-xs mt-1">WebGL not available</div>
        </div>
      </div>
    </div>
  )
}
