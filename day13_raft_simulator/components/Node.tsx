'use client';

import React, { useState, useRef } from 'react';
import { useDrag, DragSourceMonitor } from 'react-dnd';
// import { RaftNodeInfo } from '@/lib/raft/types'; // パスは後で修正
// import { useRaft } from '@/context/RaftContext'; // パスは後で修正
import { RaftNodeInfo } from '../lib/raft/types'; // 相対パス
import { useRaft } from '../context/RaftContext'; // 相対パス

interface NodeProps {
  nodeInfo: RaftNodeInfo;
}

// ドラッグ可能なアイテムの型
export const ItemTypes = {
  NODE: 'node',
};

// useDrag の item の型
interface DragItem {
  id: string;
  type: string;
}

// ノードの状態に応じた色
const stateColors: { [key in RaftNodeInfo['state']]: string } = {
  Follower: 'bg-blue-500',
  Candidate: 'bg-yellow-500',
  Leader: 'bg-red-600',
  Stopped: 'bg-gray-400',
};

export const Node: React.FC<NodeProps> = ({ nodeInfo }) => {
  const { stopNode, resumeNode, removeNode, sendCommandToLeader } = useRaft();
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const divRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.NODE,
    item: { id: nodeInfo.id, type: ItemTypes.NODE } as DragItem,
    collect: (monitor: DragSourceMonitor<DragItem, unknown>) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  drag(divRef);

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setShowContextMenu(true);
    setContextMenuPos({ x: event.pageX, y: event.pageY });
  };

  const closeContextMenu = () => {
    setShowContextMenu(false);
  };

  const handleStopResume = () => {
    if (nodeInfo.state === 'Stopped') {
      resumeNode(nodeInfo.id);
    } else {
      stopNode(nodeInfo.id);
    }
    closeContextMenu();
  };

  const handleRemove = () => {
    removeNode(nodeInfo.id);
    closeContextMenu();
  };

  const handleSendCommand = () => {
    sendCommandToLeader(); // Contextに関数を呼び出す
    closeContextMenu();
  }

  // ログの表示を簡略化 (最新5件程度)
  const displayedLog = nodeInfo.log.slice(-5);

  return (
    <div
      ref={divRef}
      className={`absolute p-3 rounded-full shadow-lg cursor-grab ${stateColors[nodeInfo.state]
        } text-white text-xs flex flex-col items-center justify-center border-2 border-black ${isDragging ? 'opacity-50' : 'opacity-100'
        }`}
      style={{
        left: `${nodeInfo.position.x}px`,
        top: `${nodeInfo.position.y}px`,
        width: '80px', // 固定サイズ
        height: '80px', // 固定サイズ
      }}
      onContextMenu={handleContextMenu}
      onClick={() => showContextMenu && closeContextMenu()} // 左クリックで閉じる
    >
      <div className="font-bold text-sm mb-1">{nodeInfo.id}</div>
      <div>T:{nodeInfo.currentTerm}</div>
      <div className="text-center text-[10px] overflow-hidden whitespace-nowrap overflow-ellipsis w-full" title={nodeInfo.state}>
        {nodeInfo.state}
      </div>
      <div className="text-[8px] mt-1">C:{nodeInfo.commitIndex}</div>

      {/* コンテキストメニュー */}
      {showContextMenu && (
        <div
          className="absolute z-50 bg-white text-black rounded shadow-lg border border-gray-300 text-xs py-1"
          // style={{ left: `${contextMenuPos.x - nodeInfo.position.x}px`, top: `${contextMenuPos.y - nodeInfo.position.y}px` }}
          // ノードの右下に固定で表示するように変更 (デバッグ用)
          style={{ left: '100%', top: '100%', marginLeft: '5px', marginTop: '5px' }}
          onClick={(e) => e.stopPropagation()} // メニュー内クリックで閉じないように
        >
          <button onClick={handleStopResume} className="block w-full text-left px-3 py-1 hover:bg-gray-100">
            {nodeInfo.state === 'Stopped' ? 'Resume' : 'Stop'}
          </button>
          {nodeInfo.state === 'Leader' && (
            <button onClick={handleSendCommand} className="block w-full text-left px-3 py-1 hover:bg-gray-100">
              Send Command
            </button>
          )}
          <button onClick={handleRemove} className="block w-full text-left px-3 py-1 hover:bg-gray-100 text-red-600">
            Remove
          </button>
        </div>
      )}

      {/* ログ表示 (オプション: ツールチップなどで詳細表示) */}
      {/* <div className="absolute bottom-[-20px] left-0 w-full bg-gray-100 text-black text-[8px] p-1 rounded shadow">
          Log: {displayedLog.map(l => `T${l.term}`).join(',')}
      </div> */}
    </div>
  );
};
