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
    <div className="container mx-auto p-2 sm:p-4 flex flex-col min-h-screen bg-gray-800 text-gray-100 max-h-screen overflow-hidden">
      <header className="mb-2 sm:mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-center text-sky-400">
          インタラクティブ CoW ストレージシミュレーター
        </h1>
        <div className="flex justify-center mt-1 sm:mt-2">
          <button
            onClick={resetSimulation}
            className="px-3 py-1 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-md transition-colors text-sm sm:text-base"
          >
            リセット
          </button>
        </div>
      </header>

      <main className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 overflow-hidden">
        <section className="lg:col-span-1 flex flex-col gap-3 sm:gap-4 overflow-y-auto p-2 sm:p-3 bg-gray-700 rounded-lg shadow-xl scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-750">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-teal-300 sticky top-0 bg-gray-700 py-1 z-10">ファイル操作</h2>
            <FileControls />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-indigo-300 sticky top-0 bg-gray-700 py-1 z-10">スナップショット</h2>
            <SnapshotControls />
          </div>
        </section>

        <section className="lg:col-span-1 p-2 sm:p-3 bg-gray-700 rounded-lg shadow-xl flex flex-col items-center justify-start overflow-hidden">
          <h2 className="text-lg sm:text-xl font-semibold mb-2 text-amber-300 self-start sticky top-0 bg-gray-700 py-1 z-10 w-full">仮想ディスク</h2>
          <div className="flex-grow w-full flex items-center justify-center">
            <VirtualDiskView />
          </div>
        </section>

        <section className="lg:col-span-1 flex flex-col gap-3 sm:gap-4 overflow-y-auto p-2 sm:p-3 bg-gray-700 rounded-lg shadow-xl scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-750">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-lime-300 sticky top-0 bg-gray-700 py-1 z-10">スナップショット履歴</h2>
            <SnapshotTreeView />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-pink-300 sticky top-0 bg-gray-700 py-1 z-10">情報パネル</h2>
            <InfoPanel />
          </div>
        </section>
      </main>
    </div>
  );
}
