'use client';

import React, { useState, useRef, useCallback } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

export function FileUpload({ onFileSelect, disabled }: FileUploadProps) {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFileName(file ? file.name : null);
    onFileSelect(file);
    // Reset file input value to allow selecting the same file again
    if (event.target) {
      event.target.value = '';
    }
  }, [onFileSelect]);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    setSelectedFileName(null);
    onFileSelect(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Clear the input field
    }
  };

  return (
    <div className="border border-dashed border-gray-400 rounded-lg p-6 text-center">
      <input
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        ref={fileInputRef}
        style={{ display: 'none' }} // Hide the default input
        disabled={disabled}
      />
      {!selectedFileName ? (
        <button
          type="button"
          onClick={handleButtonClick}
          disabled={disabled}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          CSVファイルを選択
        </button>
      ) : (
        <div className="flex items-center justify-center space-x-2">
          <span className="text-gray-700 truncate max-w-xs">{selectedFileName}</span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            クリア
          </button>
        </div>
      )}
      <p className="text-sm text-gray-500 mt-2">アップロードする CSV ファイルを選択してください。</p>
    </div>
  );
}
