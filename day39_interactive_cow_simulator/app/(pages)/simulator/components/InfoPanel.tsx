'use client';

import { useCowStore } from '../store';
import { FileEntry, Snapshot } from '@/app/_lib/cow-simulator';

export default function InfoPanel() {
  const {
    disk,
    files,
    snapshots,
    selectedFileId,
    selectedSnapshotId,
    eventLog,
  } = useCowStore();

  const selectedFile = files.find(f => f.id === selectedFileId);
  const selectedSnapshot = snapshots.find(s => s.id === String(selectedSnapshotId));

  const calculateTotalLogicalSize = () => {
    return files.reduce((acc, file) => acc + file.size, 0);
  };

  const calculatePhysicalUsage = () => {
    if (!disk) return { usedBlocks: 0, totalSize: 0 };
    const usedBlocks = disk.blocks.filter(b => b.refCount > 0).length;
    return {
      usedBlocks,
      totalSize: usedBlocks * disk.blockSizeBytes,
    };
  };

  const physicalUsage = calculatePhysicalUsage();

  return (
    <div className="p-3 bg-gray-600 rounded-md shadow space-y-3 text-sm">
      <div>
        <h3 className="text-md font-semibold mb-1 text-gray-200">ディスク統計</h3>
        {disk ? (
          <ul className="list-disc list-inside pl-1 space-y-0.5 text-gray-300">
            <li>総ブロック数: {disk.totalBlocks}</li>
            <li>使用中ブロック (物理): {physicalUsage.usedBlocks} ({((physicalUsage.usedBlocks / disk.totalBlocks) * 100).toFixed(1)}%)</li>
            <li>空きブロック数: {disk.freeBlocks}</li>
            <li>1ブロックのサイズ: {disk.blockSizeBytes} B</li>
            <li>論理ファイルサイズ合計: {calculateTotalLogicalSize()} B</li>
            <li>物理ストレージ使用量: {physicalUsage.totalSize} B</li>
          </ul>
        ) : (
          <p className="text-gray-400 italic">ディスク情報なし</p>
        )}
      </div>

      {selectedFile && (
        <div>
          <h3 className="text-md font-semibold mb-1 text-teal-300">選択中のファイル: {selectedFile.name}</h3>
          <ul className="list-disc list-inside pl-1 space-y-0.5 text-gray-300">
            <li>ID: {selectedFile.id}</li>
            <li>サイズ: {selectedFile.size} B</li>
            <li>ブロック数: {selectedFile.blockIds.length}</li>
            <li>作成日時: {new Date(selectedFile.createdAt).toLocaleString()}</li>
            <li>更新日時: {new Date(selectedFile.updatedAt).toLocaleString()}</li>
          </ul>
        </div>
      )}

      {selectedSnapshot && (
        <div>
          <h3 className="text-md font-semibold mb-1 text-indigo-300">選択中のスナップショット: {selectedSnapshot.name}</h3>
          <ul className="list-disc list-inside pl-1 space-y-0.5 text-gray-300">
            <li>ID: {selectedSnapshot.id}</li>
            <li>作成日時: {new Date(selectedSnapshot.createdAt).toLocaleString()}</li>
            <li>ファイル数 (当時): {selectedSnapshot.fileEntries.length}</li>
            <li>参照ブロック数 (当時): {selectedSnapshot.referencedBlockIds.size}</li>
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-md font-semibold mb-1 text-pink-300">イベントログ</h3>
        {eventLog.length === 0 ? (
          <p className="text-gray-400 italic text-xs">まだイベントはありません。</p>
        ) : (
          <div className="max-h-24 overflow-y-auto bg-gray-700 p-1.5 rounded text-xs space-y-1">
            {eventLog.map((log, index) => (
              <p key={index} className="whitespace-pre-wrap break-all">{log}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
