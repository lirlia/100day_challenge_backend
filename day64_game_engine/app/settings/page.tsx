'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type GameSetting = {
  id: number;
  key: string;
  value: string;
  description: string;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<GameSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 設定一覧を取得
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      const data = await response.json();
      setSettings(data || []);
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError('設定の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  // 設定値を更新
  const updateSetting = async (key: string, value: string) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });

      if (response.ok) {
        setSuccess('設定を保存しました');
        fetchSettings();
        // 成功メッセージを3秒後に消す
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || '設定の保存に失敗しました。');
      }
    } catch (err) {
      console.error('Error updating setting:', err);
      setError('設定の保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  // 設定値変更ハンドラ
  const handleSettingChange = (key: string, value: string) => {
    setSettings(prev =>
      prev.map(setting =>
        setting.key === key ? { ...setting, value } : setting
      )
    );
  };

  // 設定保存ハンドラ
  const handleSave = (key: string, value: string) => {
    updateSetting(key, value);
  };

  // デフォルト値にリセット
  const resetToDefaults = async () => {
    if (!confirm('全ての設定をデフォルト値にリセットしますか？')) return;

    try {
      setSaving(true);
      setError('');

      const response = await fetch('/api/settings', {
        method: 'POST',
      });

      if (response.ok) {
        setSuccess('設定をデフォルト値にリセットしました');
        fetchSettings();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'リセットに失敗しました。');
      }
    } catch (err) {
      console.error('Error resetting settings:', err);
      setError('リセットに失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <header className="mb-8">
          <Link href="/" className="text-blue-300 hover:text-blue-200 mb-4 inline-block">
            ← ホームに戻る
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">⚙️ ゲーム設定</h1>
          <p className="text-blue-200">ゲームパラメータの調整</p>
        </header>

        {/* メッセージ表示 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mb-6">
            <p className="text-green-200">{success}</p>
          </div>
        )}

        {/* 設定一覧 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">🎮 ゲームパラメータ</h2>
            <button
              onClick={resetToDefaults}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white px-4 py-2 rounded-lg transition-colors"
            >
              デフォルトにリセット
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-300 border-t-transparent rounded-full"></div>
              <p className="text-blue-200 mt-2">読み込み中...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {settings.map((setting) => (
                <div key={setting.id} className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <div className="grid md:grid-cols-3 gap-4 items-center">
                    <div>
                      <h3 className="font-semibold text-white">{setting.key}</h3>
                      <p className="text-sm text-blue-300">{setting.description}</p>
                    </div>

                    <div>
                      <input
                        type="number"
                        value={setting.value}
                        onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-blue-300"
                        step={setting.key.includes('speed') ? '10' : '1'}
                        min="0"
                      />
                    </div>

                    <div>
                      <button
                        onClick={() => handleSave(setting.key, setting.value)}
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded-lg transition-colors w-full md:w-auto"
                      >
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 設定説明 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <h2 className="text-xl font-semibold text-white mb-4">💡 設定項目の説明</h2>
          <div className="grid md:grid-cols-2 gap-6 text-blue-200">
            <div>
              <h3 className="font-semibold text-white mb-2">プレイヤー関連</h3>
              <ul className="space-y-1 text-sm">
                <li>• <strong>player_speed</strong>: プレイヤーの水平移動速度</li>
                <li>• <strong>player_jump_power</strong>: ジャンプの高さ（大きいほど高くジャンプ）</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">物理・敵・アイテム</h3>
              <ul className="space-y-1 text-sm">
                <li>• <strong>gravity</strong>: 重力の強さ（大きいほど早く落下）</li>
                <li>• <strong>enemy_speed</strong>: 敵の移動速度</li>
                <li>• <strong>coin_value</strong>: コイン1個の得点</li>
                <li>• <strong>goal_value</strong>: ゴール到達時の得点</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
            <p className="text-yellow-200 text-sm">
              <strong>注意:</strong> 設定変更後は、ゲームを再起動して変更を反映してください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
