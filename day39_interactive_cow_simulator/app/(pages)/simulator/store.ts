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
} from '../../_lib/cow-simulator';

// APIから取得するスナップショットの型 (DBスキーマに合わせる)
interface DBSnapshot {
  id: number; // DBのidはnumber
  name: string;
  created_at: string; // DBからは文字列で来る
  disk_state_json: string;
}

interface CowSimulatorState {
  disk: VirtualDisk;
  files: FileEntry[];
  snapshots: Snapshot[]; // ローカル/DBのスナップショットを区別なくここに保持 (idの型に注意)
  selectedFileId: string | null;
  selectedSnapshotId: string | number | null; // DBのIDはnumberなのでunion型に
  fileNameInput: string;
  fileContentInput: string;
  eventLog: string[];
  isLoadingSnapshots: boolean;

  setFileNameInput: (name: string) => void;
  setFileContentInput: (content: string) => void;
  addEventLog: (log: string) => void;

  createFile: () => void;
  selectFile: (fileId: string | null) => void;
  editFile: () => void;
  deleteFile: (fileId: string) => void;

  takeLocalSnapshot: (name?: string) => void; // ローカルのシミュレーション上にスナップショットを作成
  saveSnapshotToDB: (snapshot: Snapshot) => Promise<boolean>; // 指定スナップショットをDBに保存 (diskStateJson を適切に作る)
  loadSnapshotsFromDB: () => Promise<void>;
  selectSnapshot: (snapshotId: string | number | null) => void;
  viewSnapshotState: (snapshotId: string | number) => void; // 特定のスナップショット時点のファイル/ディスク状態を再現表示（読み取り専用）
  deleteSnapshotFromDB: (snapshotId: string | number) => Promise<void>;

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
  isLoadingSnapshots: false,

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

  takeLocalSnapshot: (name?: string) => {
    const { disk, files, addEventLog } = get();
    const result = createSnapshotOnDisk(disk, files, name);

    // 重要: createSnapshotOnDisk は disk のブロック参照カウントを更新するので、
    // ストアの disk も更新する必要がある。
    set(state => ({
      snapshots: [...state.snapshots, result.newSnapshot].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      disk: result.updatedDisk, // 更新されたディスク状態をセット
      selectedSnapshotId: result.newSnapshot.id, // 作成したものを選択
    }));
    addEventLog(`Local snapshot "${result.newSnapshot.name}" created.`);
  },

