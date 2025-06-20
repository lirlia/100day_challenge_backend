'use client'

import { useEffect, useState } from 'react'

interface SystemStatus {
  totalNodes: number
  activeConnections: number
  totalOperations: number
  lastSync: string
}

export default function HomePage() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSystemStatus = async () => {
      try {
        const response = await fetch('/api/nodes')
        if (response.ok) {
          const nodes = await response.json()
          setSystemStatus({
            totalNodes: nodes.length,
            activeConnections: nodes.filter((n: any) => n.status === 'active').length,
            totalOperations: 0, // TODO: 実際の操作数を取得
            lastSync: new Date().toLocaleString('ja-JP')
          })
        }
      } catch (error) {
        console.error('システム状態の取得に失敗:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSystemStatus()
    const interval = setInterval(fetchSystemStatus, 5000) // 5秒ごとに更新

    return () => clearInterval(interval)
  }, [])

  const crdtTypes = [
    {
      name: 'G-Counter',
      description: '増加専用分散カウンター',
      status: 'active',
      color: 'green'
    },
    {
      name: 'PN-Counter',
      description: '増減可能分散カウンター',
      status: 'pending',
      color: 'blue'
    },
    {
      name: 'G-Set',
      description: '追加専用分散セット',
      status: 'pending',
      color: 'purple'
    },
    {
      name: 'OR-Set',
      description: '削除可能分散セット',
      status: 'pending',
      color: 'pink'
    },
    {
      name: 'LWW-Register',
      description: 'Last-Writer-Wins レジスタ',
      status: 'pending',
      color: 'orange'
    },
    {
      name: 'RGA',
      description: 'Replicated Growable Array',
      status: 'pending',
      color: 'cyan'
    },
    {
      name: 'AWORMap',
      description: 'Add-Wins OR-Map',
      status: 'pending',
      color: 'purple'
    }
  ]

  const demoApps = [
    {
      name: '協調テキストエディタ',
      description: 'RGAを使用したリアルタイム文書編集',
      technology: 'RGA',
      status: 'pending'
    },
    {
      name: '共有カウンター',
      description: 'G-Counterによる分散カウンター',
      technology: 'G-Counter',
      status: 'active'
    },
    {
      name: '協調TODOリスト',
      description: 'OR-Setを使った共有タスク管理',
      technology: 'OR-Set',
      status: 'pending'
    },
    {
      name: '分散投票システム',
      description: 'PN-Counterによる投票集計',
      technology: 'PN-Counter',
      status: 'pending'
    },
    {
      name: '共有設定管理',
      description: 'LWW-Registerによる設定同期',
      technology: 'LWW-Register',
      status: 'pending'
    },
    {
      name: 'チーム白板',
      description: 'AWORMapを使った協調ドローイング',
      technology: 'AWORMap',
      status: 'pending'
    }
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center main-content">
        <div className="text-center">
          <div className="neon-text text-2xl font-bold glitch">
            SYSTEM INITIALIZING...
          </div>
          <div className="mt-4 text-gray-400">
            分散システムを起動中
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen main-content">
      {/* ヘッダー */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold neon-text glitch">
                Day67 - CRDT分散システム
              </h1>
              <p className="mt-2 text-gray-400">
                Conflict-free Replicated Data Types の実装と可視化
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <span className="data-badge">
                SYSTEM ONLINE
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* システム状態 */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold neon-text-blue mb-6">
            システム状態
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="cyber-card p-6 pulse-glow">
              <div className="text-3xl font-bold neon-text">
                {systemStatus?.totalNodes || 0}
              </div>
              <div className="text-gray-400 mt-2">総ノード数</div>
            </div>
            <div className="cyber-card p-6">
              <div className="text-3xl font-bold neon-text-pink">
                {systemStatus?.activeConnections || 0}
              </div>
              <div className="text-gray-400 mt-2">アクティブ接続</div>
            </div>
            <div className="cyber-card p-6">
              <div className="text-3xl font-bold neon-text-blue">
                {systemStatus?.totalOperations || 0}
              </div>
              <div className="text-gray-400 mt-2">総操作数</div>
            </div>
            <div className="cyber-card p-6">
              <div className="text-sm text-gray-300">
                最終同期
              </div>
              <div className="text-lg font-mono text-gray-400 mt-1">
                {systemStatus?.lastSync}
              </div>
            </div>
          </div>
        </section>

        {/* CRDTタイプ */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold neon-text-pink mb-6">
            CRDT実装タイプ
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {crdtTypes.map((crdt, index) => (
              <div
                key={crdt.name}
                className={`cyber-card p-6 ${crdt.status === 'active' ? 'hologram' : ''}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">
                    {crdt.name}
                  </h3>
                  <span
                    className={`data-badge ${crdt.status === 'active' ? 'border-green-400 text-green-400' : 'border-gray-500 text-gray-500'
                      }`}
                  >
                    {crdt.status === 'active' ? 'ACTIVE' : 'PENDING'}
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  {crdt.description}
                </p>
                <button
                  className={`cyber-btn w-full ${crdt.status === 'active' ? '' : 'opacity-50 cursor-not-allowed'
                    }`}
                  disabled={crdt.status !== 'active'}
                >
                  {crdt.status === 'active' ? 'デモを開始' : '開発中'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* デモアプリケーション */}
        <section>
          <h2 className="text-2xl font-bold neon-text mb-6">
            デモアプリケーション
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demoApps.map((app, index) => (
              <div
                key={app.name}
                className={`cyber-card p-6 ${app.status === 'active' ? 'pulse-glow' : ''}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">
                    {app.name}
                  </h3>
                  <span
                    className={`data-badge ${app.status === 'active' ? 'border-green-400 text-green-400' : 'border-gray-500 text-gray-500'
                      }`}
                  >
                    {app.technology}
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  {app.description}
                </p>
                <button
                  className={`cyber-btn-blue w-full ${app.status === 'active' ? '' : 'opacity-50 cursor-not-allowed'
                    }`}
                  disabled={app.status !== 'active'}
                >
                  {app.status === 'active' ? 'アプリを開く' : '準備中'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* フッター */}
        <footer className="mt-16 border-t border-gray-800 pt-8">
          <div className="text-center text-gray-500">
            <p className="font-mono">
              CRDT DISTRIBUTED SYSTEM v1.0.0 | Phase 1 Complete
            </p>
            <p className="mt-2 text-sm">
              分散システムの未来を体験しよう
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
