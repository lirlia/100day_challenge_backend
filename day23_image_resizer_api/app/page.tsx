'use client';

import React, { useState, useEffect } from 'react';

const availableImageIds = ['cat', 'mountain', 'abstract'];

export default function HomePage() {
  const [selectedId, setSelectedId] = useState<string>(availableImageIds[0]);
  const [width, setWidth] = useState<string>('200');
  const [height, setHeight] = useState<string>('200');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleGenerateImage = () => {
    console.log('[UI] handleGenerateImage called');
    setError(null);
    setImageUrl(''); // ボタンクリック時に一旦画像をクリア

    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    console.log(`[UI] Parsed size: w=${w}, h=${h}`);

    if (isNaN(w) || isNaN(h) || w < 1 || h < 1) {
      console.log('[UI] Validation failed');
      setError('幅と高さには1以上の数値を入力してください。');
      return;
    }

    // APIエンドポイントのURLを生成
    const url = `/api/images/${selectedId}/${w}/${h}`;
    console.log(`[UI] Generated API URL: ${url}`);
    setImageUrl(url); // ★ URL の設定のみを行う
    console.log('[UI] setImageUrl called');
  };

  // imageUrl が変更されたらローディング状態を開始する useEffect を追加
  useEffect(() => {
    if (imageUrl) {
      console.log('[UI] useEffect detected imageUrl change, setting isLoading=true');
      setIsLoading(true); // ★ imageUrl がセットされた後に isLoading を true にする
    } else {
      // imageUrl が空になった場合（エラー時や初期状態）はローディングも解除
      setIsLoading(false);
    }
  }, [imageUrl]); // imageUrl を依存配列に追加

  const handleImageLoad = () => {
    console.log('[UI] handleImageLoad called');
    setIsLoading(false);
    setError(null);
  };

  const handleImageError = () => {
    console.log('[UI] handleImageError called');
    setIsLoading(false);
    setError('画像の読み込みに失敗しました。存在しないIDか、サーバー側で問題が発生した可能性があります。');
    setImageUrl(''); // エラー時は画像URLをクリア
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Day23 - Image Resizer API</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 操作パネル */}
        <div className="space-y-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <div>
            <label htmlFor="imageId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              画像 ID:
            </label>
            <select
              id="imageId"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
            >
              {availableImageIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex space-x-4">
            <div className="flex-1">
              <label htmlFor="width" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                幅 (px):
              </label>
              <input
                type="number"
                id="width"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                min="1"
                className="mt-1 block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                高さ (px):
              </label>
              <input
                type="number"
                id="height"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                min="1"
                className="mt-1 block w-full pl-3 pr-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleGenerateImage}
            disabled={isLoading}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '読み込み中...' : '画像表示'}
          </button>

          {error && (
            <p className="text-red-500 text-sm mt-2">{error}</p>
          )}
        </div>

        {/* 画像表示エリア */}
        <div className="relative border border-gray-200 dark:border-gray-700 rounded-md p-4 flex items-center justify-center min-h-[300px] bg-gray-50 dark:bg-gray-900">
          {/* 画像は imageUrl があれば常にレンダリング試行 */}
          {imageUrl && (
            <img
              key={imageUrl}
              src={imageUrl}
              alt={`Resized ${selectedId} (${width}x${height})`}
              // ローディング中は少し透明にする（任意）
              className={`max-w-full max-h-full object-contain shadow-md transition-opacity duration-300 ${isLoading ? 'opacity-30' : 'opacity-100'}`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}

          {/* ローディング表示 (imageUrl があるときだけ) */}
          {isLoading && imageUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-black/70 px-4 py-2 rounded">
                読み込み中...
              </p>
            </div>
          )}

          {/* 初期状態メッセージ */}
          {!imageUrl && !error && (
            <p className="text-gray-500 dark:text-gray-400">画像ID、幅、高さを指定して「画像表示」を押してください。</p>
          )}

           {/* エラー発生時 (imageUrlがクリアされるので、ここには表示されないはずだが念のため) */}
           {!imageUrl && error && (
             <p className="text-red-500">画像の読み込みに失敗しました。</p>
           )}
        </div>
      </div>
    </div>
  );
}
