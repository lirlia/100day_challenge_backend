'use client';

import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale, // TimeScale をインポート
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns'; // date-fns アダプターをインポート

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  TimeScale, // TimeScale を登録
  Title,
  Tooltip,
  Legend
);

type PriceHistory = {
  price: number;
  startDate: string; // ISO 8601 形式の日時文字列
};

type PriceHistoryChartProps = {
  productId: number;
};

export default function PriceHistoryChart({ productId }: PriceHistoryChartProps) {
  const [chartData, setChartData] = useState<any>(null); // 型は chart.js のデータ構造に合わせる
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/products/${productId}/price-history`);
        if (!response.ok) {
          throw new Error('Failed to fetch price history');
        }
        const data: PriceHistory[] = await response.json();

        if (data.length === 0) {
          setChartData(null); // データがない場合はグラフを表示しない
          return;
        }

        // Chart.js 用のデータ形式に変換
        const labels = data.map(item => new Date(item.startDate)); // Dateオブジェクトに変換
        const prices = data.map(item => item.price);

        setChartData({
          labels: labels,
          datasets: [
            {
              label: '価格 (JPY)',
              data: prices,
              borderColor: 'rgb(59, 130, 246)', // Tailwind の blue-600
              backgroundColor: 'rgba(59, 130, 246, 0.5)',
              tension: 0.3, // 線の滑らかさを少し上げる (例: 0.1 -> 0.3)
              pointRadius: 0, // データ点を非表示にする
            },
          ],
        });

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [productId]);

  const options = {
    responsive: true,
    maintainAspectRatio: false, // アスペクト比を維持しない
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '価格変動履歴',
      },
      tooltip: {
        callbacks: {
            label: function(context: any) {
                let label = context.dataset.label || '';
                if (label) {
                    label += ': ';
                }
                if (context.parsed.y !== null) {
                    label += new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(context.parsed.y);
                }
                return label;
            }
        }
      }
    },
    scales: {
      x: {
        type: 'time' as const, // 時間軸を使用
        time: {
          unit: 'day' as const, // 表示単位（必要に応じて調整）
          tooltipFormat: 'yyyy/MM/dd HH:mm', // ツールチップの日時フォーマット
          displayFormats: { // 軸ラベルのフォーマット
             day: 'MM/dd',
             week: 'MM/dd',
             month: 'yyyy/MM',
             quarter: 'yyyy/MM',
             year: 'yyyy'
          }
        },
        title: {
          display: true,
          text: '日時'
        }
      },
      y: {
        title: {
          display: true,
          text: '価格 (円)'
        },
        ticks: { // Y軸の目盛りを円表示にする
            callback: function(value: any, index: any, values: any) {
                return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(value);
            }
        }
      }
    }
  };

  if (isLoading) {
    return <div className="text-center py-4">グラフを読み込み中...</div>;
  }

  if (error) {
    return <div className="text-center py-4 text-red-600">エラー: {error}</div>;
  }

  if (!chartData) {
    return <div className="text-center py-4 text-gray-500">価格履歴データがありません。</div>;
  }

  return (
    <div className="relative h-80 md:h-96"> {/* 高さを指定 */}
      <Line options={options} data={chartData} />
    </div>
  );
}
