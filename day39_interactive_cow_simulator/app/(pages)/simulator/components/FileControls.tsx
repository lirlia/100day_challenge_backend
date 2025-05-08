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
    // createFile, // ストアで後ほど実装
    // editFile,   // ストアで後ほど実装
    // deleteFile, // ストアで後ほど実装
    // selectFile, // ストアで後ほど実装
  } = useCowStore();

  // ダミーのアクション（ストアが実装されるまで）
  const createFile = () => console.log('Create file action triggered', { fileName: fileNameInput, content: fileContentInput });
  const editFile = (id: string) => console.log('Edit file action triggered for', id);
  const deleteFile = (id: string) => console.log('Delete file action triggered for', id);
  const selectFile = (id: string | null) => console.log('Select file action triggered for', id);

  const handleCreateFile = () => {
    if (!fileNameInput.trim()) {
      alert('ファイル名を入力してください。');
      return;
    }
    // createFile(); // ストアのアクションを呼び出す
    console.log('Simulating file creation...');
    // setFileNameInput('');
    // setFileContentInput('Hello World!\n');
  };

  const handleEditFile = () => {
    if (!selectedFileId) return;
    // editFile(selectedFileId);
    console.log('Simulating file edit for:', selectedFileId);
  };

  const handleDeleteFile = () => {
    if (!selectedFileId) return;
    if (confirm('本当にこのファイルを削除しますか？（関連するスナップショットのデータも影響を受ける可能性があります）')) {
      // deleteFile(selectedFileId);
      console.log('Simulating file deletion for:', selectedFileId);
    }
  };

  return (
    <div className="space-y-4">
      {/* ファイル作成フォーム */}
      <div className="p-3 bg-gray-650 rounded-md shadow">
        <h3 className="text-lg font-medium mb-2 text-gray-200">新規ファイル作成</h3>
        <input
          type="text"
          placeholder="ファイル名 (例: report.txt)"
          value={fileNameInput}
          onChange={(e) => setFileNameInput(e.target.value)}
          className="w-full p-2 mb-2 rounded bg-gray-700 border border-gray-500 focus:border-sky-500 focus:ring-sky-500 text-gray-100"
        />
        <textarea
          placeholder="ファイル内容"
          value={fileContentInput}
          onChange={(e) => setFileContentInput(e.target.value)}
          rows={3}
          className="w-full p-2 mb-2 rounded bg-gray-700 border border-gray-500 focus:border-sky-500 focus:ring-sky-500 text-gray-100"
        />
        <button
          onClick={handleCreateFile}
          className="w-full px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md transition-colors"
        >
          作成
        </button>
      </div>

      {/* ファイルリスト */}
      <div className="p-3 bg-gray-650 rounded-md shadow">
        <h3 className="text-lg font-medium mb-2 text-gray-200">ファイル一覧</h3>
        {files.length === 0 ? (
          <p className="text-gray-400 italic">ファイルがありません。</p>
        ) : (
          <ul className="space-y-1 max-h-60 overflow-y-auto">
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

      {/* 選択中ファイルの操作 */}
      {selectedFileId && (
        <div className="p-3 bg-gray-650 rounded-md shadow space-y-2">
          <h3 className="text-lg font-medium mb-1 text-gray-200">
            選択中: {files.find(f => f.id === selectedFileId)?.name}
          </h3>
          <p className="text-sm text-gray-400 mb-2">上記テキストエリアの内容で上書き編集します。</p>
          <button
            onClick={handleEditFile}
            className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md transition-colors"
          >
            編集 (上書き)
          </button>
          <button
            onClick={handleDeleteFile}
            className="w-full px-4 py-2 bg-red-700 hover:bg-red-800 text-white font-semibold rounded-md transition-colors"
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}
