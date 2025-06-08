import { create } from 'zustand';

// Effect types
export type EffectType =
  | 'quantum-particles'
  | 'neural-flow'
  | 'cosmic-web'
  | 'dna-helix'
  | 'fractal-universe'
  | 'audio-visualizer'
  | 'motion-reactive'
  | 'fluid-dynamics';

// Performance metrics
export interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  renderTime: number;
  particleCount: number;
  gpuMemory: number;
}

// Effect parameters
export interface EffectParams {
  particleCount: number;
  speed: number;
  scale: number;
  intensity: number;
  colorScheme: string;
  interactionSensitivity: number;
}

// User interactions
export interface InteractionState {
  mousePosition: { x: number; y: number };
  isMouseActive: boolean;
  cameraPermission: boolean;
  audioPermission: boolean;
  motionData: any[];
  audioData: Float32Array | null;
}

// Main store interface
interface QuantumStore {
  // Current state
  currentEffect: EffectType;
  isPlaying: boolean;
  isFullscreen: boolean;
  showUI: boolean;

  // Performance
  performance: PerformanceMetrics;
  adaptiveQuality: boolean;
  targetFPS: number;

  // Effect parameters
  effectParams: EffectParams;

  // Interactions
  interactions: InteractionState;

  // Control actions
  setCurrentEffect: (effect: EffectType) => void;
  togglePlayback: () => void;
  toggleFullscreen: () => void;
  toggleUI: () => void;

  // Performance actions
  updatePerformance: (metrics: Partial<PerformanceMetrics>) => void;
  setAdaptiveQuality: (enabled: boolean) => void;

  // Parameter actions
  updateEffectParams: (params: Partial<EffectParams>) => void;
  resetEffectParams: () => void;

  // Interaction actions
  updateMousePosition: (x: number, y: number) => void;
  setMouseActive: (active: boolean) => void;
  updateMotionData: (data: any[]) => void;
  updateAudioData: (data: Float32Array) => void;
  setCameraPermission: (granted: boolean) => void;
  setAudioPermission: (granted: boolean) => void;
}

// Default values
const defaultEffectParams: EffectParams = {
  particleCount: 1000,
  speed: 1.0,
  scale: 1.0,
  intensity: 0.7,
  colorScheme: 'quantum',
  interactionSensitivity: 0.5,
};

const defaultPerformance: PerformanceMetrics = {
  fps: 60,
  memoryUsage: 0,
  renderTime: 16,
  particleCount: 1000,
  gpuMemory: 0,
};

const defaultInteractions: InteractionState = {
  mousePosition: { x: 0, y: 0 },
  isMouseActive: false,
  cameraPermission: false,
  audioPermission: false,
  motionData: [],
  audioData: null,
};

