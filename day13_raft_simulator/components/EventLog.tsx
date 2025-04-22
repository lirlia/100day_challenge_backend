'use client';

import React from 'react';
import { useRaft } from '../context/RaftContext';
import { SimulationEvent } from '../lib/raft/types';

const EventLog: React.FC = () => {
  const { events } = useRaft();

  // details オブジェクトを安全に文字列化するヘルパー関数
  const formatDetails = (details: Record<string, any> | undefined | null): string => {
    if (!details) return '';
    try {
      // details オブジェクトの内容を表示
      // nodeIdは共通で表示されるようにする
      const nodeIdStr = details.nodeId ? `Node ${details.nodeId}: ` : '';
      const detailsStr = Object.entries(details)
        .filter(([key]) => key !== 'nodeId') // nodeIdは除外
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(', ');
      return `${nodeIdStr}${detailsStr}`;
    } catch (e) {
      return '[Details Error]'; // 文字列化失敗時のフォールバック
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <h2 className="text-lg font-semibold mb-3">Event Log</h2>
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-y-auto text-sm font-mono">
        {events && events.length > 0 ? (
          events.map((log: SimulationEvent, index: number) => (
            <p key={index} className="mb-1 break-words">
              [{log.type}] {formatDetails(log.details)}
            </p>
          ))
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No events yet.</p>
        )}
      </div>
    </div>
  );
};

export default EventLog;
