'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            Day64 - TinyEngine
          </h1>
          <p className="text-xl text-blue-200 mb-2">
            シンプル2Dゲームエンジン管理画面
          </p>
          <p className="text-lg text-blue-300">
            Goで作られたゲームエンジンのアセット・レベル管理システム
          </p>
        </header>

        {/* 機能カード */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {/* アセット管理 */}
          <Link href="/assets" className="group">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105">
              <div className="text-4xl mb-4">🎨</div>
              <h3 className="text-xl font-semibold text-white mb-2">アセット管理</h3>
              <p className="text-blue-200">
                ゲーム用の画像・音声ファイルをアップロード・管理
              </p>
            </div>
          </Link>

          {/* レベルエディタ */}
          <Link href="/editor" className="group">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105">
              <div className="text-4xl mb-4">🏗️</div>
              <h3 className="text-xl font-semibold text-white mb-2">レベルエディタ</h3>
              <p className="text-blue-200">
                ドラッグ&ドロップでゲームステージを作成・編集
              </p>
            </div>
          </Link>

          {/* ゲーム設定 */}
          <Link href="/settings" className="group">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 hover:bg-white/20 transition-all duration-300 transform hover:scale-105">
              <div className="text-4xl mb-4">⚙️</div>
              <h3 className="text-xl font-semibold text-white mb-2">ゲーム設定</h3>
              <p className="text-blue-200">
                プレイヤー速度・重力などのパラメータ調整
              </p>
            </div>
          </Link>
        </div>

        {/* ゲーム起動セクション */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">🎮 ゲーム起動</h2>
          <p className="text-blue-200 mb-6">
            ターミナルで以下のコマンドを実行してゲームを起動してください：
          </p>
          <div className="bg-black/30 rounded-lg p-4 font-mono text-green-300">
            <code>npm run dev-game</code>
          </div>
          <div className="mt-4 text-sm text-blue-300">
            <p>操作方法：</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>移動: 左右矢印キー または A/Dキー</li>
              <li>ジャンプ: スペースキー</li>
              <li>終了: ESCキー</li>
            </ul>
          </div>
        </div>

        {/* エンジン情報 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-4">🔧 エンジン情報</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">主要機能</h3>
              <ul className="text-blue-200 space-y-1">
                <li>• 2D描画システム (Ebiten)</li>
                <li>• 物理エンジン (衝突検出・重力)</li>
                <li>• 入力システム (キーボード・マウス)</li>
                <li>• アセット管理</li>
                <li>• シーン管理</li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">技術スタック</h3>
              <ul className="text-blue-200 space-y-1">
                <li>• Go + Ebiten v2</li>
                <li>• Next.js 15 (App Router)</li>
                <li>• TypeScript</li>
                <li>• SQLite + better-sqlite3</li>
                <li>• Tailwind CSS v4</li>
              </ul>
            </div>
          </div>
        </div>

        {/* フッター */}
        <footer className="text-center mt-12 text-blue-300">
          <p>Day64 / 100日チャレンジ - バックエンド学習プロジェクト</p>
        </footer>
      </div>
    </div>
  );
}
