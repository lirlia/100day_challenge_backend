'use client';

import { useState } from 'react';

interface PostFormProps {
  userId: number;
}

export default function PostForm({ userId }: PostFormProps) {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create post');
      }

      // 投稿成功後、フォームをクリア
      setContent('');
      // タイムラインの更新はSSEで行われるため、ここでは何もしない
    } catch (err: any) {
      console.error('Error submitting post:', err);
      setError(err.message || 'An unknown error occurred while posting');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="いまどうしてる？"
        className="w-full p-2 border rounded mb-2 resize-none dark:bg-gray-700 dark:border-gray-600"
        rows={3}
        maxLength={280} // 例: Xの文字数制限
        disabled={isSubmitting}
      />
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <button
        type="submit"
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        disabled={!content.trim() || isSubmitting}
      >
        {isSubmitting ? '投稿中...' : '投稿'}
      </button>
    </form>
  );
}
