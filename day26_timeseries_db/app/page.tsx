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

  // Chart.js オプション (ダークモード対応)
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#e5e7eb', // gray-200
        }
      },
      title: {
        display: true,
        text: 'Time Series Data',
        color: '#f9fafb', // gray-100
      },
      tooltip: {
          backgroundColor: 'rgba(31, 41, 55, 0.9)', // gray-800 半透明
          titleColor: '#f9fafb', // gray-100
          bodyColor: '#e5e7eb', // gray-200
          borderColor: '#4b5563', // gray-600
          borderWidth: 1,
          callbacks: {
              label: function(context: any) {
                  let label = context.dataset.label || '';
                  if (label) { label += ': '; }
                  if (context.parsed.y !== null) { label += context.parsed.y.toFixed(2); }
                  const timestamp = context.parsed.x;
                  if (timestamp !== null) { label += ` (${format(new Date(timestamp), 'yyyy-MM-dd HH:mm:ss')})`; }
                  return label;
              }
          }
      }
    },
    scales: {
      x: {
        type: 'time' as const,
        time: {
          unit: 'minute' as const,
          tooltipFormat: 'yyyy-MM-dd HH:mm:ss',
          displayFormats: { minute: 'HH:mm', hour: 'MM/dd HH:mm', day: 'yyyy/MM/dd' }
        },
        title: { display: true, text: 'Time', color: '#d1d5db' }, // gray-300
        ticks: { color: '#9ca3af' }, // gray-400
        grid: { color: '#4b5563' } // gray-600
      },
      y: {
        title: { display: true, text: 'Value', color: '#d1d5db' }, // gray-300
        ticks: { color: '#9ca3af' }, // gray-400
        grid: { color: '#4b5563' } // gray-600
      },
    },
  };

  // Chart.js データ (ダークモード対応)
   const updateChartData = (data: TimeSeriesPoint[]) => {
     const formattedData = {
        datasets: [
          {
            label: `${fetchKey} (${fetchMethod})`,
            data: data.map(point => ({ x: point.timestamp * 1000, y: point.value })),
            borderColor: '#10b981', // emerald-500
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.1,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#374151', // gray-700 or a contrasting dark color
            pointHoverBackgroundColor: '#f9fafb', // gray-100
            pointHoverBorderColor: '#10b981',
            pointRadius: 3, // ポイントサイズ調整
            pointHoverRadius: 5,
          },
        ],
      };
      setChartData(formattedData);
  }

  // データ取得処理を修正して updateChartData を呼ぶ
  const handleFetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChartData({ datasets: [] });

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
      updateChartData(data); // ★ 修正: 新しい関数でチャートデータを更新

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchKey, fetchMethod, startTime, endTime, interval, aggregation, downsampleMethod, downsampleFactor, latestLimit]); // updateChartData は useCallback の外なので依存不要

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

  return (
    <main className="container mx-auto p-4 bg-gray-900 text-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-100">Day26 - Timeseries DB (Dark Mode)</h1>

      {/* データ登録セクション (ダークモードスタイル適用) */}
      <section className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-lg">
        <h2 className="text-xl font-semibold mb-3 text-gray-200">Register Data</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="register-key" className="block text-sm font-medium text-gray-300 mb-1">Key</label>
            <input
              type="text"
              id="register-key"
              value={registerKey}
              onChange={(e) => setRegisterKey(e.target.value)}
              className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 sm:text-sm py-2 px-3"
            />
          </div>
          <div>
            <label htmlFor="register-value" className="block text-sm font-medium text-gray-300 mb-1">Value</label>
            <input
              type="number"
              id="register-value"
              value={registerValue}
              onChange={(e) => setRegisterValue(e.target.value)}
              className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 sm:text-sm py-2 px-3"
              step="any"
            />
          </div>
          <button
            onClick={handleRegister}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-md shadow transition duration-150 ease-in-out"
          >
            Register
          </button>
        </div>
        {/* エラー表示エリア (もしあれば) */}
        {error && error.includes('Registration') && <p className="text-red-400 mt-3">{error}</p>}
      </section>

      {/* データ表示設定セクション (ダークモードスタイル適用) */}
      <section className="mb-6 p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-lg">
        <h2 className="text-xl font-semibold mb-3 text-gray-200">Fetch & Display Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 items-start"> {/* Adjust grid for better layout */}
          {/* Key選択 */}
          <div className="lg:col-span-1">
            <label htmlFor="fetch-key" className="block text-sm font-medium text-gray-300 mb-1">Key</label>
            <select
              id="fetch-key"
              value={fetchKey}
              onChange={(e) => setFetchKey(e.target.value)}
              className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3"
            >
              {availableKeys.map(k => <option key={k} value={k}>{k}</option>)}
              {availableKeys.length === 0 && <option value="">Loading keys...</option>}
            </select>
          </div>

          {/* 取得方法選択 */}
          <div className="lg:col-span-1">
            <label htmlFor="fetch-method" className="block text-sm font-medium text-gray-300 mb-1">Fetch Method</label>
            <select
              id="fetch-method"
              value={fetchMethod}
              onChange={(e) => setFetchMethod(e.target.value as any)}
              className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3"
            >
              <option value="raw">Raw Data</option>
              <option value="aggregated">Aggregated</option>
              <option value="downsampled">Downsampled</option>
              <option value="latest">Latest N</option>
            </select>
          </div>

          {/* 時間範囲 */}
          <div className="lg:col-span-2"> {/* Make time range span 2 columns */}
             <label className="block text-sm font-medium text-gray-300 mb-1">Time Range (Optional)</label>
            <div className="flex gap-2 items-center">
              <input
                type="datetime-local"
                aria-label="Start time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3 disabled:opacity-50"
                disabled={fetchMethod === 'latest'}
                style={{ colorScheme: 'dark' }} // Ensure calendar icon is visible
              />
              <span className="text-gray-400">-</span>
               <input
                type="datetime-local"
                aria-label="End time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3 disabled:opacity-50"
                disabled={fetchMethod === 'latest'}
                 style={{ colorScheme: 'dark' }} // Ensure calendar icon is visible
              />
            </div>
             {/* TODO: Add preset time range buttons (1h, 6h, 24h, 7d) here */}
          </div>

          {/* Conditional Parameters Section */}
          <div className="lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Span full width and nest grid */}
            {/* Aggregated 用パラメータ */}
            {fetchMethod === 'aggregated' && (
              <>
                <div>
                  <label htmlFor="interval" className="block text-sm font-medium text-gray-300 mb-1">Interval</label>
                  <select id="interval" value={interval} onChange={e => setInterval(e.target.value as any)} className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3">
                    <option value="minute">Minute</option>
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="aggregation" className="block text-sm font-medium text-gray-300 mb-1">Aggregation</label>
                  <select id="aggregation" value={aggregation} onChange={e => setAggregation(e.target.value as any)} className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3">
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
                  <label htmlFor="downsample-method" className="block text-sm font-medium text-gray-300 mb-1">Downsample Method</label>
                  <select id="downsample-method" value={downsampleMethod} onChange={e => setDownsampleMethod(e.target.value as any)} className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3">
                    <option value="aggregate">Aggregate (Avg)</option>
                    <option value="every_nth">Every Nth Point</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="downsample-factor" className="block text-sm font-medium text-gray-300 mb-1">Factor (Seconds or N)</label>
                  <input type="number" id="downsample-factor" value={downsampleFactor} onChange={e => setDownsampleFactor(e.target.value)} className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3" min="1" />
                </div>
              </>
            )}

            {/* Latest 用パラメータ */}
            {fetchMethod === 'latest' && (
              <div>
                <label htmlFor="latest-limit" className="block text-sm font-medium text-gray-300 mb-1">Limit (N)</label>
                <input type="number" id="latest-limit" value={latestLimit} onChange={e => setLatestLimit(e.target.value)} className="block w-full rounded-md border-gray-600 bg-gray-700 text-gray-100 shadow-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 sm:text-sm py-2 px-3" min="1" />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4"> {/* Button and error message area */}
          <button
            onClick={handleFetchData}
            disabled={loading || !fetchKey}
            className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-md shadow disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </span>
            ) : 'Fetch & Display Data'}
          </button>
          {/* データ取得エラー表示 */}
          {error && !error.includes('Registration') && <p className="text-red-400 mt-3">Error: {error}</p>}
        </div>
      </section>

      {/* グラフ表示セクション (ダークモードスタイル適用) */}
      <section className="p-4 border border-gray-700 rounded-lg bg-gray-800 shadow-lg">
        <h2 className="text-xl font-semibold mb-2 text-gray-200">Chart</h2>
        <div className="h-96 w-full bg-gray-800 rounded">
          {chartData.datasets && chartData.datasets.length > 0 && chartData.datasets[0].data.length > 0 ? (
             <Line options={options} data={chartData} updateMode="resize" /> // updateMode追加
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 italic">{loading ? 'Loading chart data...' : 'No data to display. Fetch data first.'}</p>
             </div>
          )}
        </div>
      </section>

    </main>
  );
}
