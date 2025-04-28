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
  const [processingJobs, setProcessingJobs] = useState<Record<string, { toggling?: boolean, running?: boolean }>>({});

  // ジョブ一覧を取得
  const fetchJobs = async () => {
    try {
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
    }
  };

  // ジョブの有効/無効を切り替え
  const toggleJobStatus = async (id: string) => {
    try {
      // 処理中状態を設定
      setProcessingJobs(prev => ({
        ...prev,
        [id]: { ...prev[id], toggling: true }
      }));
      setError(null);

      const response = await fetch(`/api/jobs/${id}/toggle`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        // ジョブのデータを更新
        setJobs(prevJobs =>
          prevJobs.map(job =>
            job.id === id ? { ...job, isActive: !job.isActive, nextRunAt: data.data.nextRunAt } : job
          )
        );
      } else {
        setError(data.error || 'ジョブの状態変更に失敗しました');
      }
    } catch (error) {
      console.error('Error toggling job status:', error);
      setError('ジョブの状態変更中にエラーが発生しました');
    } finally {
      // 処理中状態を解除
      setProcessingJobs(prev => ({
        ...prev,
        [id]: { ...prev[id], toggling: false }
      }));
    }
  };

  // ジョブを手動実行
  const runJob = async (id: string) => {
    try {
      // 処理中状態を設定
      setProcessingJobs(prev => ({
        ...prev,
        [id]: { ...prev[id], running: true }
      }));
      setError(null);

      const response = await fetch(`/api/jobs/${id}/run`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        // 成功メッセージを表示
        const message = document.createElement('div');
        message.className = 'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50';
        message.innerHTML = 'ジョブの実行を開始しました';
        document.body.appendChild(message);

        // 2秒後にメッセージを消す
        setTimeout(() => {
          if (message.parentNode) {
            message.parentNode.removeChild(message);
          }
        }, 2000);

        // 少し待ってからジョブリストを更新（実行中状態に更新）
        setTimeout(() => {
          fetchJobs();
        }, 1000);
      } else {
        setError(data.error || 'ジョブの実行に失敗しました');
      }
    } catch (error) {
      console.error('Error running job:', error);
      setError('ジョブの実行中にエラーが発生しました');
    } finally {
      // 処理中状態を解除
      setTimeout(() => {
        setProcessingJobs(prev => ({
          ...prev,
          [id]: { ...prev[id], running: false }
        }));
      }, 1500);
    }
  };

  // マウント時とポーリングでジョブ一覧を取得
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchJobs();
      setLoading(false);
    };

    loadData();

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

  // ジョブが処理中かどうかを確認するヘルパー関数
  const isProcessingJob = (id: string, type: 'toggling' | 'running') => {
    return processingJobs[id]?.[type] === true;
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
                        disabled={isProcessingJob(job.id, 'toggling')}
                        className={`text-xs py-1 px-2 rounded relative ${job.isActive
                          ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                          } ${isProcessingJob(job.id, 'toggling') ? 'opacity-70 cursor-wait' : ''}`}
                      >
                        {job.isActive ? '無効化' : '有効化'}
                        {isProcessingJob(job.id, 'toggling') && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <svg className="animate-spin h-3 w-3 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => runJob(job.id)}
                        disabled={!job.isActive || isProcessingJob(job.id, 'running')}
                        className={`text-xs py-1 px-2 rounded relative ${job.isActive && !isProcessingJob(job.id, 'running')
                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                      >
                        実行
                        {isProcessingJob(job.id, 'running') && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <svg className="animate-spin h-3 w-3 text-blue-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                          </span>
                        )}
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
