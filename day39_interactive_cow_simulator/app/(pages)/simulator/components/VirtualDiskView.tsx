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
  COPIED_BLOCK: { className: 'border-2 border-dashed border-yellow-400', label: 'CoWによるコピー' },
  SELECTED_SNAPSHOT_REF: { className: 'border-2 border-amber-400', label: '現選択スナップショット参照' },
};

const getBlockInfo = (
  block: Block,
  files: FileEntry[],
  snapshots: Snapshot[],
  selectedSnapshotId: string | null
): { colorClassName: string, additionalClass?: string, title: string, displayText: string } => {
  let title = `ID: ${block.id}\nRefs: ${block.refCount}`;
  if (block.data) title += `\nData: ${block.data.substring(0, 20)}${block.data.length > 20 ? '...' : ''}`;
  if (block.isSnapshotProtected) title += '\nStatus: Snapshot Protected';
  if (block.originalBlockId) title += `\nOriginal: ${block.originalBlockId} (CoW)`;

  let colorKey = 'UNUSED';
  let additionalClass = '';
  let displayText = '';

  if (block.data !== null) {
    const owningFile = files.find(f => f.blockIds.includes(block.id));
    if (owningFile && owningFile.name) {
      const namePart = owningFile.name.substring(0, 3).toUpperCase();
      const extensionPart = owningFile.name.includes('.') ? `.${owningFile.name.split('.').pop()?.toLowerCase()}` : '';
      if (extensionPart && owningFile.name.length <= 6) {
        displayText = owningFile.name.toUpperCase();
      } else if (namePart.length < 3 && !extensionPart) {
        displayText = namePart;
      } else {
        displayText = namePart + extensionPart;
      }
      if (!displayText && owningFile.name) displayText = owningFile.name.substring(0, 1).toUpperCase();
      title += `\nFile: ${owningFile.name}`;
    } else if (block.isSnapshotProtected || block.refCount > 1) {
      // 現在のファイルリストにはないが、スナップショット保護または共有されているブロック
      displayText = 'SNP';
      title += '\nStatus: Orphaned or snapshot-only block';
    }
    // 上記いずれにも当てはまらないがデータがある場合 (通常は起こりにくい)
    if (!displayText && block.data) {
      displayText = 'DAT'; // Data exists, but no clear owner in current view
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

  if (block.originalBlockId) {
    additionalClass += ` ${BLOCK_COLORS.COPIED_BLOCK.className}`;
  }

  if (selectedSnapshotId) {
    const currentSelectedSnapshot = snapshots.find(s => s.id === String(selectedSnapshotId));
    if (currentSelectedSnapshot && currentSelectedSnapshot.referencedBlockIds.has(block.id)) {
      additionalClass += ` ${BLOCK_COLORS.SELECTED_SNAPSHOT_REF.className}`;
    }
  }

  // ホバー効果はTailwindの hover: prefix で直接クラスに追加
  const baseColor = BLOCK_COLORS[colorKey].className;
  const hoverColorClass = baseColor.includes('bg-') ? baseColor.replace('bg-', 'hover:bg-').replace(/-\d+$/, (match) => `-${Math.max(100, parseInt(match.substring(1)) - 100)}`) : ''; // 少し明るくする

  return {
    colorClassName: `${baseColor} ${hoverColorClass}`,
    additionalClass: additionalClass.trim(),
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
      <div className="pt-1 pl-1 flex flex-col space-y-1.5 flex-shrink-0 w-auto min-w-[200px]">
        <p className="text-2xl font-semibold mb-1 border-b border-gray-600 pb-1">凡例:</p>
        {Object.entries(BLOCK_COLORS).map(([key, { className, label }]) => (
          <div key={key} className="flex items-center mt-4">
            <span
              className={`w-7 h-7 mr-5 rounded-sm flex-shrink-0 ${className.split(' ').find(c => c.startsWith('bg-')) || ''}
                         ${(key === 'SELECTED_SNAPSHOT_REF' || key === 'COPIED_BLOCK') ? className.split(' ').filter(c => c.startsWith('border')).join(' ') : ''}`}>
            </span>
            <span className="text-2xl leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {/* 右側: グリッドと統計 */}
      <div className="flex-grow flex flex-col items-center min-w-0 h-full justify-center">
        <div
          className={`grid gap-1.5 aspect-square w-full max-w-[400px]`}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {disk.blocks.map((block) => {
            const { colorClassName, additionalClass, title, displayText } = getBlockInfo(block, files, snapshots, selectedSnapshotId);
            return (
              <div
                key={block.id}
                title={title}
                className={`w-full aspect-square rounded-sm flex items-center justify-center text-xs font-medium text-white transition-colors duration-150 ${colorClassName} ${additionalClass || ''}`}
              >
                {displayText}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-center text-sm text-gray-400 flex-shrink-0">
          総ブロック数: {disk.totalBlocks}, 空きブロック数: {disk.freeBlocks}
        </div>
      </div>
    </div>
  );
}
