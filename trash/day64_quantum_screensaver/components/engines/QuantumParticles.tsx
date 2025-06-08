'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useQuantumStore } from '@/lib/store';
import { performanceMonitor } from '@/lib/performance/monitor';
import { isWebGLAvailable } from '@/lib/webgl-detector';
import { webglManager } from '@/lib/webgl-manager';

interface QuantumParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  phase: number;
  amplitude: number;
  entangled: QuantumParticle | null;
  superposition: number;
  waveFunction: number;
}

export default function QuantumParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const particlesRef = useRef<QuantumParticle[]>([]);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const { effectParams, interactions, isPlaying } = useQuantumStore();

  // Quantum Particle vertex shader
  const vertexShader = `
    attribute float size;
    attribute float phase;
    attribute float amplitude;
    attribute float superposition;
    attribute vec3 particleColor;

    varying float vPhase;
    varying float vAmplitude;
    varying float vSuperposition;
    varying vec3 vColor;

    void main() {
      vPhase = phase;
      vAmplitude = amplitude;
      vSuperposition = superposition;
      vColor = particleColor;

      vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewPosition;

      // 波動関数に基づくサイズ変化
      float waveSize = size * (1.0 + 0.5 * sin(phase));
      gl_PointSize = waveSize * (300.0 / -modelViewPosition.z);
    }
  `;

  // Quantum Particle fragment shader
  const fragmentShader = `
    varying float vPhase;
    varying float vAmplitude;
    varying float vSuperposition;
    varying vec3 vColor;

    void main() {
      vec2 center = gl_PointCoord - 0.5;
      float distance = length(center);

      // 円形パーティクル
      if (distance > 0.5) discard;

      // 波動関数による透明度変化
      float waveAlpha = vAmplitude * (1.0 + 0.3 * sin(vPhase * 10.0));

      // 重ね合わせ状態のエフェクト
      float superpositionEffect = mix(1.0, 0.3, vSuperposition);

      // 量子干渉パターン
      float interference = 1.0 - distance * 2.0;
      interference *= waveAlpha * superpositionEffect;

      // ホログラムエフェクト
      vec3 quantumColor = vColor;
      quantumColor += vec3(0.2, 0.4, 0.8) * sin(vPhase * 5.0);

      gl_FragColor = vec4(quantumColor, interference * 0.8);
    }
  `;

  // Three.js初期化
  const initThreeJS = useCallback(() => {
    if (!canvasRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 50;
    cameraRef.current = camera;

    // WebGLマネージャーからレンダラーを取得
    const renderer = webglManager.getRenderer(canvasRef.current);

    // エフェクトを登録
    const cleanup = () => {
      if (sceneRef.current && pointsRef.current) {
        sceneRef.current.remove(pointsRef.current);
      }
      if (geometryRef.current) {
        geometryRef.current.dispose();
        geometryRef.current = null;
      }
      if (materialRef.current) {
        materialRef.current.dispose();
        materialRef.current = null;
      }
      pointsRef.current = null;
      particlesRef.current = [];
    };

    const updateFunction = (deltaTime: number) => {
      updateQuantumPhysics(deltaTime);

      // シェーダーユニフォーム更新
      if (materialRef.current) {
        materialRef.current.uniforms.time.value += deltaTime;
        materialRef.current.uniforms.mousePos.value.set(
          interactions.mousePosition.x / window.innerWidth,
          interactions.mousePosition.y / window.innerHeight
        );
        materialRef.current.uniforms.intensity.value = effectParams.intensity;
      }

      // カメラ回転
      if (cameraRef.current) {
        cameraRef.current.position.x = Math.cos(performance.now() * 0.0005) * 50;
        cameraRef.current.position.z = Math.sin(performance.now() * 0.0005) * 50;
        cameraRef.current.lookAt(0, 0, 0);
      }
    };

    webglManager.registerEffect('quantum-particles', scene, camera, cleanup, updateFunction);
    webglManager.setActiveEffect('quantum-particles');
    webglManager.startAnimation();
    cleanupRef.current = cleanup;

    console.log('🌌 Quantum Particles engine initialized with WebGL Manager');
  }, []);

  // 量子粒子生成
  const createQuantumParticles = useCallback(() => {
    const particles: QuantumParticle[] = [];
    const count = effectParams.particleCount;

    for (let i = 0; i < count; i++) {
      const particle: QuantumParticle = {
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        ),
        phase: Math.random() * Math.PI * 2,
        amplitude: 0.5 + Math.random() * 0.5,
        entangled: null,
        superposition: Math.random(),
        waveFunction: Math.random() * Math.PI * 2,
      };
      particles.push(particle);
    }

    // 量子もつれペア生成 (20%の粒子がもつれている)
    for (let i = 0; i < count * 0.2; i += 2) {
      if (i + 1 < particles.length) {
        particles[i].entangled = particles[i + 1];
        particles[i + 1].entangled = particles[i];
      }
    }

    particlesRef.current = particles;
    console.log(`⚛️ Created ${count} quantum particles with ${Math.floor(count * 0.1)} entangled pairs`);
  }, [effectParams.particleCount]);

  // BufferGeometry作成
  const createParticleGeometry = useCallback(() => {
    if (!sceneRef.current) return;

    const particles = particlesRef.current;
    const count = particles.length;

    // Geometry
    const geometry = new THREE.BufferGeometry();

    // Attributes
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const amplitudes = new Float32Array(count);
    const superpositions = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const particle = particles[i];

      // Position
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;

      // Size
      sizes[i] = 5 + Math.random() * 10;

      // Phase
      phases[i] = particle.phase;

      // Amplitude
      amplitudes[i] = particle.amplitude;

      // Superposition
      superpositions[i] = particle.superposition;

      // Color (quantum colors)
      const hue = particle.waveFunction + particle.phase * 0.1;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('amplitude', new THREE.BufferAttribute(amplitudes, 1));
    geometry.setAttribute('superposition', new THREE.BufferAttribute(superpositions, 1));
    geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3));

    geometryRef.current = geometry;

    // Material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        mousePos: { value: new THREE.Vector2(0, 0) },
        intensity: { value: effectParams.intensity },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    materialRef.current = material;

    // Points
    const points = new THREE.Points(geometry, material);
    pointsRef.current = points;
    sceneRef.current.add(points);

    console.log('⚛️ Quantum particle geometry created');
  }, [effectParams.intensity, vertexShader, fragmentShader]);

  // 量子物理シミュレーション更新
  const updateQuantumPhysics = useCallback((deltaTime: number) => {
    const particles = particlesRef.current;
    if (!particles.length || !geometryRef.current) return;

    const positions = geometryRef.current.attributes.position.array as Float32Array;
    const phases = geometryRef.current.attributes.phase.array as Float32Array;
    const amplitudes = geometryRef.current.attributes.amplitude.array as Float32Array;
    const superpositions = geometryRef.current.attributes.superposition.array as Float32Array;

    const speed = effectParams.speed;
    const mouseX = interactions.mousePosition.x;
    const mouseY = interactions.mousePosition.y;

    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];

      // 波動関数の時間発展
      particle.phase += deltaTime * speed * 0.01;
      particle.waveFunction += deltaTime * speed * 0.005;

      // シュレーディンガー方程式的な位置更新
      const waveInfluence = Math.sin(particle.waveFunction) * 0.1;
      particle.velocity.x += waveInfluence;
      particle.velocity.y += Math.cos(particle.waveFunction) * 0.1;

      // マウスインタラクション（観測効果）
      if (interactions.isMouseActive) {
        const mouseInfluence = new THREE.Vector3(
          mouseX * 0.1 - particle.position.x,
          -mouseY * 0.1 - particle.position.y,
          0
        );
        mouseInfluence.multiplyScalar(0.001 * effectParams.interactionSensitivity);
        particle.velocity.add(mouseInfluence);

        // 観測による波動関数の収束
        const distance = particle.position.distanceTo(new THREE.Vector3(mouseX * 0.1, -mouseY * 0.1, 0));
        if (distance < 10) {
          particle.superposition *= 0.98; // 重ね合わせ状態の収束
        }
      } else {
        // 観測されていない時は重ね合わせ状態が回復
        particle.superposition = Math.min(1.0, particle.superposition * 1.001);
      }

      // 量子もつれエフェクト
      if (particle.entangled) {
        const entangled = particle.entangled;
        // もつれた粒子の位相は反対になる
        entangled.phase = -particle.phase;
        entangled.amplitude = particle.amplitude;
      }

      // 位置更新
      particle.position.add(particle.velocity);

      // 境界処理（周期境界条件）
      if (Math.abs(particle.position.x) > 50) {
        particle.position.x = -Math.sign(particle.position.x) * 50;
      }
      if (Math.abs(particle.position.y) > 50) {
        particle.position.y = -Math.sign(particle.position.y) * 50;
      }
      if (Math.abs(particle.position.z) > 50) {
        particle.position.z = -Math.sign(particle.position.z) * 50;
      }

      // バッファ更新
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;
      phases[i] = particle.phase;
      amplitudes[i] = particle.amplitude;
      superpositions[i] = particle.superposition;
    }

    // BufferGeometry更新
    geometryRef.current.attributes.position.needsUpdate = true;
    geometryRef.current.attributes.phase.needsUpdate = true;
    geometryRef.current.attributes.amplitude.needsUpdate = true;
    geometryRef.current.attributes.superposition.needsUpdate = true;
  }, [effectParams.speed, effectParams.interactionSensitivity, interactions]);



  // 初期化
  useEffect(() => {
    console.log('🌌 Quantum Particles: Initializing component');

    // パフォーマンスモニターをグローバルに設定
    (window as any).performanceMonitor = performanceMonitor;

    initThreeJS();
    createQuantumParticles();
    createParticleGeometry();

    // ウィンドウリサイズ処理
    const handleResize = () => {
      webglManager.handleResize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      console.log('🌌 Quantum Particles: Cleaning up component');

      window.removeEventListener('resize', handleResize);

      // WebGLマネージャークリーンアップ
      webglManager.unregisterEffect('quantum-particles');
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      // Clear refs
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []); // 空の依存配列で初期化は一度だけ

  // エフェクトパラメータ変更時の更新
  useEffect(() => {
    if (particlesRef.current.length !== effectParams.particleCount) {
      createQuantumParticles();
      createParticleGeometry();
    }
  }, [effectParams.particleCount]);

  // アニメーション再開/停止
  useEffect(() => {
    webglManager.setPlaying(isPlaying);
  }, [isPlaying]);

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

  return (
    <canvas
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
  );
}
