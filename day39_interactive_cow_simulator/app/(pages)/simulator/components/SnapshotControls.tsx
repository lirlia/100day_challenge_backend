'use client';

import { useState, useEffect } from 'react';
import { useCowStore } from '../store';
import { Snapshot } from '@/app/_lib/cow-simulator';

export default function SnapshotControls() {
  const {
    snapshots,
    selectedSnapshotId,
    isLoadingSnapshots,
    takeLocalSnapshot,
    saveSnapshotToDB,
    loadSnapshotsFromDB,
    selectSnapshot,
    deleteSnapshotFromDB,
    deleteLocalSnapshotAction,
  } = useCowStore();

  const [snapshotNameInput, setSnapshotNameInput] = useState('');

  useEffect(() => {
    loadSnapshotsFromDB();
  }, [loadSnapshotsFromDB]);

  const handleTakeLocalSnapshot = () => {
    const name = snapshotNameInput.trim() || undefined;
    takeLocalSnapshot(name);
    setSnapshotNameInput('');
  };

  const selectedSnapshot = snapshots.find(s => s.id === selectedSnapshotId);
  const isLocalUnsavedSnapshot = selectedSnapshot && isNaN(Number(selectedSnapshot.id));

  const handleSaveToDB = async () => {
    if (selectedSnapshot && isLocalUnsavedSnapshot) {
      const success = await saveSnapshotToDB(selectedSnapshot);
      if (success) {
        // DB保存後、リストが更新されるので選択は維持されるか、またはクリアされる
      }
    } else {
      alert('DBに保存できるのは、まだ保存されていないローカルスナップショットのみです。');
    }
  };

  const handleDeleteFromDB = async () => {
    if (selectedSnapshot && !isLocalUnsavedSnapshot) {
      if (confirm(`スナップショット「${selectedSnapshot.name}」をDBから本当に削除しますか？`)) {
        await deleteSnapshotFromDB(selectedSnapshot.id);
      }
    } else {
      alert('DBから削除できるのは、DBに保存済みのスナップショットのみです。');
    }
  };

  const handleDeleteLocal = () => {
    if (selectedSnapshot && isLocalUnsavedSnapshot) {
      if (confirm(`ローカルスナップショット「${selectedSnapshot.name}」を本当に削除しますか？この操作は取り消せません。`)) {
        deleteLocalSnapshotAction(String(selectedSnapshot.id));
      }
    } else {
      alert('削除できるのは、ローカルにのみ存在する未保存のスナップショットです。');
    }
  };

  return (
    <div className="space-y-4">
      {/* スナップショット作成（ローカル） */}
      <div className="p-3 bg-gray-600 rounded-md shadow">
        <h3 className="text-lg font-medium mb-2 text-gray-200">ローカルスナップショット作成</h3>
        <input
          type="text"
          placeholder="スナップショット名 (任意)"
          value={snapshotNameInput}
          onChange={(e) => setSnapshotNameInput(e.target.value)}
          className="w-full p-2 mb-2 rounded bg-gray-700 border border-gray-500 focus:border-indigo-500 focus:ring-indigo-500 text-gray-100"
        />
        <button
          onClick={handleTakeLocalSnapshot}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors"
        >
          現在の状態でローカルスナップショット作成
        </button>
      </div>

      {/* スナップショットリスト (ローカル + DB) */}
      <div className="p-3 bg-gray-600 rounded-md shadow">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-gray-200">スナップショット一覧</h3>
          <button
            onClick={loadSnapshotsFromDB}
            disabled={isLoadingSnapshots}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            {isLoadingSnapshots ? '読込中...' : 'DBから再読込'}
          </button>
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
                      : isNaN(Number(snap.id))
                        ? 'bg-teal-700 hover:bg-teal-600 text-gray-100'
                        : 'bg-gray-700 hover:bg-gray-550 text-gray-200'}`}
                >
                  {snap.name}
                  <span className="text-xs text-gray-400 ml-1">({new Date(snap.createdAt).toLocaleTimeString()})</span>
                  {isNaN(Number(snap.id)) && <span className='text-xs text-teal-300 ml-1'>(ローカル)</span>}
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
          {isLocalUnsavedSnapshot && (
            <>
              <button
                onClick={handleSaveToDB}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
              >
                このローカルスナップショットをDBに保存
              </button>
              <button
                onClick={handleDeleteLocal}
                className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-md transition-colors"
              >
                このローカルスナップショットを削除 (ローカルのみ)
              </button>
            </>
          )}
          {!isLocalUnsavedSnapshot && (
            <button
              onClick={handleDeleteFromDB}
              className="w-full px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-md transition-colors"
            >
              このDBスナップショットを削除
            </button>
          )}
        </div>
      )}
    </div>
  );
}
