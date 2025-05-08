'use client';

import { useCowStore } from '../store';
import { Block, FileEntry, Snapshot } from '@/app/_lib/cow-simulator';

interface ColorInfo {
  className: string;
  label: string;
}

const BLOCK_COLORS: Record<string, ColorInfo> = {
  UNUSED: { className: 'bg-gray-600 hover:bg-gray-500', label: '未使用' },
  NORMAL_FILE: { className: 'bg-sky-500 hover:bg-sky-400', label: 'ファイル (保護なし)' },
  SNAPSHOT_PROTECTED: { className: 'bg-purple-500 hover:bg-purple-400', label: 'スナップショット保護 (CoW対象)' },
  SHARED: { className: 'bg-green-500 hover:bg-green-400', label: '共有 (複数参照)' },
  SELECTED_SNAPSHOT_REF: { className: 'border-2 border-amber-400', label: '現選択スナップショットが参照' },
};

const getBlockInfo = (
  block: Block,
  files: FileEntry[],
  snapshots: Snapshot[],
  selectedSnapshotId: string | number | null
): { color: ColorInfo, additionalClass?: string, title: string } => {
  let title = `ID: ${block.id}\nRefs: ${block.refCount}`;
  if (block.data) title += `\nData: ${block.data.substring(0, 20)}${block.data.length > 20 ? '...' : ''}`;
  if (block.isSnapshotProtected) title += '\nStatus: Snapshot Protected';

  let colorKey = 'UNUSED';
  let additionalClass = '';

  if (block.data !== null && block.refCount > 0) {
    if (block.refCount > 1) {
      colorKey = 'SHARED';
    } else if (block.isSnapshotProtected) {
      colorKey = 'SNAPSHOT_PROTECTED';
    } else {
      colorKey = 'NORMAL_FILE';
    }
  }

  // 選択中のスナップショットがこのブロックを参照しているか確認
  if (selectedSnapshotId) {
    const currentSelectedSnapshot = snapshots.find(s => s.id === String(selectedSnapshotId));
    if (currentSelectedSnapshot && currentSelectedSnapshot.referencedBlockIds.has(block.id)) {
      // SHAREDやSNAPSHOT_PROTECTEDの色をベースに、枠線を追加する
      additionalClass = BLOCK_COLORS.SELECTED_SNAPSHOT_REF.className;
      // title += '\n(Selected snapshot ref)'; // 凡例があるので不要かも
    }
  }

  return { color: BLOCK_COLORS[colorKey], additionalClass, title };
};

export default function VirtualDiskView() {
  const disk = useCowStore((state) => state.disk);
  const files = useCowStore((state) => state.files);
  const snapshots = useCowStore((state) => state.snapshots);
  const selectedSnapshotId = useCowStore((state) => state.selectedSnapshotId);

  if (!disk || !disk.blocks) {
    return <div className="text-center text-gray-400">ディスク情報を読み込み中...</div>;
  }

  const totalBlocks = disk.totalBlocks;
  const cols = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(totalBlocks)))); // 列数を調整 4-12の間

  return (
    <div className="w-full p-2 bg-gray-800 rounded-lg shadow-inner flex flex-col">
      {/* 凡例表示 */}
      <div className="mb-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {Object.entries(BLOCK_COLORS).map(([key, { className, label }]) => (
          <div key={key} className="flex items-center">
            <span className={`w-3 h-3 mr-1 rounded-sm ${className.split(' ')[0]} ${key === 'SELECTED_SNAPSHOT_REF' ? 'border-amber-400 border-2' : ''}`}></span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div
        className={`grid gap-0.5 aspect-square w-full max-w-md mx-auto`} // gap-1 to gap-0.5, max-w-md追加
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {disk.blocks.map((block) => {
          const { color, additionalClass, title } = getBlockInfo(block, files, snapshots, selectedSnapshotId);
          return (
            <div
              key={block.id}
              title={title}
              className={`w-full aspect-square rounded-sm flex items-center justify-center text-[0.6rem] text-white transition-colors duration-150 ${color.className} ${additionalClass}`}
            >
              {/* {block.id.split('-')[1]} */}
            </div>
          );
        })}
      </div>
      <div className="mt-1 text-center text-xs text-gray-400">
        総ブロック数: {disk.totalBlocks}, 空きブロック数: {disk.freeBlocks}
      </div>
    </div>
  );
}
