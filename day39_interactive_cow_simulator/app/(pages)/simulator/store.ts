import { create } from 'zustand';
import {
  VirtualDisk,
  FileEntry,
  Snapshot,
  initializeVirtualDisk,
  // 以降で定義する関数をインポート
  // createFileOnDisk,
  // editFileOnDisk,
  // deleteFileFromDisk,
  // createSnapshotOfState,
} from '../../_lib/cow-simulator';

interface CowSimulatorState {
  disk: VirtualDisk;
  files: FileEntry[];
  snapshots: Snapshot[];
  selectedFileId: string | null;
  selectedSnapshotId: string | null;
  // UI操作のための状態 (例: ファイル名入力、ファイル内容入力など)
  fileNameInput: string;
  fileContentInput: string;
  // アクション
  setFileNameInput: (name: string) => void;
  setFileContentInput: (content: string) => void;
  // --- ディスク・ファイル操作 ---
  // createFile: () => void;
  // editFile: (fileId: string) => void;
  // deleteFile: (fileId: string) => void;
  // selectFile: (fileId: string | null) => void;
  // --- スナップショット操作 ---
  // takeSnapshot: (name?: string) => void;
  // selectSnapshot: (snapshotId: string | null) => void;
  // restoreSnapshot: (snapshotId: string) => void; // 読み取り専用で表示するイメージ
  // deleteSnapshot: (snapshotId: string) => void;
  // --- 初期化 ---
  resetSimulation: () => void;
}

export const useCowStore = create<CowSimulatorState>((set, get) => ({
  disk: initializeVirtualDisk(),
  files: [],
  snapshots: [],
  selectedFileId: null,
  selectedSnapshotId: null,
  fileNameInput: '',
  fileContentInput: 'Hello World!\n',

  setFileNameInput: (name) => set({ fileNameInput: name }),
  setFileContentInput: (content) => set({ fileContentInput: content }),

  resetSimulation: () => set({
    disk: initializeVirtualDisk(),
    files: [],
    snapshots: [],
    selectedFileId: null,
    selectedSnapshotId: null,
    fileNameInput: '',
    fileContentInput: 'Hello World!\n',
  }),

  // TODO: ファイル操作、スナップショット操作のアクションを実装
  // 例:
  // createFile: () => {
  //   const { disk, files, fileNameInput, fileContentInput } = get();
  //   if (!fileNameInput.trim() || !fileContentInput.trim()) return;
  //   const result = createFileOnDisk(disk, files, fileNameInput, fileContentInput);
  //   if (result) {
  //     set({
  //       disk: result.newDisk,
  //       files: result.newFiles,
  //       fileNameInput: '',
  //       fileContentInput: 'Hello World!\n'
  //     });
  //   }
  // },
}));
