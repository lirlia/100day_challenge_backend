'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Job = {
  id: string;
  name: string;
  description: string | null;
  command: string;
  scheduleType: string;
  interval?: number | null;
  intervalUnit?: string | null;
  scheduledAt?: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobHistory = {
  id: string;
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  output: string | null;
  error: string | null;
};

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // ジョブの詳細を取得
  const fetchJobDetails = async () => {
    try {
      const response = await fetch(`/api/jobs/${id}`);
      const data = await response.json();

      if (data.success) {
        setJob(data.data);
      } else {
        setError(data.error || 'ジョブの取得に失敗しました');
      }
    } catch (error) {
      console.error('Error fetching job:', error);
      setError('ジョブの取得中にエラーが発生しました');
    }
  };

  // ジョブの実行履歴を取得
  const fetchJobHistory = async () => {
    try {
      const response = await fetch(`/api/jobs/${id}/history`);
      const data = await response.json();

      if (data.success) {
        setHistory(data.data);
      } else {
        console.error('Failed to fetch job history:', data.error);
      }
    } catch (error) {
      console.error('Error fetching job history:', error);
    }
  };

  // ジョブの有効/無効を切り替え
  const toggleJobStatus = async () => {
    try {
      setIsUpdating(true);
      setError(null);

      const response = await fetch(`/api/jobs/${id}/toggle`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        // データのみを更新
        setJob(data.data);
      } else {
        setError(data.error || 'ジョブの状態変更に失敗しました');
      }
    } catch (error) {
      console.error('Error toggling job status:', error);
      setError('ジョブの状態変更中にエラーが発生しました');
    } finally {
      setIsUpdating(false);
    }
  };

  // ジョブを手動実行
  const runJob = async () => {
    try {
      setIsRunning(true);
      setError(null);

      const response = await fetch(`/api/jobs/${id}/run`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        // 成功メッセージを表示（ユーザーに通知）
        const message = document.createElement('div');
        message.className = 'fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded z-50';
        message.innerHTML = '実行を開始しました';
        document.body.appendChild(message);

        // 2秒後にメッセージを消す
        setTimeout(() => {
          if (message.parentNode) {
            message.parentNode.removeChild(message);
          }
        }, 2000);

        // ジョブ情報と履歴を更新
        await fetchJobDetails();
        await fetchJobHistory();
      } else {
        setError(data.error || 'ジョブの実行に失敗しました');
      }
    } catch (error) {
      console.error('Error running job:', error);
      setError('ジョブの実行中にエラーが発生しました');
    } finally {
      setIsRunning(false);
    }
  };

  // 初回マウント時にデータを取得
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchJobDetails();
      await fetchJobHistory();
      setLoading(false);
    };

    loadData();

    // 定期的にデータを更新（5秒ごと）
    const intervalId = setInterval(() => {
      fetchJobDetails();
      fetchJobHistory();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [id]);

  // 日時のフォーマット
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '未設定';
    return new Date(dateString).toLocaleString('ja-JP');
  };

  if (loading) {
    return <div className="text-center py-6">読み込み中...</div>;
  }

  if (!job) {
    return (
      <div className="text-center py-6 bg-red-50 rounded">
        <p className="text-red-600">ジョブが見つかりませんでした</p>
        <Link href="/" className="text-blue-500 hover:underline mt-4 inline-block">
          ジョブ一覧に戻る
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">ジョブ詳細</h2>
        <Link href="/" className="text-blue-500 hover:underline">
          ジョブ一覧に戻る
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="text-xl font-semibold mb-4">{job.name}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-500">説明</h4>
              <p className="mt-1">{job.description || '説明なし'}</p>
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-500">コマンド</h4>
              <p className="mt-1 font-mono bg-gray-50 p-2 rounded">{job.command}</p>
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-500">ステータス</h4>
              <p className="mt-1">
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xs ${job.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                    }`}
                >
                  {job.isActive ? '有効' : '無効'}
                </span>
              </p>
            </div>
          </div>

          <div>
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-500">スケジュールタイプ</h4>
              <p className="mt-1">
                {job.scheduleType === 'once' ? '一回のみ実行' : '定期実行'}
              </p>
            </div>

            {job.scheduleType === 'once' ? (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-500">実行日時</h4>
                <p className="mt-1">{formatDate(job.scheduledAt || null)}</p>
              </div>
            ) : (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-500">実行間隔</h4>
                <p className="mt-1">
                  {job.interval} {job.intervalUnit === 'minute' ? '分' : job.intervalUnit === 'hour' ? '時間' : '日'}
                </p>
              </div>
            )}

            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-500">前回実行</h4>
              <p className="mt-1">{formatDate(job.lastRunAt)}</p>
            </div>

            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-500">次回予定</h4>
              <p className="mt-1">{formatDate(job.nextRunAt)}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex space-x-4">
          <button
            onClick={toggleJobStatus}
            disabled={isUpdating}
            className={`px-4 py-2 rounded relative ${job.isActive
                ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                : 'bg-green-100 text-green-800 hover:bg-green-200'
              } ${isUpdating ? 'opacity-70 cursor-wait' : ''}`}
          >
            {job.isActive ? 'ジョブを無効化' : 'ジョブを有効化'}
            {isUpdating && (
              <span className="absolute inset-0 flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              </span>
            )}
          </button>

          <button
            onClick={runJob}
            disabled={!job.isActive || isRunning}
            className={`px-4 py-2 rounded relative ${job.isActive && !isRunning
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
          >
            ジョブを実行
            {isRunning && (
              <span className="absolute inset-0 flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">実行履歴</h3>

        {history.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded">
            <p className="text-gray-500">実行履歴がありません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2 px-4 border-b text-left">実行開始時間</th>
                  <th className="py-2 px-4 border-b text-left">実行終了時間</th>
                  <th className="py-2 px-4 border-b text-left">ステータス</th>
                  <th className="py-2 px-4 border-b text-left">出力/エラー</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="py-2 px-4 border-b">{formatDate(item.startedAt)}</td>
                    <td className="py-2 px-4 border-b">
                      {item.finishedAt ? formatDate(item.finishedAt) : '実行中...'}
                    </td>
                    <td className="py-2 px-4 border-b">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs ${item.status === 'success'
                          ? 'bg-green-100 text-green-800'
                          : item.status === 'running'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                          }`}
                      >
                        {item.status === 'success'
                          ? '成功'
                          : item.status === 'running'
                            ? '実行中'
                            : '失敗'}
                      </span>
                    </td>
                    <td className="py-2 px-4 border-b">
                      {item.error ? (
                        <div className="text-red-600 whitespace-pre-wrap">{item.error}</div>
                      ) : item.output ? (
                        <div className="whitespace-pre-wrap">{item.output}</div>
                      ) : (
                        <span className="text-gray-500">出力なし</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
