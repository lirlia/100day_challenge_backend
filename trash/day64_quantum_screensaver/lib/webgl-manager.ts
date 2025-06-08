'use client';

import * as THREE from 'three';

/**
 * シングルトンWebGLマネージャー
 * 複数のエフェクトエンジン間でWebGLコンテキストの共有と適切な管理を行う
 */
class WebGLManager {
  private static instance: WebGLManager;
  private renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private currentEffect: string | null = null;
  private activeScenes: Map<string, {
    scene: THREE.Scene;
    camera: THREE.Camera;
    cleanup: () => void;
    update?: (deltaTime: number) => void;
  }> = new Map();
  private animationId: number | null = null;
  private isPlaying: boolean = true;

  private constructor() {}

  static getInstance(): WebGLManager {
    if (!WebGLManager.instance) {
      WebGLManager.instance = new WebGLManager();
    }
    return WebGLManager.instance;
  }

  /**
   * WebGLレンダラーを初期化または取得
   */
  getRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
    if (!this.renderer || this.canvas !== canvas) {
      // 既存のレンダラーがあれば破棄
      if (this.renderer) {
        console.log('🔄 WebGL Manager: Disposing existing renderer');
        this.renderer.dispose();
      }

      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: false,
      });

      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      console.log('🎮 WebGL Manager: New renderer created');
    }

    return this.renderer;
  }

    /**
   * エフェクトのシーンを登録
   */
  registerEffect(
    effectId: string,
    scene: THREE.Scene,
    camera: THREE.Camera,
    cleanup: () => void,
    update?: (deltaTime: number) => void
  ) {
    // 既存のエフェクトがあれば削除
    if (this.activeScenes.has(effectId)) {
      this.unregisterEffect(effectId);
    }

    this.activeScenes.set(effectId, { scene, camera, cleanup, update });
    console.log(`🎨 WebGL Manager: Registered effect '${effectId}'`);
  }

  /**
   * エフェクトのシーンを登録解除
   */
  unregisterEffect(effectId: string) {
    const effect = this.activeScenes.get(effectId);
    if (effect) {
      effect.cleanup();
      this.activeScenes.delete(effectId);
      console.log(`🗑️ WebGL Manager: Unregistered effect '${effectId}'`);
    }
  }

  /**
   * アクティブなエフェクトを設定
   */
  setActiveEffect(effectId: string) {
    this.currentEffect = effectId;
  }

  /**
   * 現在のエフェクトをレンダリング
   */
  render() {
    if (!this.renderer || !this.currentEffect) return;

    const effect = this.activeScenes.get(this.currentEffect);
    if (effect) {
      this.renderer.render(effect.scene, effect.camera);
    }
  }

  /**
   * 統合アニメーションループを開始
   */
  startAnimation() {
    if (this.animationId || !this.isPlaying) return;

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      if (!this.isPlaying) return;

      // パフォーマンス監視開始
      if (typeof window !== 'undefined' && (window as any).performanceMonitor) {
        (window as any).performanceMonitor.frameStart();
      }

      const deltaTime = (currentTime - lastTime) / 1000; // 秒に変換
      lastTime = currentTime;

      // 現在のエフェクトの更新処理を実行
      if (this.currentEffect) {
        const effect = this.activeScenes.get(this.currentEffect);
        if (effect?.update) {
          effect.update(deltaTime);
        }
      }

      // レンダリング
      this.render();

      // パフォーマンス監視終了
      if (typeof window !== 'undefined' && (window as any).performanceMonitor) {
        (window as any).performanceMonitor.frameEnd();
      }

      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
    console.log('🎬 WebGL Manager: Animation loop started');
  }

  /**
   * アニメーションループを停止
   */
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      console.log('⏸️ WebGL Manager: Animation loop stopped');
    }
  }

  /**
   * 再生状態を設定
   */
  setPlaying(playing: boolean) {
    this.isPlaying = playing;
    if (playing) {
      this.startAnimation();
    } else {
      this.stopAnimation();
    }
  }

  /**
   * ウィンドウリサイズ時の処理
   */
  handleResize() {
    if (this.renderer && this.canvas) {
      const camera = this.getCurrentCamera();
      if (camera && 'aspect' in camera) {
        (camera as THREE.PerspectiveCamera).aspect = window.innerWidth / window.innerHeight;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }

      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  /**
   * 現在のカメラを取得
   */
  private getCurrentCamera(): THREE.Camera | null {
    if (!this.currentEffect) return null;

    const effect = this.activeScenes.get(this.currentEffect);
    return effect ? effect.camera : null;
  }

    /**
   * 全体をクリーンアップ
   */
  dispose() {
    console.log('💀 WebGL Manager: Disposing all resources');

    // アニメーションを停止
    this.stopAnimation();

    // 全エフェクトをクリーンアップ
    for (const [effectId] of this.activeScenes) {
      this.unregisterEffect(effectId);
    }

    // レンダラーを破棄
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    this.canvas = null;
    this.currentEffect = null;
  }

  /**
   * デバッグ情報
   */
  getDebugInfo() {
    return {
      hasRenderer: !!this.renderer,
      currentEffect: this.currentEffect,
      activeEffects: Array.from(this.activeScenes.keys()),
      canvas: this.canvas?.tagName || 'none'
    };
  }
}

export const webglManager = WebGLManager.getInstance();
