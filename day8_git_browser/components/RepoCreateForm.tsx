'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RepoCreateForm() {
  const [repoName, setRepoName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName.trim() || isLoading) return;

    // 簡単なバリデーション (API側と合わせる)
    if (!/^[a-zA-Z0-9_-]+$/.test(repoName)) {
        setError('Invalid repository name. Use only alphanumeric characters, hyphens, and underscores.');
        return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repoName }),
      });

      if (response.ok) {
        setRepoName('');
        // 成功したらページをリフレッシュして一覧を更新
        router.refresh();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create repository.');
      }
    } catch (err) {
      console.error('Error creating repository:', err);
      setError('An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md mb-6">
      <h2 className="text-xl font-semibold mb-4">Create New Repository</h2>
      {error && <p className="text-red-500 mb-4">Error: {error}</p>}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={repoName}
          onChange={(e) => setRepoName(e.target.value)}
          placeholder="Repository name"
          className="flex-1 px-4 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
          required
        />
        <button
          type="submit"
          className={`bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed`}
          disabled={isLoading}
        >
          {isLoading ? 'Creating...' : 'Create'}
        </button>
      </form>
      <p className="text-xs text-gray-500 mt-2">Use only alphanumeric characters, hyphens, and underscores.</p>
    </div>
  );
}
