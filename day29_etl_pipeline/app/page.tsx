'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { TransformConfigurator } from '@/components/TransformConfigurator';
import { PipelineMonitor } from '@/components/PipelineMonitor';
import type { TransformConfig } from './_lib/etl'; // Import TransformConfig type
// import type { PipelineRun } from '@prisma/client'; // Keep commented out for now

// Assume sample CSV columns for initial state
// TODO: Ideally, parse the header dynamically upon selection/upload
const SAMPLE_COLUMNS = ['id', 'name', 'age', 'country'];

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transformConfig, setTransformConfig] = useState<TransformConfig>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>(SAMPLE_COLUMNS);
  const [currentPipelineRunId, setCurrentPipelineRunId] = useState<string | null>(null);
  const [pipelineRunDetails, setPipelineRunDetails] = useState<any | null>(null); // Use any for now
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- API Callbacks ---
  const startPipeline = async (url: string, body: FormData | string) => {
    setIsLoading(true);
    setError(null);
    setPipelineRunDetails(null); // Clear previous run details
    setCurrentPipelineRunId(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: body,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'パイプラインの開始に失敗しました');
      }
      console.log('Pipeline started with ID:', result.pipelineRunId);
      setCurrentPipelineRunId(result.pipelineRunId);
    } catch (err: any) {
      console.error('Error starting pipeline:', err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleRunSample = () => {
    console.log("Running with sample data and config:", transformConfig);
    startPipeline('/api/etl/run-sample', JSON.stringify(transformConfig));
  };

  const handleRunUpload = () => {
    if (!selectedFile) {
      setError('アップロードするファイルを選択してください。');
      return;
    }
    console.log(`Running with uploaded file ${selectedFile.name} and config:`, transformConfig);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('config', JSON.stringify(transformConfig));
    startPipeline('/api/etl/run', formData);
  };

  // --- Status Polling Effect ---
  useEffect(() => {
    // Only run the effect if we have a pipeline ID
    if (!currentPipelineRunId) {
      // If ID becomes null (e.g., error, clear), ensure loading is false
      setIsLoading(false);
      setPipelineRunDetails(null);
      return;
    }

    console.log(`[Effect] Running polling effect for pipeline ID: ${currentPipelineRunId}`); // Add log

    let intervalId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        console.log(`[Polling] Fetching status for ${currentPipelineRunId}...`);
        const response = await fetch(`/api/etl/status/${currentPipelineRunId}`);
        if (!response.ok) {
          // ... existing error handling inside fetchStatus ...
           if (response.status === 404) {
             console.error('[Polling] Pipeline run not found (404).');
             setError('パイプライン実行が見つかりません。');
             if (intervalId) clearInterval(intervalId);
             setCurrentPipelineRunId(null); // Stop polling by clearing ID
             // setIsLoading(false); // isLoading is already handled by ID becoming null
           } else {
             console.error('[Polling] Error fetching status:', response.statusText);
           }
           return;
        }
        const data = await response.json();
        console.log('[Polling] Received data:', data);
        setPipelineRunDetails(data);

        // Stop polling if completed or failed
        if (data.status === 'completed' || data.status === 'failed') {
          console.log(`[Polling] Status is ${data.status}. Stopping polling.`);
          if (intervalId) clearInterval(intervalId);
          setIsLoading(false); // Set loading false ONLY when polling stops successfully
        }
      } catch (err) {
        console.error('[Polling] Error in fetchStatus interval:', err);
        // Optionally stop polling on fetch errors
        // if (intervalId) clearInterval(intervalId);
        // setError('ステータスの取得中にエラーが発生しました。');
        // setIsLoading(false);
      }
    };

    // Start polling: Set loading true, call fetchStatus once, then set interval
    setIsLoading(true);
    fetchStatus();
    intervalId = setInterval(fetchStatus, 3000); // Poll every 3 seconds

    // Cleanup function: This runs when currentPipelineRunId changes OR component unmounts
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log('[Effect] Polling stopped and cleaned up.');
      }
    };
    // Depend only on currentPipelineRunId.
  }, [currentPipelineRunId]);

  // TODO: Add logic to parse columns from uploaded CSV preview

  return (
    <main className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Day 29 - ETL Pipeline</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">エラー:</strong>
          <span className="block sm:inline ml-2">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuration Section */}
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
          <h2 className="text-xl font-semibold border-b pb-2">1. データソース</h2>
          <FileUpload onFileSelect={setSelectedFile} disabled={isLoading} />
          <div className="text-center">
            <span className="text-sm text-gray-500 mx-2">または</span>
            <button
              onClick={handleRunSample}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              サンプルデータで実行
            </button>
          </div>

          <h2 className="text-xl font-semibold border-b pb-2 mt-6">2. 変換設定</h2>
          <TransformConfigurator
            availableColumns={availableColumns}
            config={transformConfig}
            onConfigChange={setTransformConfig}
            disabled={isLoading}
          />

          <h2 className="text-xl font-semibold border-b pb-2 mt-6">3. パイプライン実行</h2>
           <button
              onClick={handleRunUpload}
              disabled={isLoading || !selectedFile}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {isLoading ? '実行中...' : 'アップロードしたファイルで実行'}
            </button>
        </div>

        {/* Monitoring Section */}
        <div className="p-4 border rounded-lg">
           <h2 className="text-xl font-semibold border-b pb-2 mb-4">実行モニター</h2>
           {isLoading && !pipelineRunDetails && (
             <p className="text-blue-600 animate-pulse">パイプラインを開始中...</p>
           )}
           {!isLoading && !currentPipelineRunId && !pipelineRunDetails && (
             <p className="text-gray-500">パイプラインを実行すると、ここに状況が表示されます。</p>
           )}
          <PipelineMonitor pipelineRun={pipelineRunDetails} />
        </div>
      </div>

    </main>
  );
}
