'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Job = {
  id: string;
  name: string;
  description: string | null;
  command: string;
  scheduleType: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export default function HomePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ジョブ一覧を取得
  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/jobs');
      const data = await response.json();

      if (data.success) {
        setJobs(data.data);
      } else {
        setError(data.error || 'ジョブの取得に失敗しました');
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setError('ジョブの取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // ジョブの有効/無効を切り替え
  const toggleJobStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/jobs/${id}/toggle`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        // ジョブ一覧を更新
        fetchJobs();
      } else {
        setError(data.error || 'ジョブの状態変更に失敗しました');
      }
    } catch (error) {
      console.error('Error toggling job status:', error);
      setError('ジョブの状態変更中にエラーが発生しました');
    }
  };

  // ジョブを手動実行
  const runJob = async (id: string) => {
    try {
      const response = await fetch(`/api/jobs/${id}/run`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        alert('ジョブの実行を開始しました');
        // ジョブ一覧を更新
        fetchJobs();
      } else {
        setError(data.error || 'ジョブの実行に失敗しました');
      }
    } catch (error) {
      console.error('Error running job:', error);
      setError('ジョブの実行中にエラーが発生しました');
    }
  };

  // マウント時とポーリングでジョブ一覧を取得
  useEffect(() => {
    fetchJobs();

    // 10秒ごとにジョブ一覧を更新
    const intervalId = setInterval(() => {
      fetchJobs();
    }, 10000);

    // スケジューラのチェックを実行（ポーリング）
    const checkScheduler = async () => {
      try {
        await fetch('/api/scheduler/check');
      } catch (error) {
        console.error('Error checking scheduler:', error);
      }
    };

    // 5秒ごとにスケジューラをチェック
    const schedulerIntervalId = setInterval(checkScheduler, 5000);

    // クリーンアップ
    return () => {
      clearInterval(intervalId);
      clearInterval(schedulerIntervalId);
    };
  }, []);

  // 日時のフォーマット
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '未設定';
    return new Date(dateString).toLocaleString('ja-JP');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">ジョブ一覧</h2>
        <Link
          href="/jobs/new"
          className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded"
        >
          新規ジョブ作成
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-6">読み込み中...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-6 bg-gray-100 rounded">
          <p>ジョブがありません。新しいジョブを作成してください。</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 border-b text-left">名前</th>
                <th className="py-2 px-4 border-b text-left">説明</th>
                <th className="py-2 px-4 border-b text-left">タイプ</th>
                <th className="py-2 px-4 border-b text-left">状態</th>
                <th className="py-2 px-4 border-b text-left">前回実行</th>
                <th className="py-2 px-4 border-b text-left">次回予定</th>
                <th className="py-2 px-4 border-b text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="py-2 px-4 border-b">
                    <Link href={`/jobs/${job.id}`} className="text-blue-500 hover:underline">
                      {job.name}
                    </Link>
                  </td>
                  <td className="py-2 px-4 border-b">{job.description || '説明なし'}</td>
                  <td className="py-2 px-4 border-b">
                    {job.scheduleType === 'once' ? '一回のみ' : '定期実行'}
                  </td>
                  <td className="py-2 px-4 border-b">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs ${job.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                        }`}
                    >
                      {job.isActive ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="py-2 px-4 border-b">{formatDate(job.lastRunAt)}</td>
                  <td className="py-2 px-4 border-b">{formatDate(job.nextRunAt)}</td>
                  <td className="py-2 px-4 border-b">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => toggleJobStatus(job.id)}
                        className={`text-xs py-1 px-2 rounded ${job.isActive
                            ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                          }`}
                      >
                        {job.isActive ? '無効化' : '有効化'}
                      </button>
                      <button
                        onClick={() => runJob(job.id)}
                        disabled={!job.isActive}
                        className={`text-xs py-1 px-2 rounded ${job.isActive
                            ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                      >
                        実行
                      </button>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="text-xs py-1 px-2 rounded bg-gray-100 text-gray-800 hover:bg-gray-200"
                      >
                        詳細
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
