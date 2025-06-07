'use client';

import { useState, useEffect, useRef } from 'react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js';

// Chart.js の登録
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

import { GarbageCollector } from '../lib/garbage-collector';
import { GCConfig, DEFAULT_GC_CONFIG, GCObject } from '../lib/gc-types';

interface GCStats {
  young: {
    name: 'young' | 'old';
    objectCount: number;
    size: number;
    limit: number;
    usageRatio: number;
    freeSpace: number;
    gcCount: number;
  };
  old: {
    name: 'young' | 'old';
    objectCount: number;
    size: number;
    limit: number;
    usageRatio: number;
    freeSpace: number;
    gcCount: number;
  };
  total: {
    objectCount: number;
    size: number;
    limit: number;
    usageRatio: number;
    rootObjects: number;
  };
  config: GCConfig;
}

interface AllocatedObjectInfo {
  id: string;
  type: string;
  size: number;
  generation: 'young' | 'old';
}

export default function GarbageCollectorDashboard() {
  const [stats, setStats] = useState<GCStats | null>(null);
  const [memoryHistory, setMemoryHistory] = useState<number[]>([]);
  const [gcHistory, setGcHistory] = useState<number[]>([]);
  const [timeLabels, setTimeLabels] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [allocatedObjects, setAllocatedObjects] = useState<AllocatedObjectInfo[]>([]);
  const gcRef = useRef<GarbageCollector | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // ガベージコレクターの初期化
  useEffect(() => {
    const gc = new GarbageCollector(DEFAULT_GC_CONFIG, 'frontend-session');
    gcRef.current = gc;

    // 初期統計を取得
    updateStats();
    addLog('✅ Garbage Collector initialized');

    // 定期的に統計を更新
    intervalRef.current = setInterval(() => {
      updateStats();
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (gcRef.current) {
        gcRef.current.shutdown();
      }
    };
  }, []);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  const updateStats = () => {
    if (!gcRef.current) return;

    const heapStats = gcRef.current.getStats();
    const heap = gcRef.current.getHeap();

    const newStats: GCStats = {
      young: heapStats.heap.young,
      old: heapStats.heap.old,
      total: heapStats.heap.total,
      config: heapStats.heap.config,
    };

    setStats(newStats);
    updateChartData(newStats);
  };

  const updateChartData = (gcStats: GCStats) => {
    const now = new Date().toLocaleTimeString();
    const totalMemory = gcStats.total.size;
    const totalGC = gcStats.young.gcCount + gcStats.old.gcCount;

    setMemoryHistory(prev => [...prev.slice(-19), totalMemory]);
    setGcHistory(prev => [...prev.slice(-19), totalGC]);
    setTimeLabels(prev => [...prev.slice(-19), now]);
  };

  const allocateObject = () => {
    if (!gcRef.current) return;

    try {
      const objectData = {
        value: Math.random(),
        timestamp: Date.now(),
        data: new Array(Math.floor(Math.random() * 100) + 50).fill(0) // ランダムサイズ
      };

      const object = gcRef.current.allocate(objectData, 'object', []);

      if (object) {
        const gcObject: AllocatedObjectInfo = {
          id: object.header.id,
          type: object.header.type,
          size: object.header.size,
          generation: object.header.generation,
        };

        setAllocatedObjects(prev => [gcObject, ...prev.slice(0, 99)]);
        addLog(`📦 Object allocated: ${object.header.id} (${object.header.size} bytes)`);

        // ルートオブジェクトとして設定する確率（下げる）
        if (Math.random() < 0.1) {
          gcRef.current.setRootObject(object.header.id);
          addLog(`🔗 Object ${object.header.id} set as root`);
        }
      } else {
        addLog(`❌ Allocation failed: Memory limit reached`);
      }
    } catch (error) {
      addLog(`❌ Allocation failed: ${error}`);
    }
  };

  const triggerGC = async (type: 'young' | 'full') => {
    if (!gcRef.current) return;

    try {
      addLog(`🧹 ${type === 'young' ? 'Young Gen' : 'Full'} GC starting...`);

      const stats = type === 'young'
        ? await gcRef.current.collectYoungGeneration()
        : await gcRef.current.collectFullHeap();

      if (stats) {
        addLog(`✅ GC Completed: freed ${stats.memoryFreed} bytes in ${stats.duration}ms`);
        addLog(`📊 Objects: ${stats.objectsBefore} → ${stats.objectsAfter} (efficiency: ${(stats.collectionEfficiency * 100).toFixed(1)}%)`);
      }

      // 統計を即座に更新
      updateStats();
    } catch (error) {
      addLog(`❌ GC failed: ${error}`);
    }
  };

  const createBulkObjects = () => {
    for (let i = 0; i < 10; i++) {
      allocateObject();
    }
    addLog(`📦 Created 10 objects in bulk`);
  };

  const clearRootObjects = () => {
    if (!gcRef.current) return;

    const heap = gcRef.current.getHeap();
    const rootSet = heap.getRootSet();

    for (const rootId of rootSet) {
      gcRef.current.removeRootObject(rootId);
    }

    addLog(`🗑️ Cleared ${rootSet.size} root objects`);
    updateStats();
  };

  const forceMarkAndSweep = async () => {
    if (!gcRef.current) return;

    try {
      addLog(`🧹 Force Mark-and-Sweep on all generations...`);

      // Full GCを実行（Old世代も含む）
      const stats = await gcRef.current.collectFullHeap();

      if (stats) {
        addLog(`✅ Force GC Completed: freed ${stats.memoryFreed} bytes in ${stats.duration}ms`);
        addLog(`📊 Objects: ${stats.objectsBefore} → ${stats.objectsAfter} (efficiency: ${(stats.collectionEfficiency * 100).toFixed(1)}%)`);
      }

      updateStats();
    } catch (error) {
      addLog(`❌ Force GC failed: ${error}`);
    }
  };

  const showDebugInfo = () => {
    if (!gcRef.current) return;

    const heap = gcRef.current.getHeap();
    const rootSet = heap.getRootSet();
    const youngGen = heap.getYoungGeneration();
    const oldGen = heap.getOldGeneration();

    addLog(`🔍 Debug Info:`);
    addLog(`📌 Root objects: ${rootSet.size} (${Array.from(rootSet).map(id => id.slice(0, 8)).join(', ')})`);
    addLog(`🟢 Young generation: ${youngGen.objects.size} objects`);
    addLog(`🔵 Old generation: ${oldGen.objects.size} objects`);

    // Old世代のオブジェクトの詳細
    if (oldGen.objects.size > 0) {
      addLog(`🔍 Old generation objects:`);
      let count = 0;
      for (const [id, obj] of oldGen.objects) {
        if (count < 5) { // 最初の5個だけ表示
          const isRoot = rootSet.has(id);
          addLog(`  - ${id.slice(0, 8)}: ${obj.header.size}B, marked: ${obj.header.marked}, root: ${isRoot}`);
          count++;
        }
      }
      if (oldGen.objects.size > 5) {
        addLog(`  ... and ${oldGen.objects.size - 5} more objects`);
      }
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatPercentage = (ratio: number) => {
    return (ratio * 100).toFixed(1) + '%';
  };

  // チャートの設定
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#e0e0e0',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#e0e0e0' },
        grid: { color: '#333333' },
      },
      y: {
        ticks: { color: '#e0e0e0' },
        grid: { color: '#333333' },
      },
    },
  };

  const memoryChartData = {
    labels: timeLabels,
    datasets: [
      {
        label: 'Memory Usage (bytes)',
        data: memoryHistory,
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        tension: 0.4,
      },
    ],
  };

  const generationChartData = stats ? {
    labels: ['Young Generation', 'Old Generation'],
    datasets: [
      {
        data: [stats.young.size, stats.old.size],
        backgroundColor: ['#00ff88', '#00ccff'],
        borderColor: ['#00ff88', '#00ccff'],
        borderWidth: 2,
      },
    ],
  } : null;

  if (!stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="pulse-glow w-16 h-16 border-4 border-primary rounded-full border-t-transparent animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold neon-text">Initializing Garbage Collector...</h2>
          <p className="text-muted-foreground mt-2">Setting up in-browser GC simulation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold neon-text">Day57 - Garbage Collector System</h1>
          <p className="text-muted-foreground mt-2">
            Interactive visualization of Mark-and-Sweep & Generational GC (Frontend-only)
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-success"></div>
          <span className="text-sm">Frontend Active</span>
        </div>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="tech-card p-6">
          <div className="metric-label">Total Objects</div>
          <div className="metric-value">{stats.total.objectCount.toLocaleString()}</div>
        </div>
        <div className="tech-card p-6">
          <div className="metric-label">Memory Usage</div>
          <div className="metric-value">{formatBytes(stats.total.size)}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {formatPercentage(stats.total.usageRatio)} of {formatBytes(stats.total.limit)}
          </div>
        </div>
        <div className="tech-card p-6">
          <div className="metric-label">GC Status</div>
          <div className="metric-value status-idle">
            {stats.young.name.toUpperCase()}
          </div>
        </div>
        <div className="tech-card p-6">
          <div className="metric-label">Root Objects</div>
          <div className="metric-value">{stats.total.rootObjects}</div>
        </div>
      </div>

      {/* 世代別統計 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="tech-card p-6">
          <h3 className="text-xl font-semibold mb-4 text-primary">Young Generation</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Objects:</span>
              <span className="font-mono">{stats.young.objectCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Memory:</span>
              <span className="font-mono">{formatBytes(stats.young.size)}</span>
            </div>
            <div className="flex justify-between">
              <span>Usage:</span>
              <span className="font-mono">{formatPercentage(stats.young.usageRatio)}</span>
            </div>
            <div className="progress-bar h-2">
              <div
                className="progress-fill h-full"
                style={{ width: `${stats.young.usageRatio * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between">
              <span>GC Count:</span>
              <span className="font-mono">{stats.young.gcCount}</span>
            </div>
          </div>
        </div>

        <div className="tech-card p-6">
          <h3 className="text-xl font-semibold mb-4 text-secondary">Old Generation</h3>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Objects:</span>
              <span className="font-mono">{stats.old.objectCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Memory:</span>
              <span className="font-mono">{formatBytes(stats.old.size)}</span>
            </div>
            <div className="flex justify-between">
              <span>Usage:</span>
              <span className="font-mono">{formatPercentage(stats.old.usageRatio)}</span>
            </div>
            <div className="progress-bar h-2">
              <div
                className="progress-fill h-full"
                style={{ width: `${stats.old.usageRatio * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between">
              <span>GC Count:</span>
              <span className="font-mono">{stats.old.gcCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* チャート */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="tech-card p-6">
          <h3 className="text-xl font-semibold mb-4">Memory Usage Over Time</h3>
          <div className="h-64">
            <Line data={memoryChartData} options={chartOptions} />
          </div>
        </div>

        {generationChartData && (
          <div className="tech-card p-6">
            <h3 className="text-xl font-semibold mb-4">Memory Distribution</h3>
            <div className="h-64">
              <Doughnut data={generationChartData} options={chartOptions} />
            </div>
          </div>
        )}
      </div>

      {/* コントロールパネル */}
      <div className="tech-card p-6">
        <h3 className="text-xl font-semibold mb-4">Control Panel</h3>
        <div className="flex flex-wrap gap-4">
          <button
            onClick={allocateObject}
            className="tech-button px-6 py-2"
          >
            Allocate Object
          </button>
          <button
            onClick={createBulkObjects}
            className="tech-button px-6 py-2"
          >
            Create 10 Objects
          </button>
          <button
            onClick={() => triggerGC('young')}
            className="tech-button px-6 py-2"
          >
            Trigger Young GC
          </button>
          <button
            onClick={() => triggerGC('full')}
            className="tech-button px-6 py-2"
          >
            Trigger Full GC
          </button>
          <button
            onClick={clearRootObjects}
            className="tech-button px-6 py-2"
          >
            Clear Root Objects
          </button>
          <button
            onClick={forceMarkAndSweep}
            className="tech-button px-6 py-2"
          >
            Force Mark-and-Sweep
          </button>
          <button
            onClick={showDebugInfo}
            className="tech-button px-6 py-2"
          >
            Show Debug Info
          </button>
        </div>
      </div>

      {/* 最近作成されたオブジェクト */}
      <div className="tech-card p-6">
        <h3 className="text-xl font-semibold mb-4">Recent Objects</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-48 overflow-y-auto">
          {allocatedObjects.map((obj, index) => (
            <div key={index} className="bg-muted rounded-lg p-3 border border-border">
              <div className="font-mono text-sm">
                <div className="text-primary">ID: {obj.id.slice(0, 8)}...</div>
                <div>Size: {formatBytes(obj.size)}</div>
                <div className={obj.generation === 'young' ? 'text-green-400' : 'text-blue-400'}>
                  Gen: {obj.generation}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ログ */}
      <div className="tech-card p-6">
        <h3 className="text-xl font-semibold mb-4">Event Log</h3>
        <div className="bg-muted rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
          {logs.map((log, index) => (
            <div key={index} className="mb-1 text-foreground">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
