'use client';

interface SearchHeroProps {
  onTagClick?: (tag: string) => void;
}

export default function SearchHero({ onTagClick }: SearchHeroProps) {
  const handleSearchClick = () => {
    window.location.href = '/search';
  };

  const handleTagClick = (tag: string) => {
    if (onTagClick) {
      onTagClick(tag);
    } else {
      window.location.href = `/search?q=${encodeURIComponent(tag)}`;
    }
  };

  return (
    <>
      {/* 検索フォーム */}
      <div className="max-w-2xl mx-auto mb-12 fade-in-up">
        <div className="relative">
          <div className="relative">
            <input
              type="text"
              placeholder="青空文庫、Wikipedia、技術記事から検索..."
              className="w-full h-14 px-6 pr-16 rounded-2xl glass focus-ring text-white placeholder-gray-400 text-lg cursor-pointer"
              onClick={handleSearchClick}
              readOnly
            />
            <a
              href="/search"
              className="absolute right-2 top-2 h-10 w-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center hover-glow transition-all duration-200"
            >
              <span className="text-white">🔍</span>
            </a>
          </div>
        </div>

        {/* クイック検索タグ */}
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          {['夏目漱石', '東京', 'Next.js', 'データベース設計', '銀河鉄道'].map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className="px-4 py-2 rounded-full bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 text-sm transition-colors duration-200"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 統計情報 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto fade-in-up">
        <div className="glass rounded-xl p-6 hover-lift">
          <div className="text-2xl font-bold text-blue-400 mb-2">6</div>
          <div className="text-sm text-gray-400">インデックス済み文書</div>
        </div>
        <div className="glass rounded-xl p-6 hover-lift">
          <div className="text-2xl font-bold text-purple-400 mb-2">1,200+</div>
          <div className="text-sm text-gray-400">ユニーク単語</div>
        </div>
        <div className="glass rounded-xl p-6 hover-lift">
          <div className="text-2xl font-bold text-cyan-400 mb-2">15,000+</div>
          <div className="text-sm text-gray-400">転置インデックス</div>
        </div>
        <div className="glass rounded-xl p-6 hover-lift">
          <div className="text-2xl font-bold text-green-400 mb-2">&lt; 50ms</div>
          <div className="text-sm text-gray-400">平均検索時間</div>
        </div>
      </div>
    </>
  );
}
