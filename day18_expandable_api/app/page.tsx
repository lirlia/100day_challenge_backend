'use client'; // Client Component を使用

import { useState, useEffect, useMemo } from 'react';
// 型インポートのエラーは無視
// @ts-ignore
import type { Post, User, Comment } from '@prisma/client';

// 展開されたコメント (著者情報を含む可能性あり)
type ExpandedComment = Comment & {
  author?: User;
};

// 展開された投稿データ (著者やコメントを含む可能性あり)
type ExpandedPost = Post & {
  author?: User;
  comments?: ExpandedComment[];
};

export default function PostsPage() {
  const [posts, setPosts] = useState<ExpandedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 各展開オプションの状態
  const [expandOptions, setExpandOptions] = useState({
    author: false,
    comments: false,
    'comments.author': false, // ネストした展開もオプションに
  });

  // チェックボックスの状態が変更されたときのハンドラ
  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setExpandOptions(prevOptions => ({
      ...prevOptions,
      [name]: checked,
      // 'comments.author' がチェックされたら 'comments' も自動でチェック (依存関係)
      ...(name === 'comments.author' && checked && { comments: true }),
      // 'comments' のチェックが外れたら 'comments.author' も外す
      ...(name === 'comments' && !checked && { 'comments.author': false }),
    }));
  };

  // expand クエリパラメータ文字列を生成 (useMemoで最適化)
  const expandQueryString = useMemo(() => {
    return Object.entries(expandOptions)
      .filter(([, isChecked]) => isChecked)
      .map(([key]) => key)
      .join(',');
  }, [expandOptions]);

  useEffect(() => {
    async function fetchPosts() {
      setIsLoading(true);
      setError(null);
      // expandQueryString を使って API URL を構築
      const apiUrl = `/api/posts${expandQueryString ? `?expand=${expandQueryString}` : ''}`;
      console.log("Fetching:", apiUrl); // デバッグ用ログ

      try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data: ExpandedPost[] = await response.json();
        setPosts(data);
      } catch (e: any) {
        console.error('Failed to fetch posts:', e);
        setError(e.message || 'Failed to load posts.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchPosts();
  }, [expandQueryString]); // expandQueryString が変更されたら再フェッチ

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Day 18 - Expandable API Posts</h1>

      {/* 展開オプションのチェックボックス */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
        <h3 className="text-lg font-semibold mb-2">Expand Options:</h3>
        <div className="flex flex-wrap gap-4">
          {Object.entries(expandOptions).map(([key, isChecked]) => (
            <label key={key} className="flex items-center space-x-2">
              <input
                type="checkbox"
                name={key}
                checked={isChecked}
                onChange={handleCheckboxChange}
                // 'comments' がチェックされてない場合 'comments.author' は無効化
                disabled={key === 'comments.author' && !expandOptions.comments}
                className="form-checkbox h-5 w-5 text-blue-600 disabled:opacity-50"
              />
              <span className={key === 'comments.author' && !expandOptions.comments ? 'text-gray-400' : ''}>
                {key}
              </span>
            </label>
          ))}
        </div>
      </div>

      {isLoading && <p>Loading posts...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      {!isLoading && !error && (
        <div className="space-y-6">
          {posts.length === 0 ? (
            <p>No posts found.</p>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="border rounded-lg p-6 shadow-md bg-white dark:bg-gray-800">
                <h2 className="text-xl font-semibold mb-2">{post.title}</h2>
                <p className="text-gray-700 dark:text-gray-300 mb-3">{post.content || 'No content'}</p>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-4 border-b pb-3 dark:border-gray-700">
                  <span>Published: {post.published ? 'Yes' : 'No'}</span>
                  {/* 著者情報が展開されていれば表示 */}
                  {post.author && (
                    <span className="ml-4 block sm:inline sm:ml-4 mt-1 sm:mt-0">
                      Author: <span className="font-medium">{post.author.name}</span> ({post.author.email})
                    </span>
                  )}
                  <span className="ml-4 block sm:inline sm:ml-4 mt-1 sm:mt-0">
                    Created: {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {/* コメント情報が展開されていれば表示 */}
                {post.comments && (
                  <div>
                    <h4 className="text-md font-semibold mb-2">Comments ({post.comments.length}):</h4>
                    {post.comments.length > 0 ? (
                      <ul className="space-y-3 pl-4">
                        {post.comments.map((comment: ExpandedComment) => (
                          <li key={comment.id} className="text-sm border-l-2 pl-3 dark:border-gray-600">
                            <p className="text-gray-800 dark:text-gray-200">{comment.text}</p>
                            <p className="text-gray-500 dark:text-gray-400 text-xs">
                              {/* コメントの著者情報が展開されていれば表示 */}
                              {comment.author ? `By: ${comment.author.name}` : `Author ID: ${comment.authorId}`}
                              <span className="ml-2">
                                - {new Date(comment.createdAt).toLocaleString()}
                              </span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No comments yet.</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
