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
    <div className="container mx-auto p-2 sm:p-4 flex flex-col h-screen bg-gray-800 text-gray-100 overflow-hidden">
      <header className="mb-2 sm:mb-4 flex-shrink-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-center text-sky-400">
          Day39 - Copy-on-Write ストレージシミュレーター
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

      {/* メインコンテンツエリア: 2カラムレイアウト (md以上) */}
      <main className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 overflow-hidden">

        {/* 左カラム: ファイル操作とスナップショット操作 */}
        <section className="md:col-span-1 flex flex-col gap-3 sm:gap-4 overflow-y-auto p-2 sm:p-3 bg-gray-700 rounded-lg shadow-xl scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-750">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-teal-300 sticky top-0 bg-gray-700 py-1 z-10">ファイル操作</h2>
            <FileControls />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-indigo-300 sticky top-0 bg-gray-700 py-1 z-10">スナップショット</h2>
            <SnapshotControls />
          </div>
        </section>

        {/* 右カラム: 仮想ディスク、履歴、情報パネル */}
        <section className="md:col-span-2 flex flex-col gap-3 sm:gap-4 overflow-hidden p-1 sm:p-2">
          {/* 上段: 仮想ディスク表示 */}
          <div className="p-2 sm:p-3 bg-gray-700 rounded-lg shadow-xl flex flex-col items-center justify-start h-1/2 overflow-hidden">
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-amber-300 self-start sticky top-0 bg-gray-700 py-1 z-10 w-full">仮想ディスク</h2>
            <div className="flex-grow w-full flex items-center justify-center">
              <VirtualDiskView />
            </div>
          </div>

          {/* 下段: スナップショット履歴と情報パネル (2分割) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 flex-grow overflow-hidden h-1/2">
            <div className="flex flex-col gap-3 sm:gap-4 overflow-y-auto p-2 sm:p-3 bg-gray-700 rounded-lg shadow-xl scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-750">
              <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-lime-300 sticky top-0 bg-gray-700 py-1 z-10">スナップショット履歴</h2>
              <SnapshotTreeView />
            </div>
            <div className="flex flex-col gap-3 sm:gap-4 overflow-y-auto p-2 sm:p-3 bg-gray-700 rounded-lg shadow-xl scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-750">
              <h2 className="text-lg sm:text-xl font-semibold mb-2 border-b border-gray-600 pb-1 text-pink-300 sticky top-0 bg-gray-700 py-1 z-10">情報パネル</h2>
              <InfoPanel />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
