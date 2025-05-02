'use client';

import React from 'react';
// import type { PipelineRun } from '@prisma/client'; // Comment out for now
import type { PreviewData } from '../app/_lib/etl'; // Import PreviewData type

interface PipelineMonitorProps {
  pipelineRun: any | null; // Use any for now
}

// Helper to format status
function formatStatus(status: string): string {
  switch (status) {
    case 'pending': return '待機中';
    case 'extracting': return '抽出中 (Extract)';
    case 'transforming': return '変換中 (Transform)';
    case 'loading': return 'ロード中 (Load)';
    case 'completed': return '完了';
    case 'failed': return '失敗';
    default: return status;
  }
}

// Helper to render preview tables
function PreviewTable({ preview }: { preview: PreviewData }) {
    if (!preview || preview.rows.length === 0) {
        return <p className="text-xs text-gray-500 italic">プレビューデータなし</p>;
    }
    return (
        <div className="overflow-x-auto text-xs mt-2">
            <p className="text-xs text-gray-600 mb-1">行数: {preview.rowCount}, プレビュー (最大5行):</p>
            <table className="min-w-full border border-gray-300">
                <thead className="bg-gray-100">
                    <tr>
                        {preview.columns.map((col: string) => (
                            <th key={col} className="p-1 border-b border-gray-300 text-left font-medium">{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {preview.rows.map((row: Record<string, any>, rowIndex: number) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                            {preview.columns.map((col: string) => (
                                <td key={col} className="p-1 border-b border-gray-200 whitespace-nowrap">{String(row[col] ?? '')}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function PipelineMonitor({ pipelineRun }: PipelineMonitorProps) {
  console.log('[Monitor] Received pipelineRun:', pipelineRun); // Log received props
  if (!pipelineRun) {
    return null; // Don't render anything if no pipeline is running/selected
  }

  const previews = (pipelineRun?.previewData || []) as PreviewData[]; // Use optional chaining

  return (
    <div className="mt-6 p-4 border rounded-lg bg-white shadow-md">
      <h3 className="text-lg font-semibold mb-3">パイプライン実行状況 (ID: <span className="font-mono text-sm">{pipelineRun.id}</span>)</h3>

      <div className="mb-3">
        <span className="font-medium">ステータス:</span>
        <span className={`ml-2 font-semibold ${pipelineRun.status === 'completed' ? 'text-green-600' : pipelineRun.status === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
          {formatStatus(pipelineRun.status)}
        </span>
        {pipelineRun.status === 'failed' && pipelineRun.errorMessage && (
            <p className="text-red-600 text-sm mt-1">エラー: {pipelineRun.errorMessage}</p>
        )}
      </div>

      <div className="space-y-4">
        {previews.map((preview, index) => (
          <div key={index} className="border-t pt-3">
            <h4 className="text-sm font-medium capitalize text-gray-700">ステップ: {preview.step.replace('_', ' ')}</h4>
            <PreviewTable preview={preview} />
          </div>
        ))}
      </div>

      {pipelineRun.status === 'completed' && (
        <p className="text-green-600 font-semibold mt-4">✅ パイプラインは正常に完了しました。</p>
      )}
    </div>
  );
}
