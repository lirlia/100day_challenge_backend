'use client';

import { useState } from 'react';

interface RagSource {
  id: number;
  title: string;
  url: string;
}

interface RagResponse {
  response: string;
  sources: RagSource[];
}

export default function HomePage() {
  const [query, setQuery] = useState<string>('');
  const [result, setResult] = useState<RagResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleQueryChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(event.target.value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    console.log('Sending query:', query);

    try {
      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      console.log('Received response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const data: RagResponse = await response.json();
      console.log('Received data:', data);
      setResult(data);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center py-10">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-center">Day 24 - 簡易RAGシステム</h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mt-2">
          名探偵コナン Wikipedia の情報に基づいて質問に答えます (ベクトル検索使用)
        </p>
      </header>

      <main className="w-full max-w-2xl px-4">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
          <label htmlFor="query" className="block text-lg font-medium mb-2">
            質問を入力してください:
          </label>
          <textarea
            id="query"
            value={query}
            onChange={handleQueryChange}
            rows={4}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
            placeholder="例: 黒ずくめの組織とは？"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className={`mt-4 w-full px-4 py-2 rounded-md text-white font-semibold transition-colors duration-200 ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isLoading ? '検索中...' : '質問する'}
          </button>
        </form>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
            <strong className="font-bold">エラー:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        )}

        {result && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-4">回答:</h2>
            <p className="whitespace-pre-wrap mb-4">{result.response}</p>

            {result.sources && result.sources.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">参照元:</h3>
                <ul className="list-disc list-inside">
                  {result.sources.map((source) => (
                    <li key={source.id}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