  saveSnapshotToDB: async (snapshotToSave: Snapshot) => {
    const { addEventLog } = get();
    try {
      // SnapshotオブジェクトからDB保存用のペイロードを作成
      // diskStateJson には、そのスナップショット時点の files と disk.blocks の一部（メタデータのみでも可）をJSON化して保存
      // ここでは簡単のため、スナップショットが保持している fileEntries を diskStateとして保存
      const payload = {
        name: snapshotToSave.name,
        diskStateJson: JSON.stringify({
            files: snapshotToSave.fileEntries,
            // referencedBlockIds: Array.from(snapshotToSave.referencedBlockIds) // 必要ならブロックIDも
        }),
      };
      const response = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save snapshot to DB');
      }
      const savedDBEntry = await response.json();
      addEventLog(`Snapshot "${snapshotToSave.name}" saved to DB (ID: ${savedDBEntry.id}).`);
      // DB保存成功後、ローカルのsnapshotsリストをDBからのリストで再同期する
      get().loadSnapshotsFromDB();
      return true;
    } catch (error) {
      console.error('Error saving snapshot to DB:', error);
      addEventLog(`Error saving snapshot "${snapshotToSave.name}": ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  },

  loadSnapshotsFromDB: async () => {
    const { addEventLog } = get();
    set({ isLoadingSnapshots: true });
    try {
      const response = await fetch('/api/snapshots');
      if (!response.ok) throw new Error('Failed to fetch snapshots from DB');
      const dbSnapshots: DBSnapshot[] = await response.json();

      // DBSnapshot をローカルの Snapshot 型に変換
      // disk_state_json から fileEntries と referencedBlockIds を復元
      const localSnapshots: Snapshot[] = dbSnapshots.map(dbSnap => {
        let fileEntries: FileEntry[] = [];
        let referencedBlockIds = new Set<string>();
        try {
            const parsedState = JSON.parse(dbSnap.disk_state_json);
            fileEntries = parsedState.files || [];
            // referencedBlockIds は保存していなければ空のまま
            if (parsedState.referencedBlockIds && Array.isArray(parsedState.referencedBlockIds)) {
                referencedBlockIds = new Set(parsedState.referencedBlockIds);
            }
        } catch (e) {
            console.error(`Failed to parse disk_state_json for snapshot ${dbSnap.id}`, e);
        }
        return {
            id: String(dbSnap.id), // IDを文字列に統一 (ローカルとDBで型が違うため)
            name: dbSnap.name,
            createdAt: new Date(dbSnap.created_at),
            fileEntries,
            referencedBlockIds,
        };
      });

      set({ snapshots: localSnapshots.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), isLoadingSnapshots: false });
      addEventLog('Snapshots loaded from DB.');
    } catch (error) {
      console.error('Error loading snapshots from DB:', error);
      addEventLog(`Error loading snapshots: ${error instanceof Error ? error.message : String(error)}`);
      set({ isLoadingSnapshots: false });
    }
  },

  selectSnapshot: (snapshotId) => {
    set({ selectedSnapshotId: snapshotId });
    if (snapshotId) {
        const snapshot = get().snapshots.find(s => s.id === snapshotId);
        get().addEventLog(`Snapshot "${snapshot?.name || snapshotId}" selected.`);
        if(snapshot) get().viewSnapshotState(snapshot.id); // 選択したらプレビューも更新
    }
  },

  viewSnapshotState: (snapshotId_param) => {
    const { snapshots, disk, addEventLog } = get();
    const snapshotId = String(snapshotId_param); // IDを文字列に統一
    const snapshot = snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      addEventLog(`Error: Snapshot with ID "${snapshotId}" not found for viewing.`);
      return;
    }
    // スナップショット時点のファイルリストを現在のファイルリストとして表示 (読み取り専用のような扱い)
    // ディスクのブロック状態は、このスナップショットが参照しているブロックをハイライトする等で表現
    // ここでは、filesをスナップショットのものに置き換え、diskはそのまま（ブロックの色分けで表現）
    // 本来はディスク状態も完全に再現すべきだが、シミュレーションでは表示上の工夫で代替
    set({
        files: JSON.parse(JSON.stringify(snapshot.fileEntries)), // ディープコピーして表示用ファイルリストを更新
        // disk: snapshot.diskState, // もしディスク状態全体を保存していればそれを復元するが、今回はしない
        selectedFileId: null, // ファイル選択はリセット
    });
    addEventLog(`Viewing state of snapshot "${snapshot.name}". Files updated to snapshot version.`);
    // TODO: VirtualDiskView で、このスナップショットが参照するブロックを特別にハイライトするロジックが必要
  },

  deleteSnapshotFromDB: async (snapshotId_param) => {
    const { addEventLog, snapshots } = get();
    const snapshotId = String(snapshotId_param);
    const snapshotToDelete = snapshots.find(s => s.id === snapshotId);
    if (!snapshotToDelete) {
        addEventLog(`Error: Snapshot "${snapshotId}" not found in local list for DB deletion.`);
        return;
    }

    try {
      const response = await fetch(`/api/snapshots/${snapshotId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete snapshot from DB');
      }
      addEventLog(`Snapshot "${snapshotToDelete.name}" (ID: ${snapshotId}) deleted from DB.`);
      // DBから削除成功後、ローカルのsnapshotsリストも更新（DBから再読込）
      get().loadSnapshotsFromDB();
      set({ selectedSnapshotId: null }); // 選択解除
    } catch (error) {
      console.error('Error deleting snapshot from DB:', error);
      addEventLog(`Error deleting snapshot "${snapshotToDelete.name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  resetSimulation: () => set({
    disk: initializeVirtualDisk(),
    files: [],
    snapshots: [], // ローカルスナップショットもクリア
    selectedFileId: null,
    selectedSnapshotId: null,
    fileNameInput: '',
    fileContentInput: 'Hello World!\n',
    eventLog: ['Simulation reset.'],
    isLoadingSnapshots: false,
  }),
}));
