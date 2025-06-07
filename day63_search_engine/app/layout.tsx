import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Day63 - 検索エンジン",
  description: "本格的な検索エンジンによる情報検索理論・転置インデックス・TF-IDFアルゴリズムの学習",
  keywords: ["検索エンジン", "TF-IDF", "転置インデックス", "PageRank", "日本語処理"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        {/* ヘッダー */}
        <header className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-md">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">🔍</span>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">
                      Day63 - 検索エンジン
                    </h1>
                    <p className="text-xs text-gray-400">
                      TF-IDF・転置インデックス・PageRank
                    </p>
                  </div>
                </div>
              </div>

              <nav className="hidden md:flex items-center space-x-6">
                <a
                  href="/"
                  className="text-gray-300 hover:text-blue-400 transition-colors duration-200"
                >
                  検索
                </a>
                <a
                  href="/admin"
                  className="text-gray-300 hover:text-blue-400 transition-colors duration-200"
                >
                  管理
                </a>
                <a
                  href="/stats"
                  className="text-gray-300 hover:text-blue-400 transition-colors duration-200"
                >
                  統計
                </a>
              </nav>

              {/* ステータス表示 */}
              <div className="flex items-center space-x-2">
                <div className="status-dot status-active"></div>
                <span className="text-xs text-gray-400">検索エンジン稼働中</span>
              </div>
            </div>
          </div>
        </header>

        {/* メインコンテンツ */}
        <main className="flex-1">
          {children}
        </main>

        {/* フッター */}
        <footer className="border-t border-gray-700 bg-gray-900/30 mt-16">
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {/* アルゴリズム情報 */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">検索アルゴリズム</h3>
                <ul className="space-y-2 text-xs text-gray-400">
                  <li>✓ TF-IDF スコアリング</li>
                  <li>✓ 転置インデックス</li>
                  <li>✓ PageRank統合</li>
                  <li>✓ 日本語形態素解析</li>
                </ul>
              </div>

              {/* データセット情報 */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">データセット</h3>
                <ul className="space-y-2 text-xs text-gray-400">
                  <li>📚 青空文庫作品</li>
                  <li>📖 Wikipedia記事</li>
                  <li>⚡ 技術記事</li>
                  <li>🔗 文書間リンク</li>
                </ul>
              </div>

              {/* 技術スタック */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">技術スタック</h3>
                <ul className="space-y-2 text-xs text-gray-400">
                  <li>Next.js 15 (App Router)</li>
                  <li>TypeScript</li>
                  <li>SQLite + better-sqlite3</li>
                  <li>Tailwind CSS v4</li>
                </ul>
              </div>

              {/* 学習ポイント */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">学習ポイント</h3>
                <ul className="space-y-2 text-xs text-gray-400">
                  <li>🎯 情報検索理論</li>
                  <li>🧮 アルゴリズム実装</li>
                  <li>🇯🇵 日本語自然言語処理</li>
                  <li>📈 パフォーマンス最適化</li>
                </ul>
              </div>
            </div>

            <div className="border-t border-gray-700 mt-8 pt-6 text-center">
              <p className="text-xs text-gray-500">
                © 2024 Day63 Search Engine. 100日チャレンジ・バックエンド学習プロジェクト
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
