export const BLOCK_SIZE = 10; // bytes

export function initializeVirtualDisk(totalBlocks = 9, blockSize = BLOCK_SIZE): VirtualDisk {
  const blocks: Block[] = [];
  for (let i = 0; i < totalBlocks; i++) {
    // ... existing code ...
  }
}
