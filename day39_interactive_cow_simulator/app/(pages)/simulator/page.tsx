'use client';

import { useCowStore } from './store';
import VirtualDiskView from './components/VirtualDiskView';
import FileControls from './components/FileControls';
import SnapshotControls from './components/SnapshotControls';
import SnapshotTreeView from './components/SnapshotTreeView';
import InfoPanel from './components/InfoPanel';

export default function SimulatorPage() {
  const resetSimulation = useCowStore((state) => state.resetSimulation);
  // 他の必要な状態やアクションもここで取得

  return (
    <div className="container mx-auto p-4 flex flex-col min-h-screen bg-gray-800 text-gray-100">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-center text-sky-400">
          インタラクティブ CoW ストレージシミュレーター
        </h1>
        <div className="flex justify-center mt-2">
          <button
            onClick={resetSimulation}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors"
          >
            シミュレーションをリセット
          </button>
        </div>
      </header>

      <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 space-y-6 p-4 bg-gray-700 rounded-lg shadow-xl">
          <div>
            <h2 className="text-xl font-semibold mb-3 border-b border-gray-600 pb-2 text-teal-300">ファイル操作</h2>
            <FileControls />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-3 border-b border-gray-600 pb-2 text-indigo-300">スナップショット</h2>
            <SnapshotControls />
          </div>
        </section>

        <section className="lg:col-span-2 p-4 bg-gray-700 rounded-lg shadow-xl flex flex-col items-center justify-center">
          <h2 className="text-xl font-semibold mb-3 text-amber-300 self-start">仮想ディスク</h2>
          <VirtualDiskView />
        </section>

        <section className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="p-4 bg-gray-700 rounded-lg shadow-xl">
            <h2 className="text-xl font-semibold mb-3 border-b border-gray-600 pb-2 text-lime-300">スナップショット履歴</h2>
            <SnapshotTreeView />
          </div>
          <div className="p-4 bg-gray-700 rounded-lg shadow-xl">
            <h2 className="text-xl font-semibold mb-3 border-b border-gray-600 pb-2 text-pink-300">情報パネル</h2>
            <InfoPanel />
          </div>
        </section>
      </main>

      <footer className="text-center py-4 mt-auto text-sm text-gray-500">
        Day39 - CoW Simulator
      </footer>
    </div>
  );
}
