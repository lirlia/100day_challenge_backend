import SearchHero from '../components/SearchHero';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* ヒーローセクション */}
      <section className="relative py-20 px-4">
        <div className="container mx-auto text-center">
          {/* メインタイトル */}
          <div className="fade-in-up">
            <div className="inline-flex items-center px-4 py-2 rounded-full glass mb-6">
              <span className="text-sm text-blue-400 font-medium">
                🚀 Day63 Challenge
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
                本格検索エンジン
              </span>
            </h1>

            <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              TF-IDF・転置インデックス・PageRankアルゴリズムによる<br />
              情報検索理論の実装と日本語自然言語処理
            </p>
          </div>

          {/* 検索フォーム - Client Component */}
          <SearchHero />
        </div>
      </section>

      {/* 検索アルゴリズム説明 */}
      <section className="py-16 px-4 bg-gray-900/30">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              実装済み検索アルゴリズム
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              情報検索理論に基づく高度なアルゴリズムで、関連性の高い文書を効率的に発見
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* TF-IDF */}
            <div className="glass rounded-xl p-8 hover-lift">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-6">
                <span className="text-white text-xl">📊</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">TF-IDF スコアリング</h3>
              <p className="text-gray-400 mb-4">
                単語の文書内頻度と逆文書頻度を組み合わせて、検索クエリとの関連性を数値化
              </p>
              <code className="text-xs text-blue-400 bg-gray-800 px-2 py-1 rounded">
                score = TF(term) × IDF(term)
              </code>
            </div>

            {/* 転置インデックス */}
            <div className="glass rounded-xl p-8 hover-lift">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-6">
                <span className="text-white text-xl">🗃️</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">転置インデックス</h3>
              <p className="text-gray-400 mb-4">
                単語から文書への逆引きインデックスにより、高速な全文検索を実現
              </p>
              <code className="text-xs text-purple-400 bg-gray-800 px-2 py-1 rounded">
                word → [doc1, doc2, doc3...]
              </code>
            </div>

            {/* PageRank */}
            <div className="glass rounded-xl p-8 hover-lift">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center mb-6">
                <span className="text-white text-xl">🔗</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">PageRank統合</h3>
              <p className="text-gray-400 mb-4">
                文書間のリンク関係を分析して、権威性の高い文書を優先的に表示
              </p>
              <code className="text-xs text-cyan-400 bg-gray-800 px-2 py-1 rounded">
                PR(A) = (1-d) + d×Σ(PR(T)/C(T))
              </code>
            </div>
          </div>
        </div>
      </section>

      {/* データセット紹介 */}
      <section className="py-16 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              検索対象データセット
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              多様なジャンルの高品質な日本語テキストを用意し、実用的な検索体験を提供
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 青空文庫 */}
            <div className="glass rounded-xl p-8 hover-glow group">
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-200">📚</div>
              <h3 className="text-xl font-bold text-white mb-3">青空文庫</h3>
              <p className="text-gray-400 mb-4">
                夏目漱石「こころ」、宮沢賢治「銀河鉄道の夜」など、日本近代文学の名作
              </p>
              <div className="text-sm text-green-400">✓ 著作権フリー</div>
            </div>

            {/* Wikipedia */}
            <div className="glass rounded-xl p-8 hover-glow group">
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-200">📖</div>
              <h3 className="text-xl font-bold text-white mb-3">Wikipedia記事</h3>
              <p className="text-gray-400 mb-4">
                東京、歴史、科学技術など、幅広い分野の百科事典記事から厳選
              </p>
              <div className="text-sm text-green-400">✓ 信頼性の高い情報</div>
            </div>

            {/* 技術記事 */}
            <div className="glass rounded-xl p-8 hover-glow group">
              <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-200">⚡</div>
              <h3 className="text-xl font-bold text-white mb-3">技術記事</h3>
              <p className="text-gray-400 mb-4">
                Next.js App Router、データベース設計など、最新の技術動向を網羅
              </p>
              <div className="text-sm text-green-400">✓ 実用的な技術情報</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA セクション */}
      <section className="py-16 px-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            今すぐ検索を始めよう
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            高度な検索アルゴリズムで、求める情報を瞬時に発見
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/search" className="inline-block px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl text-white font-semibold hover-glow transition-all duration-200 text-lg">
              検索を開始
            </a>
            <a href="/admin" className="inline-block px-8 py-4 bg-gradient-to-r from-slate-600 to-slate-700 rounded-xl text-white font-semibold hover-glow transition-all duration-200 text-lg">
              管理画面
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
