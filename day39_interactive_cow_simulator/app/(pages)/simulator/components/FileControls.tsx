'use client';

import { useCowStore } from '../store';
import { FileEntry } from '@/app/_lib/cow-simulator';

export default function FileControls() {
  const {
    files,
    selectedFileId,
    fileNameInput,
    fileContentInput,
    setFileNameInput,
    setFileContentInput,
    createFile,
    editFile,
    deleteFile,
    selectFile,
  } = useCowStore();

  const handleCreateFile = () => {
    if (!fileNameInput.trim()) {
      alert('ファイル名を入力してください。');
      return;
    }
    createFile();
  };

  const handleEditFile = () => {
    if (!selectedFileId) return; // ボタンが無効化されているはずだが念のため
    editFile();
  };

  const handleDeleteFile = () => {
    if (!selectedFileId) return; // ボタンが無効化されているはずだが念のため
    const selectedFileName = files.find(f => f.id === selectedFileId)?.name || 'このファイル';
    if (confirm(`${selectedFileName} を本当に削除しますか？関連するスナップショットのデータも影響を受ける可能性があります。`)) {
      deleteFile(selectedFileId);
    }
  };

  return (
    <div className="space-y-4">
      {/* ファイル作成/編集フォーム */}
      <div className="p-3 bg-gray-600 rounded-md shadow">
        <h3 className="text-lg font-medium mb-2 text-gray-200">ファイル作成 / 編集</h3>
        <input
          type="text"
          placeholder="ファイル名 (例: report.txt)"
          value={fileNameInput}
          onChange={(e) => setFileNameInput(e.target.value)}
          className="w-full p-2 mb-2 rounded bg-gray-700 border border-gray-500 focus:border-sky-500 focus:ring-sky-500 text-gray-100"
        />
        <textarea
          placeholder={selectedFileId ? "選択中ファイルの内容 (編集用)" : "ファイル内容 (新規作成用)"}
          value={fileContentInput}
          onChange={(e) => setFileContentInput(e.target.value)}
          rows={3}
          className="w-full p-2 mb-2 rounded bg-gray-700 border border-gray-500 focus:border-sky-500 focus:ring-sky-500 text-gray-100"
        />
        {/* ボタンエリア */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleCreateFile}
            className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md transition-colors"
          >
            作成
          </button>
          <button
            onClick={handleEditFile}
            disabled={!selectedFileId}
            className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            編集
          </button>
          <button
            onClick={handleDeleteFile}
            disabled={!selectedFileId}
            className="flex-1 px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            削除
          </button>
        </div>
      </div>

      {/* ファイルリスト */}
      <div className="p-3 bg-gray-600 rounded-md shadow">
        <h3 className="text-lg font-medium mb-2 text-gray-200">ファイル一覧</h3>
        {files.length === 0 ? (
          <p className="text-gray-400 italic">ファイルがありません。</p>
        ) : (
          <ul className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-750">
            {files.map((file: FileEntry) => (
              <li key={file.id}>
                <button
                  onClick={() => selectFile(file.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm
                              ${selectedFileId === file.id
                      ? 'bg-sky-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-550 text-gray-200'}`}
                >
                  {file.name} <span className="text-xs text-gray-400">({file.size}B, {file.blockIds.length} blocks)</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 選択中ファイルの操作エリアは削除 (上のボタンエリアに統合) */}
    </div>
  );
}
