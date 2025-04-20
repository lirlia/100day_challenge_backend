'use client';

import { useState } from 'react';

interface CloneRepoProps {
  repoName: string;
  apiUrlBase: string;
}

export default function CloneRepo({ repoName, apiUrlBase }: CloneRepoProps) {
  const [copied, setCopied] = useState(false);

  const cloneCommand = `git clone ${apiUrlBase}/${repoName}/git ${repoName}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(cloneCommand)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // 2秒後に表示を戻す
      })
      .catch(err => {
        console.error('Failed to copy URL: ', err);
        // エラー表示などをここに追加可能
      });
  };

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-3 rounded">
      <input
        type="text"
        value={cloneCommand}
        readOnly
        className="flex-1 bg-transparent dark:text-gray-200 focus:outline-none"
      />
      <button
        onClick={handleCopy}
        className="ml-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors shrink-0"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}