'use client';

import { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { format } from 'date-fns';

// Chart.js の必要なモジュールを登録
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// APIから返されるデータの型 (仮)
type TimeSeriesPoint = {
  timestamp: number; // Unix timestamp (seconds)
  value: number;
};

export default function Home() {
  // 状態管理
  const [registerKey, setRegisterKey] = useState<string>('sensor_A');
  const [registerValue, setRegisterValue] = useState<string>('');
  const [fetchKey, setFetchKey] = useState<string>('sensor_A');
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [fetchMethod, setFetchMethod] = useState<'raw' | 'aggregated' | 'downsampled' | 'latest'>('raw');
  const [startTime, setStartTime] = useState<string>(''); // ISO 8601 形式 (YYYY-MM-DDTHH:mm)
  const [endTime, setEndTime] = useState<string>('');
  const [interval, setInterval] = useState<'minute' | 'hour' | 'day'>('hour');
  const [aggregation, setAggregation] = useState<'avg' | 'max' | 'min' | 'sum' | 'count'>('avg');
  const [downsampleMethod, setDownsampleMethod] = useState<'every_nth' | 'aggregate'>('aggregate');
  const [downsampleFactor, setDownsampleFactor] = useState<string>('60'); // N or seconds
  const [latestLimit, setLatestLimit] = useState<string>('100');

  const [chartData, setChartData] = useState<any>({
    datasets: [],
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // データ登録処理
  const handleRegister = async () => {
    setError(null);
    if (!registerKey || !registerValue) {
      setError('Key and Value are required for registration.');
      return;
    }
    const value = parseFloat(registerValue);
    if (isNaN(value)) {
      setError('Invalid Value for registration.');
      return;
    }

    const timestamp = Math.floor(Date.now() / 1000); // 現在時刻 (Unix秒)

    try {
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: registerKey, timestamp, value }),
      });
      if (!response.ok) {
        throw new Error(`Registration failed: ${response.statusText}`);
      }
      console.log('Registration successful');
      setRegisterValue(''); // フォームをクリア
      // 登録後にキーリストを更新
      fetchAvailableKeys();
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    }
  };

  // データ取得処理
  const handleFetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChartData({ datasets: [] }); // グラフをクリア

    let url = '';
    const params = new URLSearchParams();
    params.append('key', fetchKey);

    const startTs = startTime ? Math.floor(new Date(startTime).getTime() / 1000) : undefined;
    const endTs = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : undefined;

    if (startTs) params.append('start', startTs.toString());
    if (endTs) params.append('end', endTs.toString());

    switch (fetchMethod) {
      case 'raw':
        url = `/api/data?${params.toString()}`;
        break;
      case 'aggregated':
        params.append('interval', interval);
        params.append('aggregation', aggregation);
        url = `/api/data/aggregated?${params.toString()}`;
        break;
      case 'downsampled':
        params.append('method', downsampleMethod);
        params.append('factor', downsampleFactor);
        url = `/api/data/downsampled?${params.toString()}`;
        break;
      case 'latest':
        // latest では start/end は無視される想定だが、念の為削除
        params.delete('start');
        params.delete('end');
        params.append('limit', latestLimit);
        url = `/api/data/latest?${params.toString()}`;
        break;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to fetch data: ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }
      const data: TimeSeriesPoint[] = await response.json();

      // Chart.js 用のデータ形式に変換
      const formattedData = {
        datasets: [
          {
            label: `${fetchKey} (${fetchMethod})`,
            data: data.map(point => ({ x: point.timestamp * 1000, y: point.value })), // x軸はミリ秒
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1,
          },
        ],
      };
      setChartData(formattedData);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchKey, fetchMethod, startTime, endTime, interval, aggregation, downsampleMethod, downsampleFactor, latestLimit]);

  // 利用可能なキーを取得する関数
  const fetchAvailableKeys = useCallback(async () => {
    try {
      const response = await fetch('/api/keys');
      if (!response.ok) throw new Error('Failed to fetch keys');
      const uniqueKeys: string[] = await response.json();
      setAvailableKeys(uniqueKeys);
      // 現在選択中の fetchKey が取得したリストにない場合、または fetchKey が未設定の場合、リストの先頭を設定
      if (uniqueKeys.length > 0 && (!fetchKey || !uniqueKeys.includes(fetchKey))) {
        setFetchKey(uniqueKeys[0]);
      }
    } catch (err) {
      console.error('Failed to fetch available keys:', err);
    }
  }, []);

  // 初期表示時に利用可能なキーを取得
  useEffect(() => {
    fetchAvailableKeys();
  }, []);

  // Chart.js オプション
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Time Series Data',
      },
      tooltip: {
          callbacks: {
              label: function(context: any) {
                  let label = context.dataset.label || '';
                  if (label) {
                      label += ': ';
                  }
                  if (context.parsed.y !== null) {
                      label += context.parsed.y.toFixed(2);
                  }
                  // タイムスタンプも表示
                  const timestamp = context.parsed.x;
                  if (timestamp !== null) {
                      label += ` (${format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss')})`;
                  }
                  return label;
              }
          }
      }
    },
    scales: {
      x: {
        type: 'time' as const, // x軸を時間スケールに設定
        time: {
          unit: 'minute' as const, // 表示単位（データに応じて調整）
          tooltipFormat: 'yyyy-MM-dd HH:mm:ss', // ツールチップのフォーマット
          displayFormats: { // 表示フォーマット
             minute: 'HH:mm',
             hour: 'MM/dd HH:mm',
             day: 'yyyy/MM/dd'
          }
        },
        title: {
          display: true,
          text: 'Time',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Value',
        },
      },
    },
  };

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Day26 - Timeseries DB on SQLite</h1>

      {/* データ登録セクション */}
      <section className="mb-6 p-4 border rounded">
        <h2 className="text-xl font-semibold mb-2">Register Data</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="register-key" className="block text-sm font-medium text-gray-700">Key</label>
            <input
              type="text"
              id="register-key"
              value={registerKey}
              onChange={(e) => setRegisterKey(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="register-value" className="block text-sm font-medium text-gray-700">Value</label>
            <input
              type="number"
              id="register-value"
              value={registerValue}
              onChange={(e) => setRegisterValue(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              step="any"
            />
          </div>
          <button
            onClick={handleRegister}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Register
          </button>
        </div>
      </section>

      {/* データ表示設定セクション */}
      <section className="mb-6 p-4 border rounded">
        <h2 className="text-xl font-semibold mb-2">Fetch & Display Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Key選択 */}
          <div>
            <label htmlFor="fetch-key" className="block text-sm font-medium text-gray-700">Key</label>
            <select
              id="fetch-key"
              value={fetchKey}
              onChange={(e) => setFetchKey(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              {availableKeys.map(k => <option key={k} value={k}>{k}</option>)}
              {availableKeys.length === 0 && <option value="">No keys available</option>}
            </select>
          </div>

          {/* 取得方法選択 */}
          <div>
            <label htmlFor="fetch-method" className="block text-sm font-medium text-gray-700">Fetch Method</label>
            <select
              id="fetch-method"
              value={fetchMethod}
              onChange={(e) => setFetchMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="raw">Raw Data</option>
              <option value="aggregated">Aggregated</option>
              <option value="downsampled">Downsampled</option>
              <option value="latest">Latest N</option>
            </select>
          </div>

          {/* 時間範囲 */}
          <div>
             <label className="block text-sm font-medium text-gray-700">Time Range (Optional)</label>
            <div className="flex gap-2 mt-1">
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                disabled={fetchMethod === 'latest'}
              />
              <span className="self-center">-</span>
               <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                disabled={fetchMethod === 'latest'}
              />
            </div>
             {/* TODO: プリセットボタン (1h, 6h, 24h, 7d) */}
          </div>

          {/* Aggregated 用パラメータ */}
          {fetchMethod === 'aggregated' && (
            <>
              <div>
                <label htmlFor="interval" className="block text-sm font-medium text-gray-700">Interval</label>
                <select id="interval" value={interval} onChange={e => setInterval(e.target.value as any)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  <option value="minute">Minute</option>
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                </select>
              </div>
              <div>
                <label htmlFor="aggregation" className="block text-sm font-medium text-gray-700">Aggregation</label>
                 <select id="aggregation" value={aggregation} onChange={e => setAggregation(e.target.value as any)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  <option value="avg">Average</option>
                  <option value="max">Max</option>
                  <option value="min">Min</option>
                  <option value="sum">Sum</option>
                  <option value="count">Count</option>
                </select>
              </div>
            </>
          )}

           {/* Downsampled 用パラメータ */}
          {fetchMethod === 'downsampled' && (
            <>
              <div>
                <label htmlFor="downsample-method" className="block text-sm font-medium text-gray-700">Downsample Method</label>
                <select id="downsample-method" value={downsampleMethod} onChange={e => setDownsampleMethod(e.target.value as any)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  <option value="aggregate">Aggregate (Avg)</option>
                  <option value="every_nth">Every Nth Point</option>
                </select>
              </div>
              <div>
                 <label htmlFor="downsample-factor" className="block text-sm font-medium text-gray-700">Factor (Seconds or N)</label>
                 <input type="number" id="downsample-factor" value={downsampleFactor} onChange={e => setDownsampleFactor(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" min="1" />
              </div>
            </>
          )}

          {/* Latest 用パラメータ */}
          {fetchMethod === 'latest' && (
             <div>
               <label htmlFor="latest-limit" className="block text-sm font-medium text-gray-700">Limit (N)</label>
               <input type="number" id="latest-limit" value={latestLimit} onChange={e => setLatestLimit(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" min="1" />
            </div>
          )}
        </div>

        <button
          onClick={handleFetchData}
          disabled={loading || !fetchKey}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Fetch & Display Data'}
        </button>
         {error && <p className="text-red-500 mt-2">Error: {error}</p>}
      </section>

      {/* グラフ表示セクション */}
      <section>
        <h2 className="text-xl font-semibold mb-2">Chart</h2>
        <div className="h-96"> {/* 高さを指定しないと表示されない場合がある */}
          {chartData.datasets.length > 0 ? (
             <Line options={options} data={chartData} />
          ) : (
            <p className="text-gray-500">No data to display. Fetch data first.</p>
          )}
        </div>
      </section>

    </main>
  );
}
