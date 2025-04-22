'use client';

import { useState, useEffect, useCallback } from 'react';
import FilterBuilder, { FilterCondition } from './components/FilterBuilder';
import GroupBySelector from './components/GroupBySelector';
import AggregationBuilder, { AggregationCondition } from './components/AggregationBuilder';

// Import Chart.js components
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// APIレスポンスの型定義 (必要に応じて拡張)
interface DatasetInfo {
  id: string;
  name: string;
  path?: string; // pathはフロントでは必須ではないかも
}

interface ColumnInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'other';
  distinctValues?: (string | number | null)[];
  isNumeric: boolean;
  isDate: boolean;
}

// Type for the API response from /api/query
interface QueryResult {
  generatedSql: string;
  tableData: {
    columns: string[];
    rows: (string | number | boolean | null)[][]; // Assuming API returns consistent types after BigInt conversion
  };
  chartData: any | null; // Define chart data structure more specifically later
}

export default function Home() {
  // --- State ---
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [aggregations, setAggregations] = useState<AggregationCondition[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false); // State for query loading
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null); // State for query result
  const [error, setError] = useState<string>('');

  // --- Data Fetching ---

  // データセット一覧を取得
  const fetchDatasets = useCallback(async () => {
    setLoadingDatasets(true);
    setError('');
    try {
      const response = await fetch('/api/datasets');
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: ${response.statusText}`);
      }
      const data = await response.json();
      setDatasets(data.datasets || []);
      // もしデータセットがあれば、最初のものをデフォルト選択
      if (data.datasets && data.datasets.length > 0) {
        // Keep empty selection initially
        // setSelectedDatasetId(data.datasets[0].id);
      }
    } catch (err) {
      console.error('Error fetching datasets:', err);
      setError(err instanceof Error ? err.message : 'データセットの取得に失敗しました。');
      setDatasets([]); // エラー時は空にする
    } finally {
      setLoadingDatasets(false);
    }
  }, []);

  // カラム情報を取得
  const fetchColumns = useCallback(async (datasetId: string) => {
    if (!datasetId) {
      setColumns([]);
      setFilters([]);
      setGroups([]);
      setAggregations([]);
      setQueryResult(null);
      return;
    }
    setLoadingColumns(true);
    setError('');
    setColumns([]);
    setFilters([]);
    setGroups([]);
    setAggregations([]);
    try {
      const response = await fetch(`/api/columns/${datasetId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Failed to fetch columns: ${response.statusText}` }));
        throw new Error(errorData.error || `Failed to fetch columns: ${response.statusText}`);
      }
      const data = await response.json();
      setColumns(data.columns || []);
    } catch (err) {
      console.error(`Error fetching columns for ${datasetId}:`, err);
      setError(err instanceof Error ? err.message : `カラム情報(${datasetId})の取得に失敗しました。`);
      setColumns([]); // エラー時は空にする
    } finally {
      setLoadingColumns(false);
    }
  }, []);

  // --- Query Execution ---
  const handleRunQuery = async () => {
    if (!selectedDatasetId) {
      setError('Please select a dataset');
      return;
    }
    setLoadingQuery(true);
    setError('');
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          filters: filters,
          groups: groups,
          aggregations: aggregations,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to run query: ${response.statusText}`);
      }
      const data = await response.json();
      setQueryResult(data);
    } catch (err) {
      console.error('Error running query:', err);
      setError(err instanceof Error ? err.message : 'クエリの実行に失敗しました。');
      setQueryResult(null);
    } finally {
      setLoadingQuery(false);
    }
  };

  // --- Effects ---

  // 初回マウント時にデータセット一覧を取得
  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  // 選択されたデータセットが変わったらカラム情報を取得
  useEffect(() => {
    if (selectedDatasetId) {
      fetchColumns(selectedDatasetId);
    } else {
      setColumns([]);
      setFilters([]);
      setGroups([]);
      setAggregations([]);
      setQueryResult(null);
    }
  }, [selectedDatasetId, fetchColumns]);

  // --- Render ---
  return (
    <div className="container mx-auto p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Interactive Data Explorer</h1>
      </header>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Panel: Controls */}
        <div className="md:col-span-1 space-y-4">
          {/* Dataset Selector */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <label htmlFor="dataset-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Select Dataset
            </label>
            <select
              id="dataset-select"
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              disabled={loadingDatasets || datasets.length === 0}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50"
            >
              {loadingDatasets ? (
                <option>Loading datasets...</option>
              ) : (
                <>
                  <option value="" disabled={!selectedDatasetId}>-- Select a dataset --</option>
                  {datasets.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.name} ({ds.id})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {/* Column Info */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h2 className="text-lg font-semibold mb-2">Columns</h2>
            {loadingColumns ? (
              <p className="text-gray-500 dark:text-gray-400">Loading columns...</p>
            ) : columns.length === 0 && selectedDatasetId ? (
              <p className="text-gray-500 dark:text-gray-400">No columns found for this dataset.</p>
            ) : columns.length > 0 ? (
              <ul className="max-h-60 overflow-y-auto text-sm space-y-1">
                {columns.map((col) => (
                  <li key={col.name} className="flex justify-between items-center p-1 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="font-mono truncate" title={col.name}>{col.name}</span>
                    <span className="text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{col.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Select a dataset to view columns.</p>
            )}
          </div>

          {/* Filter Builder */}
          <FilterBuilder
            columns={columns}
            filters={filters}
            onFiltersChange={setFilters}
          />

          {/* Group By Selector */}
          <GroupBySelector
            columns={columns}
            selectedGroups={groups}
            onGroupsChange={setGroups}
          />

          {/* Aggregation Builder */}
          <AggregationBuilder
            columns={columns}
            aggregations={aggregations}
            onAggregationsChange={setAggregations}
          />

          <button onClick={handleRunQuery} disabled={loadingColumns || loadingQuery || !selectedDatasetId} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50">
            {loadingQuery ? 'Running Query...' : 'Run Query'}
          </button>

        </div>

        {/* Right Panel: Results */}
        <div className="md:col-span-2 space-y-6">
          {/* Result Area */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <h2 className="text-xl font-semibold mb-3 border-b pb-2 dark:border-gray-700">Results</h2>
            {loadingQuery && <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading results...</p>}
            {!loadingQuery && !queryResult && <p className="text-gray-500 dark:text-gray-400">Run a query to see results.</p>}

            {queryResult && (
              <div className="space-y-6">
                {/* Generated SQL */}
                <div>
                  <h3 className="text-lg font-medium mb-1">Generated SQL</h3>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">
                    <code>{queryResult.generatedSql}</code>
                  </pre>
                </div>

                {/* Chart */}
                {queryResult.chartData && (
                  <div>
                    <h3 className="text-lg font-medium mb-2">Chart</h3>
                    <div className="relative h-64 md:h-80">
                      {/* Assuming Bar chart for now */}
                      <Bar
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              position: 'top' as const,
                            },
                            title: {
                              display: true,
                              text: `Chart for ${selectedDatasetId}`,
                            },
                          },
                        }}
                        data={queryResult.chartData} // Pass chartData directly
                      />
                    </div>
                  </div>
                )}

                {/* Table Data */}
                <div>
                  <h3 className="text-lg font-medium mb-2">Table Data</h3>
                  {queryResult.tableData.rows.length > 0 ? (
                    <div className="overflow-x-auto max-h-96 relative shadow-md sm:rounded-lg border dark:border-gray-700">
                      <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0">
                          <tr>
                            {queryResult.tableData.columns.map((colName) => (
                              <th key={colName} scope="col" className="py-3 px-6">
                                {colName}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.tableData.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="py-3 px-6">
                                  {cell === null || cell === undefined ? <span className="italic text-gray-400">NULL</span> : String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400">No rows returned.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
