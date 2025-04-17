'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PostFormProps {
  userId: number;
  userEmoji: string;
}

export default function PostForm({ userId, userEmoji }: PostFormProps) {
  const [content, setContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const router = useRouter();
  const maxLength = 280;

  // テキストエリアの高さを自動調整する関数
  const adjustTextareaHeight = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 最大文字数を超える場合は入力を制限
    if (e.target.value.length <= maxLength) {
      setContent(e.target.value);
      adjustTextareaHeight(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() || isPosting) return;

    setIsPosting(true);

    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error('投稿に失敗しました');
      }

      // 投稿成功
      setContent('');

      // テキストエリアの高さをリセット
      const textarea = document.getElementById('post-content') as HTMLTextAreaElement;
      if (textarea) {
        textarea.style.height = 'auto';
      }

      // ページを更新して新しい投稿を表示
      router.refresh();

    } catch (error) {
      console.error('投稿エラー:', error);
      alert('投稿に失敗しました。もう一度お試しください。');
    } finally {
      setIsPosting(false);
    }
  };

  // 残り文字数の色を計算
  const getRemainingClass = () => {
    const remaining = maxLength - content.length;
    if (remaining <= 0) return 'text-red-500';
    if (remaining <= 20) return 'text-orange-500';
    return 'text-brand-light-gray';
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex">
        <div className="mr-3 flex-shrink-0">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-full flex items-center justify-center text-xl font-bold shadow-sm">
            {/* イニシャルから絵文字に変更 */}
            {userEmoji}
          </div>
        </div>
        <div className="flex-1">
          <textarea
            id="post-content"
            className="w-full p-3 bg-white rounded-lg border border-brand-light-gray focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none resize-none min-h-[80px] shadow-sm"
            placeholder="いまどうしてる？"
            value={content}
            onChange={handleContentChange}
            disabled={isPosting}
          ></textarea>
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 border-t pt-3 border-brand-light-gray">
        <div className="flex">
          {/* 画像アイコン */}
          <button
            type="button"
            className="text-brand-blue hover:bg-brand-highlight rounded-full p-2"
            disabled={isPosting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center">
          <span className={`text-sm mr-3 ${getRemainingClass()}`}>
            {maxLength - content.length}
          </span>
          <button
            type="submit"
            className={`bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white font-bold py-2 px-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue-dark shadow-md
              ${(!content.trim() || isPosting) ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!content.trim() || isPosting}
          >
            {isPosting ? '投稿中...' : '投稿する'}
          </button>
        </div>
      </div>
    </form>
  );
}
