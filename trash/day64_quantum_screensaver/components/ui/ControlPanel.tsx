'use client';

import { useState } from 'react';
import { useQuantumStore, EFFECT_METADATA, type EffectType } from '@/lib/store';

export default function ControlPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    currentEffect,
    isPlaying,
    isFullscreen,
    showUI,
    effectParams,
    setCurrentEffect,
    togglePlayback,
    toggleFullscreen,
    toggleUI,
    updateEffectParams,
    resetEffectParams,
  } = useQuantumStore();

  if (!showUI) return null;

  const handleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    toggleFullscreen();
  };

  return (
    <div className="control-panel glass-strong p-4 min-w-[280px] select-none">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg holographic">
          Quantum Dream
        </h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-white/60 hover:text-white transition-colors"
        >
          {isExpanded ? '🔼' : '🔽'}
        </button>
      </div>

      {/* 基本コントロール */}
      <div className="space-y-3">
        {/* 再生/停止 */}
        <div className="flex gap-2">
          <button
            onClick={togglePlayback}
            className={`
              flex-1 py-2 px-4 rounded-lg font-medium transition-all
              ${isPlaying
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-300 border border-green-500/40 hover:bg-green-500/30'
              }
            `}
          >
            {isPlaying ? '⏸️ Pause' : '▶️ Play'}
          </button>

          <button
            onClick={handleFullscreen}
            className="
              py-2 px-4 rounded-lg font-medium transition-all
              bg-blue-500/20 text-blue-300 border border-blue-500/40
              hover:bg-blue-500/30
            "
          >
            {isFullscreen ? '🪟' : '🖥️'}
          </button>

          <button
            onClick={toggleUI}
            className="
              py-2 px-4 rounded-lg font-medium transition-all
              bg-purple-500/20 text-purple-300 border border-purple-500/40
              hover:bg-purple-500/30
            "
          >
            👁️
          </button>
        </div>

        {/* エフェクト選択 */}
        <div>
          <label className="block text-white/80 text-sm mb-2">Effect Engine</label>
          <select
            value={currentEffect}
            onChange={(e) => setCurrentEffect(e.target.value as EffectType)}
            className="
              w-full p-2 rounded-lg bg-black/40 border border-white/20
              text-white focus:border-cyan-400 focus:outline-none
            "
          >
            {Object.entries(EFFECT_METADATA).map(([key, meta]) => (
              <option key={key} value={key} className="bg-black">
                {meta.name} - {meta.description}
              </option>
            ))}
          </select>

          {/* エフェクト情報 */}
          <div className="mt-2 text-xs text-white/60">
            <div>Complexity:
              <span className={`ml-1 ${
                EFFECT_METADATA[currentEffect].complexity === 'extreme' ? 'text-red-400' :
                EFFECT_METADATA[currentEffect].complexity === 'high' ? 'text-orange-400' :
                EFFECT_METADATA[currentEffect].complexity === 'medium' ? 'text-yellow-400' :
                'text-green-400'
              }`}>
                {EFFECT_METADATA[currentEffect].complexity}
              </span>
            </div>
            <div>Required: {EFFECT_METADATA[currentEffect].requiredFeatures.join(', ')}</div>
          </div>
        </div>

        {isExpanded && (
          <>
            {/* パラメータ調整 */}
            <div className="space-y-3 pt-3 border-t border-white/20">
              <h3 className="text-white/80 text-sm font-medium">Parameters</h3>

              {/* パーティクル数 */}
              <div>
                <label className="block text-white/70 text-xs mb-1">
                  Particle Count: {effectParams.particleCount}
                </label>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="100"
                  value={effectParams.particleCount}
                  onChange={(e) => updateEffectParams({ particleCount: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* 速度 */}
              <div>
                <label className="block text-white/70 text-xs mb-1">
                  Speed: {effectParams.speed.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="3.0"
                  step="0.1"
                  value={effectParams.speed}
                  onChange={(e) => updateEffectParams({ speed: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* スケール */}
              <div>
                <label className="block text-white/70 text-xs mb-1">
                  Scale: {effectParams.scale.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={effectParams.scale}
                  onChange={(e) => updateEffectParams({ scale: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* 強度 */}
              <div>
                <label className="block text-white/70 text-xs mb-1">
                  Intensity: {Math.round(effectParams.intensity * 100)}%
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={effectParams.intensity}
                  onChange={(e) => updateEffectParams({ intensity: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* インタラクション感度 */}
              <div>
                <label className="block text-white/70 text-xs mb-1">
                  Interaction: {Math.round(effectParams.interactionSensitivity * 100)}%
                </label>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.1"
                  value={effectParams.interactionSensitivity}
                  onChange={(e) => updateEffectParams({ interactionSensitivity: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* カラースキーム */}
              <div>
                <label className="block text-white/70 text-xs mb-1">Color Scheme</label>
                <select
                  value={effectParams.colorScheme}
                  onChange={(e) => updateEffectParams({ colorScheme: e.target.value })}
                  className="
                    w-full p-2 rounded bg-black/40 border border-white/20
                    text-white text-xs focus:border-cyan-400 focus:outline-none
                  "
                >
                  <option value="quantum">Quantum (Blue-Purple)</option>
                  <option value="neural">Neural (Pink-Orange)</option>
                  <option value="cosmic">Cosmic (Deep Space)</option>
                  <option value="dna">DNA (Green-Yellow)</option>
                  <option value="rainbow">Rainbow (Full Spectrum)</option>
                  <option value="monochrome">Monochrome (White)</option>
                </select>
              </div>

              {/* リセットボタン */}
              <button
                onClick={resetEffectParams}
                className="
                  w-full py-2 px-4 rounded-lg font-medium transition-all text-sm
                  bg-gray-500/20 text-gray-300 border border-gray-500/40
                  hover:bg-gray-500/30
                "
              >
                🔄 Reset Parameters
              </button>
            </div>

            {/* 高度な設定 */}
            <div className="space-y-3 pt-3 border-t border-white/20">
              <h3 className="text-white/80 text-sm font-medium">Advanced</h3>

              {/* プリセット */}
              <div>
                <label className="block text-white/70 text-xs mb-2">Effect Presets</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateEffectParams({
                      particleCount: 5000,
                      speed: 1.5,
                      intensity: 1.0,
                      scale: 1.2,
                    })}
                    className="
                      py-2 px-3 rounded text-xs transition-all
                      bg-red-500/20 text-red-300 border border-red-500/40
                      hover:bg-red-500/30
                    "
                  >
                    🔥 Intense
                  </button>
                  <button
                    onClick={() => updateEffectParams({
                      particleCount: 1000,
                      speed: 0.5,
                      intensity: 0.6,
                      scale: 0.8,
                    })}
                    className="
                      py-2 px-3 rounded text-xs transition-all
                      bg-blue-500/20 text-blue-300 border border-blue-500/40
                      hover:bg-blue-500/30
                    "
                  >
                    ❄️ Calm
                  </button>
                  <button
                    onClick={() => updateEffectParams({
                      particleCount: 3000,
                      speed: 2.0,
                      intensity: 0.8,
                      scale: 1.5,
                    })}
                    className="
                      py-2 px-3 rounded text-xs transition-all
                      bg-purple-500/20 text-purple-300 border border-purple-500/40
                      hover:bg-purple-500/30
                    "
                  >
                    ⚡ Dynamic
                  </button>
                  <button
                    onClick={() => updateEffectParams({
                      particleCount: 500,
                      speed: 0.3,
                      intensity: 0.4,
                      scale: 0.6,
                    })}
                    className="
                      py-2 px-3 rounded text-xs transition-all
                      bg-green-500/20 text-green-300 border border-green-500/40
                      hover:bg-green-500/30
                    "
                  >
                    🌱 Minimal
                  </button>
                </div>
              </div>

              {/* キーボードショートカット */}
              <div className="text-xs text-white/60">
                <div className="font-medium mb-1">Keyboard Shortcuts:</div>
                <div>Space: Play/Pause</div>
                <div>F: Fullscreen</div>
                <div>H: Hide UI</div>
                <div>1-8: Switch Effects</div>
                <div>R: Reset Parameters</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
