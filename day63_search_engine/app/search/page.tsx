'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface SearchDocument {
  id: number;
  title: string;
  content: string;
  author: string;
  category: string;
  url: string;
  wordCount: number;
  pagerankScore: number;
  relevanceScore: number;
  tfIdfScore: number;
  matchedTerms: string[];
  snippet: string;
  highlightedSnippet: string;
  createdAt: string;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams?.get('q') || '');
  const [results, setResults] = useState<SearchDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();

      if (data.success) {
        setResults(data.data.documents || []);
        setTotalResults(data.data.totalResults || 0);
        setSearchTime(data.metadata.executionTimeMs || 0);
      } else {
        console.error('Search failed:', data.message);
        setResults([]);
        setTotalResults(0);
        setSearchTime(0);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setTotalResults(0);
      setSearchTime(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (query) {
      handleSearch(query);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  return (
    <div className="min-h-screen">
      {/* 検索ヘッダー */}
      <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <a href="/" className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              検索エンジン
            </a>
            <form onSubmit={handleSubmit} className="flex-1 max-w-2xl">
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="検索キーワードを入力..."
                  className="w-full h-12 px-4 pr-12 rounded-xl glass focus-ring text-white placeholder-gray-400"
                  autoFocus
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 h-8 w-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center hover-glow transition-all duration-200"
                >
                  <span className="text-white text-sm">🔍</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* 検索結果 */}
      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-gray-400 mt-4">検索中...</p>
          </div>
        ) : results.length > 0 ? (
          <>
            {/* 検索情報 */}
            <div className="mb-6 text-sm text-gray-400">
              約 {totalResults} 件の結果 ({Math.round(searchTime)}ms)
            </div>

            {/* 結果一覧 */}
            <div className="space-y-6">
              {results.map((result, index) => (
                <div key={result.id} className="glass rounded-xl p-6 hover-lift">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-white mb-2">
                        {result.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                          {result.category}
                        </span>
                        {result.author && (
                          <span>著者: {result.author}</span>
                        )}
                        <span>関連度: {(result.relevanceScore * 100).toFixed(1)}%</span>
                        <span>権威性: {(result.pagerankScore * 100).toFixed(1)}%</span>
                        <span>語数: {result.wordCount.toLocaleString()}</span>
                      </div>
                      {result.matchedTerms.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {result.matchedTerms.map((term, i) => (
                            <span key={i} className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">
                              {term}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      #{index + 1}
                    </div>
                  </div>

                  {/* ハイライト付きスニペット */}
                  <div
                    className="text-gray-300 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: result.highlightedSnippet }}
                  />
                </div>
              ))}
            </div>
          </>
        ) : query && !loading ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold text-white mb-2">検索結果が見つかりませんでした</h2>
            <p className="text-gray-400">
              別のキーワードで検索してみてください
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold text-white mb-2">検索を開始してください</h2>
            <p className="text-gray-400">
              上の検索ボックスにキーワードを入力してください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
