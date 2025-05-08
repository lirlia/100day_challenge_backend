'use client';

import { useCowStore } from '../store';
import { Block } from '@/app/_lib/cow-simulator';

const getBlockColor = (block: Block, files: any[], snapshots: any[]): string => {
  if (block.data === null || block.refCount === 0) {
    return 'bg-gray-600 hover:bg-gray-500'; // 未使用
  }

  // TODO: どのファイル/スナップショットに属しているか、isSnapshotProtectedかを判定して色分け
  // ここでは一旦、使用中であれば青、refCount > 1 なら緑で示す
  if (block.refCount > 1) {
    return 'bg-green-500 hover:bg-green-400'; // 共有ブロック
  }
  // isSnapshotProtected の概念をストアとBlock型に追加したら、ここでも判定
  // if (block.isSnapshotProtected) {
  //   return 'bg-purple-500 hover:bg-purple-400'; // スナップショット保護
  // }
  return 'bg-sky-500 hover:bg-sky-400'; // 通常の使用中ブロック
};

export default function VirtualDiskView() {
  const disk = useCowStore((state) => state.disk);
  const files = useCowStore((state) => state.files);
  const snapshots = useCowStore((state) => state.snapshots);

  if (!disk || !disk.blocks) {
    return <div className="text-center text-gray-400">ディスク情報を読み込み中...</div>;
  }

  const totalBlocks = disk.totalBlocks;
  // グリッドの列数を計算 (平方根に近い整数、最大でも16列程度に制限)
  const cols = Math.min(16, Math.ceil(Math.sqrt(totalBlocks)));

  return (
    <div className="w-full p-2 bg-gray-800 rounded-lg shadow-inner">
      <div
        className={`grid gap-1 aspect-square`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {disk.blocks.map((block) => (
          <div
            key={block.id}
            title={`ID: ${block.id}\nData: ${block.data || 'Empty'}\nRefs: ${block.refCount}`}
            className={`w-full aspect-square rounded flex items-center justify-center text-xs text-white transition-colors duration-150 ${getBlockColor(block, files, snapshots)}`}
          >
            {/* {block.id.split('-')[1]} */}
            {/* ブロックIDの一部や、どのファイルに属するかを示す簡易的な文字を表示しても良い */}
          </div>
        ))}
      </div>
      <div className="mt-2 text-center text-sm text-gray-400">
        総ブロック数: {disk.totalBlocks}, 空きブロック数: {disk.freeBlocks}
      </div>
    </div>
  );
}
