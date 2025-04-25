'use client'; // Client Component を使用

import { useState, useEffect } from 'react';
import type { Post, User } from '@prisma/client'; // Prisma の型をインポート

// 展開された投稿データの型定義 (Author を含む)
type PostWithAuthor = Post & {
  author?: User; // author はオプショナル
};

export default function PostsPage() {
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandAuthor, setExpandAuthor] = useState(false); // 著者情報を展開するかどうかの状態

  useEffect(() => {
    async function fetchPosts() {
      setIsLoading(true);
      setError(null);
      // expandAuthor 状態に基づいて API URL を構築
      const apiUrl = `/api/posts${expandAuthor ? '?expand=author' : ''}`;

      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data: PostWithAuthor[] = await response.json();
        setPosts(data);
      } catch (e: any) {
        console.error('Failed to fetch posts:', e);
        setError(e.message || 'Failed to load posts.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPosts();
  }, [expandAuthor]); // expandAuthor が変更されたら再フェッチ

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Day 18 - Expandable API Posts</h1>

      <div className="mb-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={expandAuthor}
            onChange={(e) => setExpandAuthor(e.target.checked)}
            className="form-checkbox h-5 w-5 text-blue-600"
          />
          <span>Expand Author Information</span>
        </label>
      </div>

      {isLoading && <p>Loading posts...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!isLoading && !error && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <p>No posts found.</p>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="border rounded-lg p-4 shadow">
                <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
                <p className="text-gray-700 mb-2">{post.content}</p>
                <div className="text-sm text-gray-500">
                  <span>Published: {post.published ? 'Yes' : 'No'}</span>
                  {/* 著者情報が展開されていれば表示 */}
                  {post.author && (
                    <span className="ml-4">
                      Author: {post.author.name} ({post.author.email})
                    </span>
                  )}
                  <span className="ml-4">
                    Created: {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
