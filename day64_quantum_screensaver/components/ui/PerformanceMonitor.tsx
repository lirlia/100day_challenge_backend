'use client';

import { useEffect, useState } from 'react';
import { useQuantumStore } from '@/lib/store';
import { performanceMonitor, type PerformanceData } from '@/lib/performance/monitor';

export default function PerformanceMonitor() {
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { showUI, adaptiveQuality, setAdaptiveQuality } = useQuantumStore();

  useEffect(() => {
    // パフォーマンスデータの更新コールバック設定
    performanceMonitor.onPerformanceUpdate((data: PerformanceData) => {
      setPerfData(data);
    });

    return () => {
      performanceMonitor.stop();
    };
  }, []);

  if (!showUI || !perfData) return null;

  const getFPSColor = (fps: number) => {
    if (fps >= 55) return 'text-green-400';
    if (fps >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getMemoryColor = (memory: number) => {
    if (memory < 100) return 'text-green-400';
    if (memory < 200) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="perf-monitor glass p-3 text-white/90 select-none">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setShowDetails(!showDetails)}
      >
        <div className="text-blue-400 text-xs font-mono">📊</div>
        <div className="text-xs font-mono">
          <span className={getFPSColor(perfData.fps)}>
            {perfData.fps.toFixed(1)} FPS
          </span>
          <span className="text-white/60 mx-1">|</span>
          <span className={getMemoryColor(perfData.memoryUsage)}>
            {perfData.memoryUsage.toFixed(1)}MB
          </span>
        </div>
      </div>

      {showDetails && (
        <div className="mt-2 space-y-1 text-xs font-mono">
          {/* パフォーマンス詳細 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-white/60">Frame Time:</div>
              <div className="text-cyan-300">{perfData.frameTime.toFixed(2)}ms</div>
            </div>
            <div>
              <div className="text-white/60">Render Time:</div>
              <div className="text-cyan-300">{perfData.renderTime.toFixed(2)}ms</div>
            </div>
            <div>
              <div className="text-white/60">Particles:</div>
              <div className="text-purple-300">{perfData.particleCount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-white/60">GPU Memory:</div>
              <div className="text-orange-300">{perfData.gpuMemory.toFixed(1)}MB</div>
            </div>
          </div>

          {/* アダプティブ品質コントロール */}
          <div className="mt-3 pt-2 border-t border-white/20">
            <div className="flex items-center justify-between">
              <span className="text-white/80">Adaptive Quality</span>
              <button
                onClick={() => setAdaptiveQuality(!adaptiveQuality)}
                className={`
                  px-2 py-1 rounded text-xs transition-colors
                  ${adaptiveQuality
                    ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/40'
                  }
                `}
              >
                {adaptiveQuality ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* 品質プリセット */}
          <div className="mt-2">
            <div className="text-white/60 mb-1">Quality Presets:</div>
            <div className="flex gap-1">
              {(['potato', 'low', 'medium', 'high', 'ultra'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => performanceMonitor.setQualityPreset(preset)}
                  className="
                    px-2 py-1 bg-white/10 hover:bg-white/20
                    border border-white/20 rounded text-xs
                    transition-colors capitalize
                  "
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* パフォーマンス統計 */}
          <div className="mt-2 pt-2 border-t border-white/20">
            <div className="text-white/60 text-xs">Performance Stats:</div>
            <div className="text-xs">
              <div>Avg FPS: <span className="text-cyan-300">{perfData.fps.toFixed(1)}</span></div>
              <div>Avg Memory: <span className="text-cyan-300">{perfData.memoryUsage.toFixed(1)}MB</span></div>
              <div>
                Status:
                <span className={`ml-1 ${
                  perfData.fps >= 55 ? 'text-green-400' :
                  perfData.fps >= 30 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {perfData.fps >= 55 ? 'Excellent' :
                   perfData.fps >= 30 ? 'Good' : 'Poor'}
                </span>
              </div>
            </div>
          </div>

          {/* 技術情報 */}
          <div className="mt-2 pt-2 border-t border-white/20">
            <div className="text-white/60 text-xs">Tech Info:</div>
            <div className="text-xs space-y-1">
              <div>WebGL: <span className="text-green-300">2.0</span></div>
              <div>Pixel Ratio: <span className="text-blue-300">{window.devicePixelRatio}</span></div>
              <div>
                Resolution:
                <span className="text-blue-300 ml-1">
                  {window.innerWidth}×{window.innerHeight}
                </span>
              </div>
              <div>
                Browser:
                <span className="text-purple-300 ml-1">
                  {navigator.userAgent.includes('Chrome') ? 'Chrome' :
                   navigator.userAgent.includes('Firefox') ? 'Firefox' :
                   navigator.userAgent.includes('Safari') ? 'Safari' : 'Unknown'}
                </span>
              </div>
            </div>
          </div>

          {/* 警告表示 */}
          {perfData.fps < 30 && (
            <div className="mt-2 p-2 bg-red-500/20 border border-red-500/40 rounded text-xs">
              <div className="text-red-300 font-semibold">⚠️ Performance Warning</div>
              <div className="text-red-200">
                Low FPS detected. Consider reducing quality or closing other applications.
              </div>
            </div>
          )}

          {perfData.memoryUsage > 200 && (
            <div className="mt-2 p-2 bg-yellow-500/20 border border-yellow-500/40 rounded text-xs">
              <div className="text-yellow-300 font-semibold">💾 Memory Warning</div>
              <div className="text-yellow-200">
                High memory usage detected. Consider reducing particle count.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
