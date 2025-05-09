import { create } from 'zustand';
import {
  VirtualDisk,
  FileEntry,
  Snapshot,
  initializeVirtualDisk,
  createFileOnDisk,
  generateUniqueId,
  editFileOnDisk,
  deleteFileFromDisk,
  createSnapshotOnDisk,
  deleteLocalSnapshot,
  Block,
} from '../../_lib/cow-simulator';

interface CowSimulatorState {
  disk: VirtualDisk;
  files: FileEntry[];
  snapshots: Snapshot[]; // ローカルスナップショットのみ
  selectedFileId: string | null;
  selectedSnapshotId: string | null; // IDはstringのみになる
  fileNameInput: string;
  fileContentInput: string;
  eventLog: string[];

  setFileNameInput: (name: string) => void;
  setFileContentInput: (content: string) => void;
  addEventLog: (log: string) => void;

  createFile: () => void;
  selectFile: (fileId: string | null) => void;
  editFile: () => void;
  deleteFile: (fileId: string) => void;

  takeSnapshot: (name?: string) => void; // 名前変更
  selectSnapshot: (snapshotId: string | null) => void; // 引数型変更
  viewSnapshotState: (snapshotId: string) => void; // 引数型変更
  deleteSnapshot: (snapshotId: string) => void; // 名前変更
  restoreFromSnapshot: (snapshotId: string) => void; // 追加

  resetSimulation: () => void;
}

const MAX_LOG_ENTRIES = 20;

// --- 初期データ生成ヘルパー ---
const createInitialState = (): Pick<CowSimulatorState, 'disk' | 'files' | 'eventLog'> => {
    let disk = initializeVirtualDisk();
    let files: FileEntry[] = [];
    const eventLog: string[] = ['Simulation initialized.'];

    // サンプルファイル1作成
    const file1Result = createFileOnDisk(disk, files, 'a', '# Hello CoW Simulator!\n');
    if (file1Result) {
        disk = file1Result.newDisk;
        files = file1Result.newFiles;
        eventLog.unshift(`[Initial] File "${file1Result.newFile.name}" created.`);
    }

    // サンプルファイル2作成
    const file2Result = createFileOnDisk(disk, files, 'b', 'Block1 Data\nBlock2 Data\nBlock3 Data\n...'); // 少し長めのデータ
    if (file2Result) {
        disk = file2Result.newDisk;
        files = file2Result.newFiles;
        eventLog.unshift(`[Initial] File "${file2Result.newFile.name}" created.`);
    }

    // サンプルファイル3 (空ファイル)
    const file3Result = createFileOnDisk(disk, files, 'c', '');
    if (file3Result) {
        disk = file3Result.newDisk;
        files = file3Result.newFiles;
        eventLog.unshift(`[Initial] File "${file3Result.newFile.name}" created.`);
    }

    return { disk, files, eventLog: eventLog.slice(0, MAX_LOG_ENTRIES) };
};

