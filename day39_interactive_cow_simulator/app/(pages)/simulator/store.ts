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

  resetSimulation: () => void;
}

const MAX_LOG_ENTRIES = 20;

export const useCowStore = create<CowSimulatorState>((set, get) => ({
  disk: initializeVirtualDisk(),
  files: [],
  snapshots: [],
  selectedFileId: null,
  selectedSnapshotId: null,
  fileNameInput: '',
  fileContentInput: 'Hello World!\n',
  eventLog: [],

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
    disk: initializeVirtualDisk(),
    files: [],
    snapshots: [],
    selectedFileId: null,
    selectedSnapshotId: null,
    fileNameInput: '',
    fileContentInput: 'Hello World!\n',
    eventLog: ['Simulation reset.'],
  }),
}));
