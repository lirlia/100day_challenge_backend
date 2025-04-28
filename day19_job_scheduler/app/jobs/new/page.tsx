'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewJobPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    command: '',
    scheduleType: 'interval', // デフォルトは定期実行
    scheduledAt: '',
    interval: 5,
    intervalUnit: 'minute',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォーム入力の変更処理
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // 数値入力の変更処理
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: parseInt(value) || 0,
    }));
  };

  // フォーム送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // ScheduledAtをISOフォーマットに変換
      let scheduledAt = null;
      if (formData.scheduleType === 'once' && formData.scheduledAt) {
        scheduledAt = new Date(formData.scheduledAt).toISOString();
      }

      // APIリクエストデータを構築
      const requestData = {
        ...formData,
        scheduledAt,
      };

      // ジョブ作成APIを呼び出し
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/'); // 成功したら一覧ページにリダイレクト
      } else {
        setError(data.error || 'ジョブの作成に失敗しました');
      }
    } catch (error) {
      console.error('Error creating job:', error);
      setError('ジョブの作成中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // 日付入力用の現在時刻からのデフォルト値を生成
  const getDefaultDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30); // 30分後
    const localDateTime = new Date(now).toISOString().slice(0, 16);
    return localDateTime;
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">新規ジョブ作成</h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            ジョブ名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            説明
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="command" className="block text-sm font-medium text-gray-700 mb-1">
            実行コマンド <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="command"
            name="command"
            value={formData.command}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="例: node script.js"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="scheduleType" className="block text-sm font-medium text-gray-700 mb-1">
            スケジュールタイプ <span className="text-red-500">*</span>
          </label>
          <select
            id="scheduleType"
            name="scheduleType"
            value={formData.scheduleType}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="interval">定期実行</option>
            <option value="once">一回のみ実行</option>
          </select>
        </div>

        {formData.scheduleType === 'once' ? (
          <div className="mb-4">
            <label htmlFor="scheduledAt" className="block text-sm font-medium text-gray-700 mb-1">
              実行日時 <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              id="scheduledAt"
              name="scheduledAt"
              value={formData.scheduledAt || getDefaultDateTime()}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ) : (
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label htmlFor="interval" className="block text-sm font-medium text-gray-700 mb-1">
                間隔 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="interval"
                name="interval"
                value={formData.interval}
                onChange={handleNumberChange}
                min="1"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="intervalUnit" className="block text-sm font-medium text-gray-700 mb-1">
                単位 <span className="text-red-500">*</span>
              </label>
              <select
                id="intervalUnit"
                name="intervalUnit"
                value={formData.intervalUnit}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="minute">分</option>
                <option value="hour">時間</option>
                <option value="day">日</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