export const useCowStore = create<CowSimulatorState>((set, get) => ({
  ...createInitialState(), // 初期状態を生成関数から取得
  snapshots: [],
  selectedFileId: null,
  selectedSnapshotId: null,
  fileNameInput: '',
  fileContentInput: 'Hello World!\n', // デフォルトの入力内容はそのまま
  // isLoadingSnapshots は削除済み

  setFileNameInput: (name) => set({ fileNameInput: name }),
  setFileContentInput: (content) => set({ fileContentInput: content }),
  addEventLog: (log) => set((state) => ({
    eventLog: [`[${new Date().toLocaleTimeString()}] ${log}`, ...state.eventLog].slice(0, MAX_LOG_ENTRIES)
  })),

  createFile: () => {
    const { disk, files, fileNameInput, fileContentInput, addEventLog } = get();
    if (!fileNameInput.trim()) {
      alert('ファイル名を入力してください。');
      addEventLog('Error: File creation failed - empty name.');
      return;
    }
    if (!fileContentInput) { // 内容が空でもファイルは作れるようにする（0バイトファイル）
        // alert('ファイル内容を入力してください。');
        // addEventLog('Error: File creation failed - empty content.');
        // return;
    }

    const result = createFileOnDisk(disk, files, fileNameInput, fileContentInput);
    if (result) {
      set({
        disk: result.newDisk,
        files: result.newFiles,
        fileNameInput: '', // 入力フィールドをクリア
        // fileContentInput: 'Hello World!\n', // 内容はクリアしないでおくか、空にするか
        selectedFileId: result.newFile.id, // 作成したファイルを選択状態にする
      });
      addEventLog(`File "${result.newFile.name}" created. Blocks: ${result.newFile.blockIds.join(', ')}`);
      get().selectFile(result.newFile.id); // 作成後、内容をtextareaに反映
    } else {
      addEventLog(`Error: File creation failed for "${fileNameInput}". (Possibly duplicate name or no space)`);
      // alert('ファイル作成に失敗しました。同名ファイルが存在するか、ディスクスペースが不足している可能性があります。');
    }
  },

  selectFile: (fileId) => {
    const { files, addEventLog, setFileContentInput, disk } = get();
    const file = files.find(f => f.id === fileId);
    if (file) {
        let fullContent = '';
        for (const blockId of file.blockIds) {
            const block = disk.blocks.find(b => b.id === blockId);
            if (block && block.data) {
                fullContent += block.data;
            }
        }
        setFileContentInput(fullContent);
        addEventLog(`File "${file.name}" selected.`);
    } else {
        setFileContentInput('Hello World!\n'); // 選択解除時はデフォルトに戻す
    }
    set({ selectedFileId: fileId });
  },

  editFile: () => {
    const { disk, files, selectedFileId, fileContentInput, addEventLog } = get();
    if (!selectedFileId) {
      addEventLog('Error: No file selected for editing.');
      return;
    }
    if (!fileContentInput) { // 空内容での上書きを許可
        // addEventLog('Error: File content cannot be empty for editing.');
        // return;
    }
    const result = editFileOnDisk(disk, files, selectedFileId, fileContentInput);
    if (result) {
      set({
        disk: result.newDisk,
        files: result.newFiles,
      });
      addEventLog(`File "${result.updatedFile.name}" edited. New blocks: ${result.updatedFile.blockIds.join(', ')}`);
    } else {
      const fileName = files.find(f=>f.id === selectedFileId)?.name || selectedFileId;
      addEventLog(`Error: File edit failed for "${fileName}". (Possibly no space for CoW)`);
    }
  },

  deleteFile: (fileIdToDelete) => {
    const { disk, files, selectedFileId, addEventLog } = get();
    const file = files.find(f => f.id === fileIdToDelete);
    if (!file) {
        addEventLog(`Error: File with ID "${fileIdToDelete}" not found for deletion.`);
        return;
    }

    const result = deleteFileFromDisk(disk, files, fileIdToDelete);
    if (result) {
      set({
        disk: result.newDisk,
        files: result.newFiles,
        selectedFileId: selectedFileId === fileIdToDelete ? null : selectedFileId, // 削除したファイルが選択中なら選択解除
        fileContentInput: selectedFileId === fileIdToDelete ? 'Hello World!\n' : get().fileContentInput, // 内容もリセット
      });
      addEventLog(`File "${file.name}" deleted.`);
    } else {
      addEventLog(`Error: File deletion failed for "${file.name}".`);
    }
  },

  takeSnapshot: (name?: string) => { // 名前変更 takeLocalSnapshot -> takeSnapshot
    const { disk, files, addEventLog } = get();
    const result = createSnapshotOnDisk(disk, files, name);
    set(state => ({
      snapshots: [...state.snapshots, result.newSnapshot].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      disk: result.updatedDisk,
      selectedSnapshotId: result.newSnapshot.id,
    }));
    addEventLog(`Snapshot "${result.newSnapshot.name}" created.`);
  },

  selectSnapshot: (snapshotId) => { // 引数型変更 number を削除
    set({ selectedSnapshotId: snapshotId });
    if (snapshotId) {
        const snapshot = get().snapshots.find(s => s.id === snapshotId);
        get().addEventLog(`Snapshot "${snapshot?.name || snapshotId}" selected.`);
        if(snapshot) get().viewSnapshotState(snapshot.id);
    }
  },

  viewSnapshotState: (snapshotId) => { // 引数型変更 number を削除
    const { snapshots, disk, addEventLog } = get();
    const snapshot = snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      addEventLog(`Error: Snapshot with ID "${snapshotId}" not found for viewing.`);
      return;
    }
    set({
        files: JSON.parse(JSON.stringify(snapshot.fileEntries)),
        selectedFileId: null,
    });
    addEventLog(`Viewing state of snapshot "${snapshot.name}". Files updated.`);
    // TODO: VirtualDiskView でブロックハイライト
  },

  deleteSnapshot: (snapshotId) => { // 名前変更 deleteLocalSnapshotAction -> deleteSnapshot
    const { disk, snapshots, addEventLog, selectedSnapshotId } = get();
    const snapshotToDelete = snapshots.find(s => s.id === snapshotId);
    if (!snapshotToDelete) {
        addEventLog(`Error: Snapshot "${snapshotId}" not found for deletion.`);
        return;
    }

    const result = deleteLocalSnapshot(disk, snapshots, snapshotId);
    if (result) {
      set({
        disk: result.updatedDisk,
        snapshots: result.updatedSnapshots.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        selectedSnapshotId: selectedSnapshotId === snapshotId ? null : selectedSnapshotId,
      });
      addEventLog(`Snapshot "${snapshotToDelete.name}" deleted.`);
    } else {
      addEventLog(`Error deleting snapshot "${snapshotToDelete.name}".`);
    }
  },

  resetSimulation: () => set({
    ...createInitialState(), // リセット時も初期状態生成関数を呼ぶ
    snapshots: [],
    selectedFileId: null,
    selectedSnapshotId: null,
    fileNameInput: '',
    fileContentInput: 'Hello World!\n',
  }),

  restoreFromSnapshot: (snapshotId) => {
    const { snapshots, disk: currentDisk, files: currentFiles, addEventLog, snapshots: allSnapshots } = get();
    const snapshotToRestore = snapshots.find(s => s.id === snapshotId);

    if (!snapshotToRestore) {
      addEventLog(`Error: Snapshot with ID "${snapshotId}" not found for restoration.`);
      return;
    }

    // 1. ファイルリストをスナップショットのものに置き換え (ディープコピー)
    const restoredFiles: FileEntry[] = JSON.parse(JSON.stringify(snapshotToRestore.fileEntries));

    // 2. ディスク状態を更新
    let updatedBlocks: Block[] = JSON.parse(JSON.stringify(currentDisk.blocks)); // 現在のブロックデータを保持しつつコピー
    let freeBlocksCount = 0;

    // 2a. 全ブロックの参照カウントと保護状態を一時的にリセット（または再計算の基点とする）
    updatedBlocks = updatedBlocks.map(block => ({ ...block, refCount: 0, isSnapshotProtected: false }));

    // 2b. 復元後のファイルリストに基づいて参照カウントを設定
    for (const file of restoredFiles) {
      for (const blockId of file.blockIds) {
        const blockIndex = updatedBlocks.findIndex(b => b.id === blockId);
        if (blockIndex !== -1) {
          updatedBlocks[blockIndex].refCount++;
        }
      }
    }

    // 2c. 全スナップショットリストに基づいて参照カウントと保護状態を再設定
    for (const snap of allSnapshots) {
      snap.referencedBlockIds.forEach(blockId => {
        const blockIndex = updatedBlocks.findIndex(b => b.id === blockId);
        if (blockIndex !== -1) {
          updatedBlocks[blockIndex].refCount++;
          updatedBlocks[blockIndex].isSnapshotProtected = true;
        }
      });
    }

    // 2d. 参照カウントの重複加算を補正 (ファイルとスナップショットの両方で参照される場合)
    // 各ブロックについて、ファイルによる参照とスナップショットによる参照のユニークなセットを作る
    updatedBlocks = updatedBlocks.map(block => {
        let actualRefCount = 0;
        let isProtectedByAnySnapshot = false;

        // ファイルからの参照をカウント
        const fileReferencingThisBlock = restoredFiles.some(f => f.blockIds.includes(block.id));
        if (fileReferencingThisBlock) {
            actualRefCount++;
        }

        // スナップショットからの参照をカウント (ただし、ファイル参照とは独立してカウントするため、単純加算ではない)
        let snapshotRefCountForThisBlock = 0;
        for (const snap of allSnapshots) {
            if (snap.referencedBlockIds.has(block.id)) {
                snapshotRefCountForThisBlock++;
                isProtectedByAnySnapshot = true;
            }
        }
        // ここでの refCount は、このブロックを直接使っているファイル数 + このブロックを保護しているスナップショット数、という解釈が近い
        // ただし、既存のCoWロジックとの整合性を考えると、refCountは「このブロックを指しているポインタの総数」
        // そのため、ファイルからの参照と、各スナップショットからの参照を単純に足し合わせるのが今のモデルには近い
        // 2b と 2c のrefCount++ で既に足し算は行われている。保護状態はisProtectedByAnySnapshotを使う。
        // 2b, 2c の refCount++ を一度だけ行うように修正するべき。
        return { ...block, isSnapshotProtected: isProtectedByAnySnapshot }; // refCount は 2b, 2c で計算済みのものを採用
    });

    // refCount 再計算ロジック修正 (2b, 2c を統合)
    const blockUsage = new Map<string, { fileRefs: number, snapRefs: number, isProtected: boolean }>();
    updatedBlocks.forEach(b => blockUsage.set(b.id, { fileRefs: 0, snapRefs: 0, isProtected: false }));

    for (const file of restoredFiles) {
        for (const blockId of file.blockIds) {
            const usage = blockUsage.get(blockId);
            if (usage) usage.fileRefs = 1; // ファイルが使っていれば1 (複数のファイルが同じブロックを使うケースは今のモデルでは稀)
        }
    }
    for (const snap of allSnapshots) {
        snap.referencedBlockIds.forEach(blockId => {
            const usage = blockUsage.get(blockId);
            if (usage) {
                usage.snapRefs++;
                usage.isProtected = true;
            }
        });
    }

    updatedBlocks = updatedBlocks.map(b => {
        const usage = blockUsage.get(b.id);
        // オリジナルの refCount の定義（このブロックを参照しているファイル/スナップショットの数）に合わせる
        // ただし、1つのファイルが参照し、かつ、1つのスナップショットが参照する場合、refCountは2になるべき。
        // 現行の freeBlock ロジックは refCount が0になったら解放なので、単純なポインタ数で良い。
        let newRefCount = 0;
        if (usage) {
            newRefCount = (usage.fileRefs > 0 ? 1 : 0) + usage.snapRefs;
            // いや、もっとシンプルに。ファイルが使っている + 各スナップショットが使っている。ただし重複カウントしない。
            // AブロックをF1が使い、S1が保護 -> refCount = 2 (F1から1, S1から1)
            // AブロックをF1が使い、S1,S2が保護 -> refCount = 3 (F1から1, S1から1, S2から1)
            // AブロックをF1,F2が使い(現状ない)、S1が保護 -> refCount = 3 (F1から1, F2から1, S1から1)
            // => 結局、2bと2cのようなループで単純加算でほぼ問題ない。ただし、同じスナップショットから複数回カウントしないように注意する。
            //    しかし referencedBlockIds は Set なので問題ない。
            //    問題は、2bでファイルからの参照を加算した後、2cでスナップショットからの参照を加算すると、
            //    「ファイルF1がブロックAを参照し、スナップショットS1もブロックAを参照する」場合、
            //    ブロックAのrefCountは F1による+1 と S1による+1 で計2 となる。これは正しい。
        }
        return { ...b, refCount: usage ? ((usage.fileRefs > 0 ? 1:0) + usage.snapRefs) : 0, isSnapshotProtected: usage ? usage.isProtected : false };
    });
     // ↑このrefCountの計算は複雑すぎる。2b, 2cの方法に戻し、重複を避けるようにする。
     // 2b, 2cをやり直す
    updatedBlocks = updatedBlocks.map(block => ({ ...block, refCount: 0, isSnapshotProtected: false })); // 再度リセット

    for (const file of restoredFiles) {
      for (const blockId of file.blockIds) {
        const blockIndex = updatedBlocks.findIndex(b => b.id === blockId);
        if (blockIndex !== -1) {
          updatedBlocks[blockIndex].refCount++; // ファイルからの参照
        }
      }
    }
    for (const snap of allSnapshots) {
      snap.referencedBlockIds.forEach(blockId => {
        const blockIndex = updatedBlocks.findIndex(b => b.id === blockId);
        if (blockIndex !== -1) {
          // スナップショットが参照するブロックのrefCountを増やすのはcreateSnapshotOnDisk側で行われるべき
          // ここではisSnapshotProtectedを設定するだけの方がシンプルかもしれない
          // だが、復元なので、スナップショット作成時の状態（refCountも保護も）を再現するのが目的
          // しかし、他のスナップショットも生きているので、それらの影響も考慮したrefCountと保護状態が必要
          updatedBlocks[blockIndex].refCount++; // スナップショットからの参照として加算 (重複可能性あり)
          updatedBlocks[blockIndex].isSnapshotProtected = true;
        }
      });
    }
    // 重複参照カウントの解決: 1つのブロックは1つのファイルから参照されるという現在の前提と、
    // 1つのブロックは複数のスナップショットから参照されうるという前提のもと、
    // refCount = (ファイルからの参照があれば1、なければ0) + (そのブロックを参照しているユニークなスナップショットの数)
    updatedBlocks = updatedBlocks.map(block => {
        let newRefCount = 0;
        if(restoredFiles.some(f => f.blockIds.includes(block.id))) {
            newRefCount++;
        }
        let protectingSnapshotsCount = 0;
        for(const s of allSnapshots) {
            if (s.referencedBlockIds.has(block.id)) {
                protectingSnapshotsCount++;
            }
        }
        newRefCount += protectingSnapshotsCount;
        const isProtected = protectingSnapshotsCount > 0;
        return { ...block, refCount: newRefCount, isSnapshotProtected: isProtected };
    });


    // 2e. 空きブロック数を再計算
    freeBlocksCount = updatedBlocks.filter(b => b.refCount === 0 && b.data === null).length;
    // いや、refCount === 0 ならデータがあってもなくても空きとみなせる（解放されるべきなので）
    freeBlocksCount = updatedBlocks.filter(b => b.refCount === 0).length;


    set({
      files: restoredFiles,
      disk: {
        ...currentDisk, // blockSizeBytes や totalBlocks は維持
        blocks: updatedBlocks,
        freeBlocks: freeBlocksCount,
      },
      selectedFileId: null,
      selectedSnapshotId: snapshotId, // 復元したスナップショットを選択状態にする
      fileContentInput: '', // ファイル内容はクリア
    });
    addEventLog(`Restored state from snapshot "${snapshotToRestore.name}".`);
  },
}));
