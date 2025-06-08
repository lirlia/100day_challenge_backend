'use client'

import { detectWebGL, getWebGLErrorMessage } from '@/lib/webgl-detector'
import FallbackCanvas from '@/components/engines/FallbackCanvas'

interface WebGLErrorFallbackProps {
  error?: Error
  children?: React.ReactNode
}

export default function WebGLErrorFallback({ error, children }: WebGLErrorFallbackProps) {
  const capabilities = detectWebGL()
  const errorMessage = getWebGLErrorMessage(capabilities)

  if (capabilities.hasWebGL && !error) {
    return <>{children}</>
  }

  return (
    <div className="w-full h-full relative bg-black">
      {/* Fallback Canvas Effect */}
      <FallbackCanvas />

      {/* Error Information Overlay */}
      <div className="absolute top-4 left-4 right-4 z-10">
        <div className="bg-black/80 backdrop-blur-sm border border-red-500/30 rounded-lg p-4 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-2xl">⚠️</div>
            <div>
              <h3 className="font-bold text-red-400">WebGL エラー</h3>
              <p className="text-sm text-white/70">3D描画機能が利用できません</p>
            </div>
          </div>

          {error && (
            <div className="mb-3 p-3 bg-red-900/30 rounded border border-red-500/30">
              <p className="text-sm font-mono text-red-300">
                {error.message}
              </p>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <details className="cursor-pointer">
              <summary className="text-blue-400 hover:text-blue-300">
                詳細情報とトラブルシューティング
              </summary>
              <div className="mt-2 pl-4 space-y-2 text-white/80">
                <pre className="whitespace-pre-line text-xs bg-black/50 p-2 rounded">
                  {errorMessage}
                </pre>

                <div>
                  <h4 className="font-semibold text-white mb-1">システム情報:</h4>
                  <ul className="text-xs space-y-1 text-white/60">
                    <li>WebGL: {capabilities.hasWebGL ? '利用可能' : '利用不可'}</li>
                    <li>WebGL2: {capabilities.hasWebGL2 ? '利用可能' : '利用不可'}</li>
                    <li>レンダラー: {capabilities.renderer}</li>
                    <li>ベンダー: {capabilities.vendor}</li>
                    <li>バージョン: {capabilities.version}</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-white mb-1">推奨ブラウザ:</h4>
                  <ul className="text-xs space-y-1 text-white/60">
                    <li>• Chrome 最新版</li>
                    <li>• Firefox 最新版</li>
                    <li>• Safari 最新版</li>
                    <li>• Edge 最新版</li>
                  </ul>
                </div>
              </div>
            </details>
          </div>

          <div className="mt-3 pt-3 border-t border-white/20">
            <p className="text-xs text-white/60">
              💡 現在はCanvas 2Dフォールバックモードで動作しています
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