// Create Zustand store
export const useQuantumStore = create<QuantumStore>((set, get) => ({
  // Initial state
  currentEffect: 'quantum-particles',
  isPlaying: true,
  isFullscreen: false,
  showUI: true,

  performance: defaultPerformance,
  adaptiveQuality: true,
  targetFPS: 60,

  effectParams: defaultEffectParams,
  interactions: defaultInteractions,

  // Control actions
  setCurrentEffect: (effect) => {
    console.log(`🌌 Switching to effect: ${effect}`);
    set({ currentEffect: effect });
  },

  togglePlayback: () => {
    const { isPlaying } = get();
    console.log(`${isPlaying ? '⏸️' : '▶️'} ${isPlaying ? 'Pausing' : 'Starting'} screensaver`);
    set({ isPlaying: !isPlaying });
  },

  toggleFullscreen: () => {
    const { isFullscreen } = get();
    console.log(`${isFullscreen ? '🪟' : '🖥️'} ${isFullscreen ? 'Exiting' : 'Entering'} fullscreen`);
    set({ isFullscreen: !isFullscreen });
  },

  toggleUI: () => {
    const { showUI } = get();
    console.log(`${showUI ? '🫥' : '👁️'} ${showUI ? 'Hiding' : 'Showing'} UI`);
    set({ showUI: !showUI });
  },

  // Performance actions
  updatePerformance: (metrics) => {
    const { performance } = get();
    set({
      performance: { ...performance, ...metrics }
    });
  },

  setAdaptiveQuality: (enabled) => {
    console.log(`🎛️ Adaptive quality: ${enabled ? 'enabled' : 'disabled'}`);
    set({ adaptiveQuality: enabled });
  },

  // Parameter actions
  updateEffectParams: (params) => {
    const { effectParams } = get();
    set({
      effectParams: { ...effectParams, ...params }
    });
  },

  resetEffectParams: () => {
    console.log('🔄 Resetting effect parameters to defaults');
    set({ effectParams: defaultEffectParams });
  },

  // Interaction actions
  updateMousePosition: (x, y) => {
    const { interactions } = get();
    set({
      interactions: {
        ...interactions,
        mousePosition: { x, y },
        isMouseActive: true,
      }
    });
  },

  setMouseActive: (active) => {
    const { interactions } = get();
    set({
      interactions: {
        ...interactions,
        isMouseActive: active,
      }
    });
  },

  updateMotionData: (data) => {
    const { interactions } = get();
    set({
      interactions: {
        ...interactions,
        motionData: data,
      }
    });
  },

  updateAudioData: (data) => {
    const { interactions } = get();
    set({
      interactions: {
        ...interactions,
        audioData: data,
      }
    });
  },

  setCameraPermission: (granted) => {
    const { interactions } = get();
    console.log(`📹 Camera permission: ${granted ? 'granted' : 'denied'}`);
    set({
      interactions: {
        ...interactions,
        cameraPermission: granted,
      }
    });
  },

  setAudioPermission: (granted) => {
    const { interactions } = get();
    console.log(`🎤 Audio permission: ${granted ? 'granted' : 'denied'}`);
    set({
      interactions: {
        ...interactions,
        audioPermission: granted,
      }
    });
  },
}));

// Effect metadata
export const EFFECT_METADATA: Record<EffectType, {
  name: string;
  description: string;
  complexity: 'low' | 'medium' | 'high' | 'extreme';
  requiredFeatures: string[];
}> = {
  'quantum-particles': {
    name: '量子粒子',
    description: '量子もつれと波動関数の可視化',
    complexity: 'medium',
    requiredFeatures: ['WebGL'],
  },
  'neural-flow': {
    name: 'ニューラルフロー',
    description: 'AIニューラルネットワーク風データフロー',
    complexity: 'medium',
    requiredFeatures: ['WebGL'],
  },
  'cosmic-web': {
    name: '宇宙の大規模構造',
    description: '銀河フィラメントとダークマター',
    complexity: 'high',
    requiredFeatures: ['WebGL', 'WebGL2'],
  },
  'dna-helix': {
    name: 'DNA螺旋',
    description: '生命の螺旋構造と進化',
    complexity: 'medium',
    requiredFeatures: ['WebGL'],
  },
  'fractal-universe': {
    name: 'フラクタル宇宙',
    description: 'WebAssembly高速フラクタル生成',
    complexity: 'extreme',
    requiredFeatures: ['WebGL', 'WebAssembly'],
  },
  'audio-visualizer': {
    name: '音響スペクトラム',
    description: '3D音響可視化とビート検出',
    complexity: 'high',
    requiredFeatures: ['WebGL', 'WebAudio', 'Microphone'],
  },
  'motion-reactive': {
    name: 'モーション反応',
    description: 'カメラ入力でリアルタイム反応',
    complexity: 'extreme',
    requiredFeatures: ['WebGL', 'Camera', 'TensorFlow.js'],
  },
  'fluid-dynamics': {
    name: '流体力学',
    description: 'GPU加速流体シミュレーション',
    complexity: 'extreme',
    requiredFeatures: ['WebGL2', 'ComputeShaders'],
  },
};

// Performance presets
export const PERFORMANCE_PRESETS = {
  ultra: {
    particleCount: 5000,
    targetFPS: 60,
    quality: 1.0,
  },
  high: {
    particleCount: 3000,
    targetFPS: 60,
    quality: 0.8,
  },
  medium: {
    particleCount: 1000,
    targetFPS: 30,
    quality: 0.6,
  },
  low: {
    particleCount: 500,
    targetFPS: 30,
    quality: 0.4,
  },
  potato: {
    particleCount: 100,
    targetFPS: 15,
    quality: 0.2,
  },
} as const;
