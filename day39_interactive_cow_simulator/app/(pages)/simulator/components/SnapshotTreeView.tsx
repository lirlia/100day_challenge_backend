'use client';

import { useCowStore } from '../store';
import { Snapshot } from '@/app/_lib/cow-simulator'; // Snapshot型をインポート

// このコンポーネントは、DBのスナップショットとローカルのシミュレーション上のスナップショットの両方を
// 区別して表示するか、あるいはストア側で統合されたリストを受け取ることを想定します。
// ここでは、ストアの `snapshots` がDBからのもの、別途 `localSnapshots` のようなものを
// ストアが持っていると仮定し、マージして表示するイメージで作成します。
// 簡単のため、ここではストアの `snapshots` のみを使用します。

export default function SnapshotTreeView() {
  const {
    snapshots, // これはDBからロードされたスナップショットと仮定
    selectedSnapshotId,
    // selectSnapshot, // ストアのアクション
  } = useCowStore();

  // ダミー
  const selectSnapshot = (id: string | null) => console.log('Select snapshot from tree view', id);

  if (snapshots.length === 0) {
    return (
      <div className="p-3 bg-gray-650 rounded-md shadow text-center">
        <p className="text-gray-400 italic">スナップショット履歴はありません。</p>
      </div>
    );
  }

  // 時系列でソート (新しいものが上)
  const sortedSnapshots = [...snapshots].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="p-3 bg-gray-650 rounded-md shadow">
      <ul className="space-y-2 max-h-80 overflow-y-auto">
        {sortedSnapshots.map((snap: Snapshot) => (
          <li key={snap.id}>
            <button
              onClick={() => selectSnapshot(snap.id)} // 実際にはストアの selectSnapshot を呼ぶ
              title={`ID: ${snap.id}\nCreated: ${new Date(snap.createdAt).toLocaleString()}`}
              className={`w-full text-left p-2 rounded-md transition-colors text-sm flex justify-between items-center
                          ${selectedSnapshotId === snap.id
                  ? 'bg-lime-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-550 text-gray-200'}`}
            >
              <span>{snap.name}</span>
              <span className="text-xs text-gray-400 ml-2">
                {new Date(snap.createdAt).toLocaleTimeString()}
              </span>
            </button>
            {/* TODO: スナップショット間の親子関係などがあればここでインデントや線で表現 */}
          </li>
        ))}
      </ul>
    </div>
  );
}
