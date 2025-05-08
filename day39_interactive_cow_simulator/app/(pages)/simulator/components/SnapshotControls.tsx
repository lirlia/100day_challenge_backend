'use client';

import { useState } from 'react';
import { useCowStore } from '../store';
import { Snapshot } from '@/app/_lib/cow-simulator'; // Snapshot型をインポート

export default function SnapshotControls() {
  const {
    snapshots,
    selectedSnapshotId,
    // takeSnapshot, // ストアで後ほど実装
    // selectSnapshot, // ストアで後ほど実装
    // restoreSnapshot, // ストアで後ほど実装
    // deleteDBSnapshot, // ストアで後ほど実装 (API連携)
    // loadSnapshotsFromDB, // ストアで後ほど実装 (API連携)
  } = useCowStore();

  // ダミーのアクション
  const takeSnapshot = (name?: string) => console.log('Take snapshot action triggered', name);
  const selectSnapshot = (id: string | null) => console.log('Select snapshot action triggered for', id);
  const restoreSnapshot = (id: string) => console.log('Restore snapshot action triggered for', id);
  const deleteDBSnapshot = async (id: string) => console.log('Delete DB snapshot action triggered for', id);
  const loadSnapshotsFromDB = async () => console.log('Load snapshots from DB action triggered');

  const [snapshotNameInput, setSnapshotNameInput] = useState('');

  const handleTakeSnapshot = () => {
    const name = snapshotNameInput.trim() || `Snapshot ${new Date().toLocaleString()}`;
    // takeSnapshot(name); // ストアのアクション
    console.log('Simulating taking snapshot:', name);
    setSnapshotNameInput('');
  };

  const handleDeleteSnapshot = async () => {
    if (!selectedSnapshotId) return;
    if (confirm('本当にこのスナップショットをDBから削除しますか？（ローカルのシミュレーション状態には影響しません）')) {
      // await deleteDBSnapshot(selectedSnapshotId); // ストアのアクション
      console.log('Simulating DB snapshot deletion for:', selectedSnapshotId);
    }
  };

  // useEffect(() => {
  //   loadSnapshotsFromDB(); // 初期ロード
  // }, []);

  return (
    <div className="space-y-4">
      {/* スナップショット作成 */}
      <div className="p-3 bg-gray-650 rounded-md shadow">
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

      {/* スナップショットリスト (DBから取得) */}
      <div className="p-3 bg-gray-650 rounded-md shadow">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-gray-200">保存済みスナップショット</h3>
          <button
            onClick={() => loadSnapshotsFromDB()}
            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            再読込
          </button>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-gray-400 italic">保存されたスナップショットはありません。</p>
        ) : (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {snapshots.map((snap: Snapshot) => (
              <li key={snap.id}>
                <button
                  onClick={() => selectSnapshot(snap.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm
                                ${selectedSnapshotId === snap.id
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-700 hover:bg-gray-550 text-gray-200'}`}
                >
                  {snap.name} <span className="text-xs text-gray-400">({new Date(snap.createdAt).toLocaleString()})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 選択中スナップショットの操作 */}
      {selectedSnapshotId && snapshots.find(s => s.id === selectedSnapshotId) && (
        <div className="p-3 bg-gray-650 rounded-md shadow space-y-2">
          <h3 className="text-lg font-medium mb-1 text-gray-200">
            選択中: {snapshots.find(s => s.id === selectedSnapshotId)?.name}
          </h3>
          <button
            onClick={() => restoreSnapshot(selectedSnapshotId)}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors"
          >
            この状態をプレビュー (読取専用)
          </button>
          <button
            onClick={handleDeleteSnapshot}
            className="w-full px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-md transition-colors"
          >
            DBから削除
          </button>
        </div>
      )}
    </div>
  );
}
