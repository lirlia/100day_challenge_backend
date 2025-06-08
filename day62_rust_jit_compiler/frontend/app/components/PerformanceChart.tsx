'use client';

import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface PerformanceData {
  timestamp: number;
  execution_time: number;
  was_jit_compiled: boolean;
}

interface PerformanceChartProps {
  data: PerformanceData[];
}

export default function PerformanceChart({ data }: PerformanceChartProps) {
  const chartRef = useRef<ChartJS<'line'>>(null);

  // データが更新された時にチャートを再描画
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.update();
    }
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-green-400">📈</span>
          パフォーマンス推移
        </h2>
        <div className="flex items-center justify-center h-64">
          <div className="text-slate-400 text-center">
            <div className="text-4xl mb-2">📊</div>
            <p>式を実行するとパフォーマンス履歴が表示されます</p>
          </div>
        </div>
      </div>
    );
  }

  // チャートデータを準備
  const labels = data.map((_, index) => `実行 ${index + 1}`);

  const executionTimes = data.map(d => d.execution_time / 1000); // nsからμsに変換
  const jitCompiledPoints = data.map(d => d.was_jit_compiled ? d.execution_time / 1000 : null);

  const chartData = {
    labels,
    datasets: [
      {
        label: '実行時間 (μs)',
        data: executionTimes,
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: data.map(d => d.was_jit_compiled ? '#a855f7' : '#22c55e'),
        pointBorderColor: data.map(d => d.was_jit_compiled ? '#7c3aed' : '#16a34a'),
        pointBorderWidth: 2,
      },
      {
        label: 'JIT Compiled',
        data: jitCompiledPoints,
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.3)',
        borderWidth: 3,
        fill: false,
        pointRadius: 8,
        pointHoverRadius: 10,
        pointStyle: 'star',
        showLine: false,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#cbd5e1',
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f1f5f9',
        bodyColor: '#cbd5e1',
        borderColor: '#475569',
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const dataIndex = context.dataIndex;
            const pointData = data[dataIndex];

            if (context.datasetIndex === 0) {
              return `実行時間: ${context.parsed.y.toFixed(1)}μs`;
            } else if (context.datasetIndex === 1 && pointData.was_jit_compiled) {
              return `JIT Compiled: ${context.parsed.y.toFixed(1)}μs`;
            }
            return '';
          },
          afterLabel: function(context) {
            const dataIndex = context.dataIndex;
            const pointData = data[dataIndex];

            if (context.datasetIndex === 0) {
              return [
                `タイムスタンプ: ${format(pointData.timestamp, 'HH:mm:ss', { locale: ja })}`,
                pointData.was_jit_compiled ? 'JITコンパイル済み' : 'インタープリタ実行'
              ];
            }
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: '実行回数',
          color: '#94a3b8',
        },
        ticks: {
          color: '#64748b',
          maxTicksLimit: 10,
        },
        grid: {
          color: 'rgba(100, 116, 139, 0.2)',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: '実行時間 (μs)',
          color: '#94a3b8',
        },
        ticks: {
          color: '#64748b',
          callback: function(value) {
            return `${value}μs`;
          },
        },
        grid: {
          color: 'rgba(100, 116, 139, 0.2)',
        },
        beginAtZero: true,
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
    },
  };

  // 統計情報を計算
  const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
  const minTime = Math.min(...executionTimes);
  const maxTime = Math.max(...executionTimes);
  const jitCount = data.filter(d => d.was_jit_compiled).length;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <span className="text-green-400">📈</span>
          パフォーマンス推移
        </h2>
        <div className="text-right text-sm text-slate-400">
          <div>最新 {data.length} 件の実行</div>
          <div>JIT: {jitCount} 件</div>
        </div>
      </div>

      {/* チャート */}
      <div className="h-64 mb-6">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>

      {/* 統計サマリー */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900/50 rounded-lg p-3 text-center">
          <div className="text-green-400 text-lg font-bold">
            {avgTime.toFixed(1)}μs
          </div>
          <div className="text-slate-400 text-sm">平均時間</div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-3 text-center">
          <div className="text-blue-400 text-lg font-bold">
            {minTime.toFixed(1)}μs
          </div>
          <div className="text-slate-400 text-sm">最短時間</div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-3 text-center">
          <div className="text-red-400 text-lg font-bold">
            {maxTime.toFixed(1)}μs
          </div>
          <div className="text-slate-400 text-sm">最長時間</div>
        </div>
      </div>

      {/* 凡例説明 */}
      <div className="mt-4 text-xs text-slate-400 space-y-1">
        <p>• <span className="text-green-400">緑の線</span>: 実行時間の推移</p>
        <p>• <span className="text-purple-400">紫の星</span>: JITコンパイルされた実行</p>
        <p>• グラフ上のポイントをホバーすると詳細が表示されます</p>
      </div>
    </div>
  );
}