export interface Block {
  id: string;
  data: string | null; // ファイルデータを簡易的に文字列で表現
  refCount: number; // このブロックを参照しているファイル/スナップショットの数
  isSnapshotProtected?: boolean; // スナップショットによって保護されているか（CoW対象か）
}

export interface FileEntry {
  id: string;
  name: string;
  blockIds: string[]; // このファイルを構成するBlockのIDの配列
  size: number; // バイト単位のファイルサイズ (ここではブロック数 * 想定ブロックサイズで簡易計算)
  createdAt: Date;
  updatedAt: Date;
}

export interface VirtualDisk {
  blocks: Block[];
  totalBlocks: number;
  freeBlocks: number;
  blockSizeBytes: number; // 1ブロックあたりの想定サイズ (ファイルサイズ計算用)
}

export interface Snapshot {
  id: string;
  name: string;
  createdAt: Date;
  // スナップショット作成時のファイルエントリのディープコピーを保持
  fileEntries: FileEntry[];
  // スナップショットが参照するブロックIDのセット（どのブロックがこのスナップショットに属するか）
  // これにより、あるブロックが解放可能かどうかの判断が容易になる
  referencedBlockIds: Set<string>;
}

// --- 初期化ロジック ---

export const DEFAULT_TOTAL_BLOCKS = 64; // 例: 8x8 のグリッド
export const DEFAULT_BLOCK_SIZE_BYTES = 1024; // 1KB

/**
 * 新しい仮想ディスクを初期化します。
 */
export function initializeVirtualDisk(
  totalBlocks: number = DEFAULT_TOTAL_BLOCKS,
  blockSizeBytes: number = DEFAULT_BLOCK_SIZE_BYTES
): VirtualDisk {
  const blocks: Block[] = [];
  for (let i = 0; i < totalBlocks; i++) {
    blocks.push({
      id: `block-${i}`,
      data: null,
      refCount: 0,
    });
  }
  return {
    blocks,
    totalBlocks,
    freeBlocks: totalBlocks,
    blockSizeBytes,
  };
}

// --- ユーティリティ関数 ---

/**
 * ユニークなIDを生成します (簡易版)
 */
function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// 後続でファイル操作関数、スナップショット関数などを追加予定
