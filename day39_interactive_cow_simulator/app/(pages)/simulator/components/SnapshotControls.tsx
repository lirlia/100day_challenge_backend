'use client';

import { useState } from 'react';
import { useCowStore } from '../store';
import { Snapshot } from '@/app/_lib/cow-simulator';

export default function SnapshotControls() {
  const {
    snapshots,
    selectedSnapshotId,
    takeSnapshot,
    selectSnapshot,
    deleteSnapshot,
    restoreFromSnapshot,
  } = useCowStore();

  const [snapshotNameInput, setSnapshotNameInput] = useState('');

  const handleTakeSnapshot = () => {
    const name = snapshotNameInput.trim() || undefined;
    takeSnapshot(name);
    setSnapshotNameInput('');
  };

  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);

  const handleDeleteSnapshot = () => {
    if (selectedSnapshot) {
      deleteSnapshot(selectedSnapshot.id);
    } else {
      alert('削除するスナップショットを選択してください。');
      useCowStore.getState().addEventLog('Error: No snapshot selected for deletion.');
    }
  };

  const handleRestoreSnapshot = () => {
    if (selectedSnapshot) {
      restoreFromSnapshot(selectedSnapshot.id);
    } else {
      alert('復元するスナップショットを選択してください。');
      useCowStore.getState().addEventLog('Error: No snapshot selected for restoration.');
    }
  };

  return (
    <div className="space-y-4">
      {/* スナップショット作成 */}
      <div className="p-3 bg-gray-600 rounded-md shadow">
        <h3 className="text-lg font-medium mb-2 text-gray-200">スナップショット作成</h3>
        <input
          type="text"
          placeholder="スナップショット名 (任意)"
          value={snapshotNameInput}
          onChange={(e) => setSnapshotNameInput(e.target.value)}
          className="w-full p-2 mb-2 rounded bg-gray-700 border border-gray-500 focus:border-indigo-500 focus:ring-indigo-500 text-gray-100"
        />
        <button
          onClick={handleTakeSnapshot}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors"
        >
          現在の状態でスナップショット作成
        </button>
      </div>

      {/* スナップショットリスト */}
      <div className="p-3 bg-gray-600 rounded-md shadow">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-gray-200">スナップショット一覧</h3>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-gray-400 italic">スナップショットはありません。</p>
        ) : (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {snapshots.map((snap: Snapshot) => (
              <li key={snap.id}>
                <button
                  onClick={() => selectSnapshot(snap.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm
                                ${selectedSnapshotId === snap.id
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-700 hover:bg-gray-550 text-gray-200'}`
                  }
                >
                  {snap.name}
                  <span className="text-xs text-gray-400 ml-1">({new Date(snap.createdAt).toLocaleTimeString()})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 選択中スナップショットの操作 */}
      {selectedSnapshot && (
        <div className="p-3 bg-gray-600 rounded-md shadow space-y-2">
          <h3 className="text-lg font-medium mb-1 text-gray-200">
            選択中: {selectedSnapshot.name}
          </h3>
          <button
            onClick={handleRestoreSnapshot}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors mb-2"
          >
            この状態に復元
          </button>
          <button
            onClick={handleDeleteSnapshot}
            className="w-full px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-md transition-colors"
          >
            このスナップショットを削除
          </button>
        </div>
      )}
    </div>
  );
}
