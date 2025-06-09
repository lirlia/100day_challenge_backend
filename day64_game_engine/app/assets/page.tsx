'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Asset = {
  id: number;
  name: string;
  type: 'image' | 'sound';
  file_path: string;
  file_size: number;
  created_at: string;
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // アセット一覧を取得
  const fetchAssets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/assets');
      const data = await response.json();
      setAssets(data || []);
    } catch (err) {
      console.error('Error fetching assets:', err);
      setError('アセット情報の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // ファイルアップロード
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // ファイルタイプチェック
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');

    if (!isImage && !isAudio) {
      setError('画像ファイル（PNG, JPG, GIF）または音声ファイル（MP3, WAV, OGG）のみアップロード可能です。');
      return;
    }

    try {
      setUploading(true);
      setError('');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', file.name.split('.')[0]);
      formData.append('type', isImage ? 'image' : 'sound');

      const response = await fetch('/api/assets', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        fetchAssets();
        // ファイル入力をリセット
        event.target.value = '';
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'アップロードに失敗しました。');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('アップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  // アセット削除
  const deleteAsset = async (id: number) => {
    if (!confirm('このアセットを削除しますか？')) return;

    try {
      const response = await fetch(`/api/assets?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchAssets();
      } else {
        const errorData = await response.json();
        setError(errorData.error || '削除に失敗しました。');
      }
    } catch (err) {
      console.error('Error deleting asset:', err);
      setError('削除に失敗しました。');
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <header className="mb-8">
          <Link href="/" className="text-blue-300 hover:text-blue-200 mb-4 inline-block">
            ← ホームに戻る
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">🎨 アセット管理</h1>
          <p className="text-blue-200">ゲーム用の画像・音声ファイルを管理</p>
        </header>

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {/* アップロードセクション */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">📁 ファイルアップロード</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-blue-200 mb-2">
                ファイルを選択（画像: PNG, JPG, GIF / 音声: MP3, WAV, OGG）
              </label>
              <input
                type="file"
                accept="image/*,audio/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className="block w-full text-white bg-white/10 border border-white/20 rounded-lg p-2 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
            </div>
            {uploading && (
              <div className="text-blue-300">
                <div className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2"></div>
                アップロード中...
              </div>
            )}
          </div>
        </div>

        {/* アセット一覧 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-semibold text-white mb-4">📋 アセット一覧</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-300 border-t-transparent rounded-full"></div>
              <p className="text-blue-200 mt-2">読み込み中...</p>
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-blue-200">アセットがありません。ファイルをアップロードしてください。</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assets.map((asset) => (
                <div key={asset.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-white truncate">{asset.name}</h3>
                      <p className="text-sm text-blue-300">
                        {asset.type === 'image' ? '🖼️ 画像' : '🔊 音声'}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteAsset(asset.id)}
                      className="text-red-400 hover:text-red-300 ml-2"
                      title="削除"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* 画像プレビュー */}
                  {asset.type === 'image' && (
                    <div className="mb-2">
                      <img
                        src={`/assets/${asset.file_path}`}
                        alt={asset.name}
                        className="w-full h-32 object-cover rounded border border-white/20"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="text-xs text-blue-300 space-y-1">
                    <p>サイズ: {(asset.file_size / 1024).toFixed(1)} KB</p>
                    <p>作成: {new Date(asset.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 使用方法 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 mt-8">
          <h2 className="text-xl font-semibold text-white mb-4">💡 使用方法</h2>
          <div className="text-blue-200 space-y-2">
            <p>• アップロードしたアセットは自動的にゲームエンジンで利用可能になります</p>
            <p>• 画像ファイルはスプライトとして、音声ファイルはBGM・効果音として使用されます</p>
            <p>• ファイル名がゲーム内でのアセット名になります（拡張子は除く）</p>
            <p>• 推奨画像サイズ: 32x32px（キャラクター）、64x32px（地面）、20x20px（アイテム）</p>
          </div>
        </div>
      </div>
    </div>
  );
}
