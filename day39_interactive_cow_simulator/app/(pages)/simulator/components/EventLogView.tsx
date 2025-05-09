'use client';

import { useCowStore } from '../store';

export default function EventLogView() {
  const eventLog = useCowStore((state) => state.eventLog);

  if (eventLog.length === 0) {
    return (
      <div className="p-3 bg-gray-650 rounded-md shadow text-center">
        <p className="text-gray-400 italic">イベントログはありません。</p>
      </div>
    );
  }

  return (
    <div className="p-1 sm:p-2 bg-gray-750 rounded-md shadow h-full flex flex-col">
      <ul className="space-y-1 flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-500 scrollbar-track-gray-750 pr-1">
        {eventLog.map((log, index) => (
          <li
            key={index} // ログは不変なのでインデックスキーでも許容範囲
            className="text-xs text-gray-300 bg-gray-600 p-1.5 rounded-sm font-mono break-words"
          >
            {log}
          </li>
        ))}
      </ul>
    </div>
  );
}