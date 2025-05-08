const getBlockInfo = (
  block: Block,
  files: FileEntry[],
  snapshots: Snapshot[],
  selectedSnapshotId: string | number | null
): { colorClassName: string, additionalClass?: string, title: string } => {
  let title = `ID: ${block.id}\nRefs: ${block.refCount}`;
  if (block.data) title += `\nData: ${block.data.substring(0, 20)}${block.data.length > 20 ? '...' : ''}`;
  if (block.isSnapshotProtected) title += '\nStatus: Snapshot Protected';

  let colorKey = 'UNUSED';
  let additionalClass = '';

  const owningFile = files.find(f => f.blockIds.includes(block.id));
  if (owningFile && owningFile.name) {
    title += `\nFile: ${owningFile.name}`;
  }

  const totalBlocks = disk.totalBlocks;
  const cols = Math.max(1, Math.ceil(Math.sqrt(totalBlocks)));

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

  const baseColor = BLOCK_COLORS[colorKey].className;
  const hoverColorClass = baseColor.includes('bg-') ? baseColor.replace('bg-', 'hover:bg-').replace(/-\d+$/, (match) => `-${Math.max(100, parseInt(match.substring(1)) - 100)}`) : '';

  return {
    colorClassName: `${baseColor} ${hoverColorClass}`,
    additionalClass,
    title,
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
  const cols = Math.max(1, Math.ceil(Math.sqrt(totalBlocks)));

  return (
    <div className="w-full p-1 bg-gray-800 rounded-lg shadow-inner flex gap-3 items-start h-full">
      <div className="pt-1 pl-1 flex flex-col space-y-1.5 flex-shrink-0 w-48">
        <p className="text-sm font-semibold mb-1 border-b border-gray-600 pb-1">凡例:</p>
        {Object.entries(BLOCK_COLORS).map(([key, { className, label }]) => (
          <div key={key} className="flex items-center">
            <span className={`w-4 h-4 mr-2 rounded-sm flex-shrink-0 ${className.split(' ')[0]} ${key === 'SELECTED_SNAPSHOT_REF' ? 'border-amber-400 border-2' : ''}`}></span>
            <span className="text-sm leading-tight">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex-grow flex flex-col items-center min-w-0 h-full justify-center">
        <div
          className={`grid gap-1 aspect-square w-full max-w-md`}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {disk.blocks.map((block) => {
            const { colorClassName, additionalClass, title } = getBlockInfo(block, files, snapshots, selectedSnapshotId);
            return (
              <div
                key={block.id}
                title={title}
                className={`w-full aspect-square rounded-md flex items-center justify-center text-white transition-colors duration-150 ${colorClassName} ${additionalClass || ''}`}
              >
              </div>
            );
          })}
        </div>
        <div className="mt-1 text-center text-xs text-gray-400 flex-shrink-0">
          総ブロック数: {disk.totalBlocks}, 空きブロック数: {disk.freeBlocks}
        </div>
      </div>
    </div>
  );
}
