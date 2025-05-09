export interface Block {
  id: string;
  data: string | null; // ファイルデータを簡易的に文字列で表現
  refCount: number; // このブロックを参照しているファイル/スナップショットの数
  isSnapshotProtected?: boolean; // スナップショットによって保護されているか（CoW対象か）
  originalBlockId?: string; // CoWでコピーされた場合の元のブロックID
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

export const DEFAULT_TOTAL_BLOCKS = 16;
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
export function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// --- ファイル操作関数 ---

/**
 * 指定されたデータで新しいブロックをディスクに割り当てます。
 * @returns 割り当てられたブロックID、または空きがない場合はnull。
 */
function allocateBlock(disk: VirtualDisk, dataChunk: string, originalBlockIdToLink?: string): { newDisk: VirtualDisk, blockId: string } | null {
  const freeBlockIndex = disk.blocks.findIndex(b => b.refCount === 0 && b.data === null);
  if (freeBlockIndex === -1) {
    console.warn('No free blocks available!');
    return null; // 空きブロックなし
  }

  const newBlocks = [...disk.blocks];
  const targetBlock = { ...newBlocks[freeBlockIndex] };
  targetBlock.data = dataChunk;
  targetBlock.refCount = 1; // 新規割り当てなので参照カウントは1
  targetBlock.isSnapshotProtected = false; // 新規作成時は保護されていない
  if (originalBlockIdToLink) {
    targetBlock.originalBlockId = originalBlockIdToLink;
  }
  newBlocks[freeBlockIndex] = targetBlock;

  return {
    newDisk: {
      ...disk,
      blocks: newBlocks,
      freeBlocks: disk.freeBlocks - 1,
    },
    blockId: targetBlock.id,
  };
}

/**
 * 新しいファイルをディスク上に作成します。
 * ファイル内容はblockSizeBytesごとに分割され、複数のブロックに保存されます。
 * @returns 更新されたディスク状態とファイルリスト、または作成失敗時はnull。
 */
export function createFileOnDisk(
  currentDisk: VirtualDisk,
  currentFiles: FileEntry[],
  fileName: string,
  fileContent: string
): { newDisk: VirtualDisk; newFiles: FileEntry[]; newFile: FileEntry } | null {
  if (currentFiles.some(f => f.name === fileName)) {
    console.warn(`File with name "${fileName}" already exists.`);
    return null; // 同名ファイルが既に存在
  }

  const contentBytes = new TextEncoder().encode(fileContent).length;
  const requiredBlocks = Math.ceil(contentBytes / currentDisk.blockSizeBytes) || 1; // 最低1ブロック

  if (currentDisk.freeBlocks < requiredBlocks) {
    console.warn('Not enough free blocks to create the file.');
    return null; // 空きブロック不足
  }

  let updatedDisk = { ...currentDisk };
  const allocatedBlockIds: string[] = [];

  for (let i = 0; i < requiredBlocks; i++) {
    const chunkStart = i * updatedDisk.blockSizeBytes;
    const chunkEnd = chunkStart + updatedDisk.blockSizeBytes;
    const dataChunk = fileContent.substring(chunkStart, chunkEnd); // 文字単位。正確にはバイト単位で分割すべきだが簡易化

    const allocationResult = allocateBlock(updatedDisk, dataChunk);
    if (!allocationResult) {
      // このケースは事前チェックで防がれるはずだが念のため
      // 既に割り当てたブロックを解放する処理が必要になるが、ここでは省略
      console.error('Failed to allocate block during file creation, this should not happen.');
      return null;
    }
    updatedDisk = allocationResult.newDisk;
    allocatedBlockIds.push(allocationResult.blockId);
  }

  const newFileEntry: FileEntry = {
    id: generateUniqueId(),
    name: fileName,
    blockIds: allocatedBlockIds,
    size: contentBytes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const newFiles = [...currentFiles, newFileEntry];

  return {
    newDisk: updatedDisk,
    newFiles,
    newFile: newFileEntry,
  };
}

/**
 * 指定されたブロックIDのブロックの参照カウントを減らし、
 * 参照がなくなれば解放（データをnull化し、空きブロック数を増やす）します。
 */
function freeBlock(disk: VirtualDisk, blockId: string): VirtualDisk {
  const blockIndex = disk.blocks.findIndex(b => b.id === blockId);
  if (blockIndex === -1) {
    console.warn(`Block with id "${blockId}" not found for freeing.`);
    return disk;
  }

  const newBlocks = [...disk.blocks];
  const targetBlock = { ...newBlocks[blockIndex] };

  if (targetBlock.refCount > 0) {
    targetBlock.refCount -= 1;
  }

  let newFreeBlocks = disk.freeBlocks;
  if (targetBlock.refCount === 0) {
    targetBlock.data = null;
    targetBlock.isSnapshotProtected = false; // 誰も参照しなくなったら保護も解除
    newFreeBlocks += 1;
  }
  newBlocks[blockIndex] = targetBlock;

  return {
    ...disk,
    blocks: newBlocks,
    freeBlocks: newFreeBlocks,
  };
}

/**
 * 既存のファイルを新しい内容で編集（上書き）します。
 * CoW (Copy-on-Write) を実装します。
 *   - スナップショットに保護されているブロック、または複数のファイル/スナップショットから参照されているブロックはコピーして書き込みます。
 *   - それ以外のブロックは直接上書きします。
 * @returns 更新されたディスク状態とファイルリスト、または編集失敗時はnull。
 */
export function editFileOnDisk(
  currentDisk: VirtualDisk,
  currentFiles: FileEntry[],
  fileId: string,
  newFileContent: string
): { newDisk: VirtualDisk; newFiles: FileEntry[]; updatedFile: FileEntry } | null {
  const fileIndex = currentFiles.findIndex(f => f.id === fileId);
  if (fileIndex === -1) {
    console.warn(`File with id "${fileId}" not found for editing.`);
    return null;
  }

  const originalFile = currentFiles[fileIndex];
  let updatedDisk = { ...currentDisk };
  const newBlockIds: string[] = [];

  // まず、元のファイルが使用していたブロックの参照を一旦すべて解放する準備
  // （CoWで新しいブロックにコピーされた場合、古いブロックのrefCountが正しく減るように）
  // ただし、実際に解放するのは新しいブロックの割り当てが終わった後。
  const oldBlockIdsToPotentiallyFree = [...originalFile.blockIds];

  const newContentBytes = new TextEncoder().encode(newFileContent).length;
  const requiredBlocks = Math.ceil(newContentBytes / updatedDisk.blockSizeBytes) || 1;

  // --- CoWロジックとブロック割り当て ---
  // 必要なブロック数と現在の空きブロック + 解放可能性のあるブロックで足りるかチェック
  // (簡易的に、ここでは解放可能ブロックは考慮せず、純粋な空きブロックだけで判断)
  if (updatedDisk.freeBlocks < requiredBlocks - originalFile.blockIds.length) { // 必要な増加分
     // 実際には、CoWによって解放されるブロックも考慮に入れるべきだが、ここでは簡易化
     if (updatedDisk.freeBlocks < requiredBlocks) { // 絶対に必要なブロック数
        console.warn('Not enough free blocks to edit the file (considering CoW).');
        return null;
     }
  }

  for (let i = 0; i < requiredBlocks; i++) {
    const chunkStart = i * updatedDisk.blockSizeBytes;
    const chunkEnd = chunkStart + updatedDisk.blockSizeBytes;
    const dataChunk = newFileContent.substring(chunkStart, chunkEnd);

    const originalBlockId = originalFile.blockIds[i]; // 対応する元のブロックID (もしあれば)
    const originalBlock = originalBlockId ? updatedDisk.blocks.find(b => b.id === originalBlockId) : undefined;

    if (originalBlock && originalBlock.refCount === 1 && !originalBlock.isSnapshotProtected) {
      // (1) 直接上書き可能なケース: このファイルのみが参照し、スナップショット保護なし
      const blockIndex = updatedDisk.blocks.findIndex(b => b.id === originalBlock.id);
      const newBlocksArr = [...updatedDisk.blocks];
      newBlocksArr[blockIndex] = { ...newBlocksArr[blockIndex], data: dataChunk };
      updatedDisk = { ...updatedDisk, blocks: newBlocksArr };
      newBlockIds.push(originalBlock.id);
      // oldBlockIdsToPotentiallyFree から該当IDを削除（解放対象外になったため）
      const idxToRemove = oldBlockIdsToPotentiallyFree.indexOf(originalBlock.id);
      if (idxToRemove > -1) oldBlockIdsToPotentiallyFree.splice(idxToRemove, 1);

    } else {
      // (2) CoWが必要なケース: ブロックが共有されているか、スナップショット保護あり、または新規ブロック
      // (古いブロックの参照カウントは、このループの後でまとめて処理)
      const allocationResult = allocateBlock(updatedDisk, dataChunk, originalBlock?.id);
      if (!allocationResult) {
        console.error('Failed to allocate block during CoW edit.');
        // TODO: ここで失敗した場合、それまでに割り当てたブロックをロールバックする必要がある
        return null;
      }
      updatedDisk = allocationResult.newDisk;
      newBlockIds.push(allocationResult.blockId);
    }
  }

  // --- 古いブロックの解放処理 ---
  // editFileの過程で新しいブロックに置き換わった古いブロックIDについてrefCountを減らす
  for (const blockIdToFree of oldBlockIdsToPotentiallyFree) {
      // ただし、newBlockIds に含まれている場合は、それは再利用されたので解放しない
      if (!newBlockIds.includes(blockIdToFree)) {
          updatedDisk = freeBlock(updatedDisk, blockIdToFree);
      }
  }
  // もし新しいファイルが元のファイルよりブロック数が少ない場合、余った元のブロックを解放
  if (originalFile.blockIds.length > requiredBlocks) {
      for (let i = requiredBlocks; i < originalFile.blockIds.length; i++) {
          const blockIdToFree = originalFile.blockIds[i];
          if (!newBlockIds.includes(blockIdToFree)) { // 新しいブロックリストに含まれていなければ解放
             updatedDisk = freeBlock(updatedDisk, blockIdToFree);
          }
      }
  }


  const updatedFileEntry: FileEntry = {
    ...originalFile,
    blockIds: newBlockIds,
    size: newContentBytes,
    updatedAt: new Date(),
  };

  const newFiles = [...currentFiles];
  newFiles[fileIndex] = updatedFileEntry;

  return {
    newDisk: updatedDisk,
    newFiles,
    updatedFile: updatedFileEntry,
  };
}

/**
 * 指定されたファイルをディスクから削除します。
 * ファイルが使用していたブロックの参照カウントを減らし、不要になったブロックを解放します。
 * @returns 更新されたディスク状態とファイルリスト、または削除失敗時はnull。
 */
export function deleteFileFromDisk(
  currentDisk: VirtualDisk,
  currentFiles: FileEntry[],
  fileId: string
): { newDisk: VirtualDisk; newFiles: FileEntry[] } | null {
  const fileIndex = currentFiles.findIndex(f => f.id === fileId);
  if (fileIndex === -1) {
    console.warn(`File with id "${fileId}" not found for deletion.`);
    return null;
  }

  const fileToDelete = currentFiles[fileIndex];
  let updatedDisk = { ...currentDisk };

  // ファイルが使用していた各ブロックの参照カウントを減らす
  for (const blockId of fileToDelete.blockIds) {
    updatedDisk = freeBlock(updatedDisk, blockId);
  }

  const newFiles = currentFiles.filter(f => f.id !== fileId);

  return {
    newDisk: updatedDisk,
    newFiles,
  };
}

// --- スナップショット関数 ---

/**
 * 現在のファイルシステムの状態で新しいスナップショットを作成します。
 * このスナップショットが参照するブロックは保護フラグが立てられ、参照カウントが増えます。
 * @returns 新しいスナップショットオブジェクトと、更新されたディスク状態（ブロックの保護フラグと参照カウント）。
 */
export function createSnapshotOnDisk(
  currentDisk: VirtualDisk,
  currentFiles: FileEntry[],
  snapshotName?: string
): { newSnapshot: Snapshot; updatedDisk: VirtualDisk } {
  const name = snapshotName || `Snapshot @ ${new Date().toISOString()}`;
  const snapshotId = generateUniqueId();

  // 1. ファイルエントリをディープコピー
  const snapshotFileEntries: FileEntry[] = JSON.parse(JSON.stringify(currentFiles));

  // 2. 現在のファイルが使用している全ブロックIDのセットを作成
  const allReferencedBlockIds = new Set<string>();
  currentFiles.forEach(file => {
    file.blockIds.forEach(blockId => allReferencedBlockIds.add(blockId));
  });

  let updatedBlocks = [...currentDisk.blocks];

  // 3. 参照されるブロックを保護し、参照カウントを増やす
  allReferencedBlockIds.forEach(blockId => {
    const blockIndex = updatedBlocks.findIndex(b => b.id === blockId);
    if (blockIndex !== -1) {
      const newBlock = { ...updatedBlocks[blockIndex] };
      newBlock.isSnapshotProtected = true;
      newBlock.refCount += 1; // スナップショットからの参照を追加
      updatedBlocks[blockIndex] = newBlock;
    }
  });

  const newSnapshot: Snapshot = {
    id: snapshotId,
    name,
    createdAt: new Date(),
    fileEntries: snapshotFileEntries,
    referencedBlockIds: allReferencedBlockIds, // このスナップショットが直接参照するブロック群
  };

  const updatedDiskState: VirtualDisk = {
      ...currentDisk,
      blocks: updatedBlocks,
      // freeBlocks は変わらないはず (既存ブロックのrefCountが増えるだけ)
  };

  return { newSnapshot, updatedDisk: updatedDiskState };
}

/**
 * ローカルで作成された（DBに未保存の）スナップショットを削除します。
 * このスナップショットのみが参照していたブロックを解放します。
 * @returns 更新されたディスク状態とスナップショットリスト、または失敗時はnull。
 */
export function deleteLocalSnapshot(
  currentDisk: VirtualDisk,
  currentSnapshots: Snapshot[],
  snapshotIdToDelete: string
): { updatedDisk: VirtualDisk; updatedSnapshots: Snapshot[] } | null {
  const snapshotIndex = currentSnapshots.findIndex(s => s.id === snapshotIdToDelete);
  if (snapshotIndex === -1) {
    console.warn(`Local snapshot with id "${snapshotIdToDelete}" not found for deletion.`);
    return null;
  }

  const snapshotToDelete = currentSnapshots[snapshotIndex];
  let updatedDisk = { ...currentDisk };

  // このスナップショットが参照していたブロックの参照カウントを減らす
  // isSnapshotProtected フラグは、他のスナップショットも参照していればそのままのはず
  // freeBlock内でrefCountが0になったらisSnapshotProtectedもfalseになる
  snapshotToDelete.referencedBlockIds.forEach(blockId => {
    updatedDisk = freeBlock(updatedDisk, blockId);
  });

  const updatedSnapshots = currentSnapshots.filter(s => s.id !== snapshotIdToDelete);

  return { updatedDisk, updatedSnapshots };
}

// TODO: スナップショットからの復元ロジックなど
