/**
 * Performance Monitor for Quantum Screensaver
 * リアルタイムパフォーマンス監視とアダプティブ品質調整
 */

export interface PerformanceData {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  gpuMemory: number;
  renderTime: number;
  particleCount: number;
  timestamp: number;
}

export interface QualitySettings {
  particleCount: number;
  renderScale: number;
  shadowQuality: number;
  textureQuality: number;
  effectIntensity: number;
}

export class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private frameStartTime = 0;
  private fpsHistory: number[] = [];
  private memoryHistory: number[] = [];
  private renderTimeHistory: number[] = [];

  private readonly maxHistorySize = 60; // 1秒分のデータ (60fps)
  private readonly targetFPS = 60;
  private readonly minFPS = 30;

  private callback?: (data: PerformanceData) => void;
  private qualityCallback?: (settings: QualitySettings) => void;

  private adaptiveQualityEnabled = true;
  private currentQuality: QualitySettings = {
    particleCount: 1000,
    renderScale: 1.0,
    shadowQuality: 1.0,
    textureQuality: 1.0,
    effectIntensity: 1.0,
  };

  constructor() {
    console.log('📊 Performance Monitor initialized');
  }

  /**
   * フレーム開始時刻を記録
   */
  frameStart(): void {
    this.frameStartTime = performance.now();
  }

  /**
   * フレーム終了時刻を記録し、パフォーマンスデータを更新
   */
  frameEnd(): void {
    const now = performance.now();
    const frameTime = now - this.frameStartTime;
    const deltaTime = now - this.lastTime;

    this.frameCount++;

    // FPS計算 (1秒ごと)
    if (deltaTime >= 1000) {
      const fps = (this.frameCount * 1000) / deltaTime;
      this.addToHistory(this.fpsHistory, fps);

      // メモリ使用量の取得
      const memoryUsage = this.getMemoryUsage();
      this.addToHistory(this.memoryHistory, memoryUsage);

      // レンダリング時間
      this.addToHistory(this.renderTimeHistory, frameTime);

      const performanceData: PerformanceData = {
        fps: Math.round(fps * 10) / 10,
        frameTime: Math.round(frameTime * 100) / 100,
        memoryUsage,
        gpuMemory: this.getGPUMemoryUsage(),
        renderTime: frameTime,
        particleCount: this.currentQuality.particleCount,
        timestamp: now,
      };

      // コールバック実行
      if (this.callback) {
        this.callback(performanceData);
      }

      // アダプティブ品質調整
      if (this.adaptiveQualityEnabled) {
        this.adjustQuality(fps);
      }

      // リセット
      this.frameCount = 0;
      this.lastTime = now;
    }
  }

  /**
   * パフォーマンスデータのコールバック設定
   */
  onPerformanceUpdate(callback: (data: PerformanceData) => void): void {
    this.callback = callback;
  }

  /**
   * 品質設定変更のコールバック設定
   */
  onQualityUpdate(callback: (settings: QualitySettings) => void): void {
    this.qualityCallback = callback;
  }

  /**
   * アダプティブ品質調整の有効/無効切替
   */
  setAdaptiveQuality(enabled: boolean): void {
    this.adaptiveQualityEnabled = enabled;
    console.log(`🎛️ Adaptive quality: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 履歴配列に値を追加し、サイズ制限を適用
   */
  private addToHistory(history: number[], value: number): void {
    history.push(value);
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * メモリ使用量を取得 (MB)
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1024 / 1024 * 10) / 10;
    }
    return 0;
  }

  /**
   * GPU メモリ使用量を推定 (WebGL情報から)
   */
  private getGPUMemoryUsage(): number {
    // WebGL コンテキストからGPU情報を取得
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (!gl) return 0;

    try {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        // GPU固有の情報は取得できないため、推定値を返す
        return Math.round(this.currentQuality.particleCount * 0.001); // 1パーティクル = 1KB と仮定
      }
    } catch (e) {
      // GPU情報取得に失敗
    }

    return 0;
  }

  /**
   * パフォーマンスに基づく品質自動調整
   */
  private adjustQuality(currentFPS: number): void {
    const avgFPS = this.getAverageFPS();
    let qualityChanged = false;

    // FPSが低い場合は品質を下げる
    if (avgFPS < this.minFPS) {
      if (this.currentQuality.particleCount > 100) {
        this.currentQuality.particleCount = Math.max(100, this.currentQuality.particleCount * 0.8);
        qualityChanged = true;
      }

      if (this.currentQuality.renderScale > 0.5) {
        this.currentQuality.renderScale = Math.max(0.5, this.currentQuality.renderScale * 0.9);
        qualityChanged = true;
      }

      if (this.currentQuality.effectIntensity > 0.3) {
        this.currentQuality.effectIntensity = Math.max(0.3, this.currentQuality.effectIntensity * 0.9);
        qualityChanged = true;
      }

      if (qualityChanged) {
        console.log(`📉 Quality reduced due to low FPS (${avgFPS.toFixed(1)})`);
      }
    }

    // FPSが十分高い場合は品質を上げる
    else if (avgFPS > this.targetFPS * 0.9 && avgFPS < this.targetFPS * 1.1) {
      if (this.currentQuality.particleCount < 5000) {
        this.currentQuality.particleCount = Math.min(5000, this.currentQuality.particleCount * 1.1);
        qualityChanged = true;
      }

      if (this.currentQuality.renderScale < 1.0) {
        this.currentQuality.renderScale = Math.min(1.0, this.currentQuality.renderScale * 1.05);
        qualityChanged = true;
      }

      if (this.currentQuality.effectIntensity < 1.0) {
        this.currentQuality.effectIntensity = Math.min(1.0, this.currentQuality.effectIntensity * 1.05);
        qualityChanged = true;
      }

      if (qualityChanged) {
        console.log(`📈 Quality increased due to stable FPS (${avgFPS.toFixed(1)})`);
      }
    }

    // 品質設定が変更された場合はコールバック実行
    if (qualityChanged && this.qualityCallback) {
      this.qualityCallback({ ...this.currentQuality });
    }
  }

  /**
   * 平均FPSを計算
   */
  private getAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 60;

    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return sum / this.fpsHistory.length;
  }

  /**
   * 平均レンダリング時間を計算
   */
  getAverageRenderTime(): number {
    if (this.renderTimeHistory.length === 0) return 16;

    const sum = this.renderTimeHistory.reduce((a, b) => a + b, 0);
    return sum / this.renderTimeHistory.length;
  }

  /**
   * パフォーマンス統計を取得
   */
  getStats() {
    return {
      avgFPS: this.getAverageFPS(),
      avgRenderTime: this.getAverageRenderTime(),
      avgMemory: this.memoryHistory.length > 0
        ? this.memoryHistory.reduce((a, b) => a + b, 0) / this.memoryHistory.length
        : 0,
      currentQuality: { ...this.currentQuality },
      historySize: this.fpsHistory.length,
    };
  }

  /**
   * 手動品質設定
   */
  setQuality(settings: Partial<QualitySettings>): void {
    this.currentQuality = { ...this.currentQuality, ...settings };
    console.log('🎛️ Manual quality adjustment:', settings);

    if (this.qualityCallback) {
      this.qualityCallback({ ...this.currentQuality });
    }
  }

  /**
   * 品質プリセット適用
   */
  setQualityPreset(preset: 'ultra' | 'high' | 'medium' | 'low' | 'potato'): void {
    const presets = {
      ultra: {
        particleCount: 5000,
        renderScale: 1.0,
        shadowQuality: 1.0,
        textureQuality: 1.0,
        effectIntensity: 1.0,
      },
      high: {
        particleCount: 3000,
        renderScale: 1.0,
        shadowQuality: 0.8,
        textureQuality: 0.8,
        effectIntensity: 0.9,
      },
      medium: {
        particleCount: 1000,
        renderScale: 0.8,
        shadowQuality: 0.6,
        textureQuality: 0.6,
        effectIntensity: 0.7,
      },
      low: {
        particleCount: 500,
        renderScale: 0.6,
        shadowQuality: 0.4,
        textureQuality: 0.4,
        effectIntensity: 0.5,
      },
      potato: {
        particleCount: 100,
        renderScale: 0.4,
        shadowQuality: 0.2,
        textureQuality: 0.2,
        effectIntensity: 0.3,
      },
    };

    this.setQuality(presets[preset]);
    console.log(`🎮 Quality preset applied: ${preset}`);
  }

  /**
   * パフォーマンス監視停止
   */
  stop(): void {
    this.callback = undefined;
    this.qualityCallback = undefined;
    console.log('📊 Performance monitoring stopped');
  }
}

// グローバルパフォーマンス監視インスタンス
export const performanceMonitor = new PerformanceMonitor();
