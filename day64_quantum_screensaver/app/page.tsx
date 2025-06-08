'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuantumStore } from '@/lib/store';
import ControlPanel from '@/components/ui/ControlPanel';
import PerformanceMonitor from '@/components/ui/PerformanceMonitor';
import WebGLErrorBoundary from '@/components/ui/WebGLErrorBoundary';

// Dynamic imports to prevent SSR issues with WebGL
const QuantumParticles = dynamic(() => import('@/components/engines/QuantumParticles'), { ssr: false })
const NeuralFlow = dynamic(() => import('@/components/engines/NeuralFlow'), { ssr: false })
const DNAHelix = dynamic(() => import('@/components/engines/DNAHelix'), { ssr: false })
const FractalUniverse = dynamic(() => import('@/components/engines/FractalUniverse'), { ssr: false })
const CosmicWeb = dynamic(() => import('@/components/engines/CosmicWeb'), { ssr: false })
const AudioVisualizer = dynamic(() => import('@/components/engines/AudioVisualizer'), { ssr: false })
const MotionReactive = dynamic(() => import('@/components/engines/MotionReactive'), { ssr: false })
const FluidDynamics = dynamic(() => import('@/components/engines/FluidDynamics'), { ssr: false })

export default function QuantumDreamScreensaver() {
  const {
    currentEffect,
    isPlaying,
    togglePlayback,
    toggleFullscreen,
    toggleUI,
    setCurrentEffect,
    resetEffectParams,
    updateMousePosition,
    setMouseActive,
  } = useQuantumStore();

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'Space':
          event.preventDefault();
          togglePlayback();
          break;
        case 'KeyF':
          event.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyH':
          event.preventDefault();
          toggleUI();
          break;
        case 'KeyR':
          event.preventDefault();
          resetEffectParams();
          break;
        case 'Digit1':
          setCurrentEffect('quantum-particles');
          break;
        case 'Digit2':
          setCurrentEffect('neural-flow');
          break;
        case 'Digit3':
          setCurrentEffect('cosmic-web');
          break;
        case 'Digit4':
          setCurrentEffect('dna-helix');
          break;
        case 'Digit5':
          setCurrentEffect('fractal-universe');
          break;
        case 'Digit6':
          setCurrentEffect('audio-visualizer');
          break;
        case 'Digit7':
          setCurrentEffect('motion-reactive');
          break;
        case 'Digit8':
          setCurrentEffect('fluid-dynamics');
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, toggleFullscreen, toggleUI, setCurrentEffect, resetEffectParams]);

  // マウス/タッチインタラクション
  useEffect(() => {
    let mouseTimeout: NodeJS.Timeout;

    const handleMouseMove = (event: MouseEvent) => {
      updateMousePosition(event.clientX, event.clientY);
      setMouseActive(true);

      // マウスが停止したら非アクティブにする
      clearTimeout(mouseTimeout);
      mouseTimeout = setTimeout(() => {
        setMouseActive(false);
      }, 2000);
    };

    const handleMouseLeave = () => {
      setMouseActive(false);
      clearTimeout(mouseTimeout);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        const touch = event.touches[0];
        updateMousePosition(touch.clientX, touch.clientY);
        setMouseActive(true);

        clearTimeout(mouseTimeout);
        mouseTimeout = setTimeout(() => {
          setMouseActive(false);
        }, 2000);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('touchmove', handleTouchMove);
      clearTimeout(mouseTimeout);
    };
  }, [updateMousePosition, setMouseActive]);

  // フルスクリーン変更の監視
  useEffect(() => {
    const handleFullscreenChange = () => {
      // フルスクリーン状態の同期は toggleFullscreen で行う
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // エフェクトエンジンのレンダリング
  const renderCurrentEffect = () => {
    switch (currentEffect) {
      case 'quantum-particles':
        return (
          <WebGLErrorBoundary>
            <QuantumParticles />
          </WebGLErrorBoundary>
        );
      case 'neural-flow':
        return (
          <WebGLErrorBoundary>
            <NeuralFlow />
          </WebGLErrorBoundary>
        );
      case 'cosmic-web':
        return (
          <WebGLErrorBoundary>
            <CosmicWeb />
          </WebGLErrorBoundary>
        );
      case 'dna-helix':
        return (
          <WebGLErrorBoundary>
            <DNAHelix />
          </WebGLErrorBoundary>
        );
      case 'fractal-universe':
        return (
          <WebGLErrorBoundary>
            <FractalUniverse />
          </WebGLErrorBoundary>
        );
      case 'audio-visualizer':
        return (
          <WebGLErrorBoundary>
            <AudioVisualizer />
          </WebGLErrorBoundary>
        );
      case 'motion-reactive':
        return (
          <WebGLErrorBoundary>
            <MotionReactive />
          </WebGLErrorBoundary>
        );
      case 'fluid-dynamics':
        return (
          <WebGLErrorBoundary>
            <FluidDynamics />
          </WebGLErrorBoundary>
        );
      default:
        return (
          <WebGLErrorBoundary>
            <QuantumParticles />
          </WebGLErrorBoundary>
        );
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* メインタイトル（初期表示時のみ） */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="text-center">
          <h1 className="text-6xl font-bold holographic mb-4">
            Day64 - Quantum Dream
          </h1>
          <p className="text-xl text-white/80 mb-8">
            次世代インタラクティブスクリーンセーバー
          </p>
          <div className="text-sm text-white/60">
            <div>Press Space to play/pause • F for fullscreen • H to hide UI</div>
            <div>Use 1-8 keys to switch effects • Mouse to interact</div>
          </div>
        </div>
      </div>

      {/* エフェクトエンジン */}
      <div className="absolute inset-0">
        {renderCurrentEffect()}
      </div>

      {/* UI オーバーレイ */}
      <div className="absolute inset-0 pointer-events-none z-50">
        {/* コントロールパネル */}
        <div className="pointer-events-auto">
          <ControlPanel />
        </div>

        {/* パフォーマンスモニター */}
        <div className="pointer-events-auto">
          <PerformanceMonitor />
        </div>
      </div>

      {/* 一時停止オーバーレイ */}
      {!isPlaying && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="text-center text-white">
            <div className="text-8xl mb-4">⏸️</div>
            <div className="text-2xl font-semibold">Paused</div>
            <div className="text-sm text-white/60 mt-2">Press Space to resume</div>
          </div>
        </div>
      )}

      {/* ローディング状態（必要に応じて） */}
      <div className="absolute bottom-4 right-4 text-white/40 text-xs font-mono z-50">
        <div>Effect: {currentEffect}</div>
        <div>Status: {isPlaying ? 'Running' : 'Paused'}</div>
      </div>
    </div>
  );
}
