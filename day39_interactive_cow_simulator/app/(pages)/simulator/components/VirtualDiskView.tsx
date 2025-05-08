'use client';

import { useCowStore } from '../store';
import { Block, FileEntry, Snapshot } from '@/app/_lib/cow-simulator';

interface ColorInfo {
  className: string;
  label: string;
}

// ホバーエフェクトは凡例には不要なので基本色のみ定義
const BLOCK_COLORS: Record<string, ColorInfo> = {
  UNUSED: { className: 'bg-gray-600', label: '未使用' },
  NORMAL_FILE: { className: 'bg-sky-500', label: 'ファイル (保護なし)' },
  SNAPSHOT_PROTECTED: { className: 'bg-purple-500', label: 'スナップショット保護 (CoW対象)' },
  SHARED: { className: 'bg-green-500', label: 'スナップショット間で共有' },
  SELECTED_SNAPSHOT_REF: { className: 'border-2 border-amber-400', label: '現選択スナップショット参照' },
};

const getBlockInfo = (
  block: Block,
  files: FileEntry[],
  snapshots: Snapshot[],
  selectedSnapshotId: string | number | null
): { colorClassName: string, additionalClass?: string, title: string, displayText: string } => {
  let title = `ID: ${block.id}\nRefs: ${block.refCount}`;
  if (block.data) title += `\nData: ${block.data.substring(0, 20)}${block.data.length > 20 ? '...' : ''}`;
  if (block.isSnapshotProtected) title += '\nStatus: Snapshot Protected';

  let colorKey = 'UNUSED';
  let additionalClass = '';
  let displayText = '';

  if (block.data !== null) {
    const owningFile = files.find(f => f.blockIds.includes(block.id));
    if (owningFile && owningFile.name) {
      displayText = owningFile.name.charAt(0).toUpperCase();
      title += `\nFile: ${owningFile.name}`;
    }
  }

  if (block.data !== null && block.refCount > 0) {
    if (block.refCount > 1) {
      colorKey = 'SHARED';
    } else if (block.isSnapshotProtected) {
      colorKey = 'SNAPSHOT_PROTECTED';
    } else {
      colorKey = 'NORMAL_FILE';
    }
  }

  if (selectedSnapshotId) {
    const currentSelectedSnapshot = snapshots.find(s => s.id === String(selectedSnapshotId));
    if (currentSelectedSnapshot && currentSelectedSnapshot.referencedBlockIds.has(block.id)) {
      additionalClass = BLOCK_COLORS.SELECTED_SNAPSHOT_REF.className;
    }
  }

  // ホバー効果はTailwindの hover: prefix で直接クラスに追加
  const baseColor = BLOCK_COLORS[colorKey].className;
  const hoverColorClass = baseColor.includes('bg-') ? baseColor.replace('bg-', 'hover:bg-').replace(/-\d+$/, (match) => `-${Math.max(100, parseInt(match.substring(1)) - 100)}`) : ''; // 少し明るくする

  return {
    colorClassName: `${baseColor} ${hoverColorClass}`,
    additionalClass,
    title,
    displayText,
  };
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
  const cols = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(totalBlocks))));

  return (
    <div className="w-full p-4 bg-gray-800 rounded-lg shadow-inner flex gap-3 items-start h-full">
      {/* 左側: 凡例 */}
      <div className="pt-1 pl-1 flex flex-col space-y-1.5 flex-shrink-0 w-100"> {/* 幅を少し広げる and 凡例のテキストが長くなることを考慮 */}
        <p className="text-xl font-semibold mb-1 border-b border-gray-600 pb-1">凡例:</p>
        {Object.entries(BLOCK_COLORS).map(([key, { className, label }]) => (
          <div key={key} className="flex items-center mt-2">
            <span className={`w-4 h-4 mr-2 rounded-sm flex-shrink-0 ${className.split(' ')[0]} ${key === 'SELECTED_SNAPSHOT_REF' ? 'border-amber-400 border-2' : ''}`}></span>
            <span className="text-xl leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {/* 右側: グリッドと統計 */}
      <div className="flex-grow flex flex-col items-center min-w-0 h-full justify-center">
        <div
          className={`grid gap-2 aspect-square w-full max-w-[450px]`} // サイズ調整
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {disk.blocks.map((block) => {
            const { colorClassName, additionalClass, title, displayText } = getBlockInfo(block, files, snapshots, selectedSnapshotId);
            return (
              <div
                key={block.id}
                title={title}
                className={`w-full aspect-square rounded-sm flex items-center justify-center text-xs text-white transition-colors duration-150 ${colorClassName} ${additionalClass || ''}`}
              >
                {displayText}
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-center text-base text-gray-400 flex-shrink-0">
          総ブロック数: {disk.totalBlocks}, 空きブロック数: {disk.freeBlocks}
        </div>
      </div>
    </div>
  );
}
