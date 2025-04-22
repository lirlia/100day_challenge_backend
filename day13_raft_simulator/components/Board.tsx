'use client';

import React from 'react';
import { useDrop, DropTargetMonitor } from 'react-dnd'; // DropTargetMonitor を追加
// import { useRaft } from '@/context/RaftContext'; // パスは後で修正
// import MessageArrow from './MessageArrow'; // パスは後で修正
import { useRaft } from '../context/RaftContext'; // 相対パス
import { Node, ItemTypes } from './Node'; // NodeコンポーネントとItemTypesをインポート
import MessageArrow from './MessageArrow'; // 相対パス

// useDrop の item の型 (Node.tsxからimportしても良いが、ここで再定義も可)
interface DragItem {
    id: string;
    type: string;
}


const Board: React.FC = () => {
  const { nodeInfos, messages, updateNodePosition } = useRaft();

  const [, drop] = useDrop(() => ({
    accept: ItemTypes.NODE, // Nodeコンポーネントからのドラッグを受け入れる
    drop: (item: DragItem, monitor: DropTargetMonitor<DragItem, unknown>) => { // itemとmonitorの型を明示
      const delta = monitor.getDifferenceFromInitialOffset(); // ドラッグ移動量を取得
      const node = nodeInfos.find(n => n.id === item.id);
      if (node && delta) {
        const left = Math.round(node.position.x + delta.x);
        const top = Math.round(node.position.y + delta.y);
        // 盤面内にとどめるような簡単な制約を追加しても良い
        // const boardWidth = ???; // ボードの幅を取得する方法が必要
        // const boardHeight = ???; // ボードの高さを取得する方法が必要
        // const constrainedLeft = Math.max(0, Math.min(left, boardWidth - 80)); // 80はNodeの幅
        // const constrainedTop = Math.max(0, Math.min(top, boardHeight - 80)); // 80はNodeの高さ
        updateNodePosition(item.id, { x: left, y: top });
      }
    },
  }), [nodeInfos, updateNodePosition]); // 依存配列に nodeInfos を追加

  return (
    <div ref={drop} className="relative w-full h-full border border-gray-400 bg-gray-50 dark:bg-gray-800"> {/* 背景色追加 */}
      {/* ノードを描画 */}
      {nodeInfos.map((node) => (
        <Node key={node.id} nodeInfo={node} />
      ))}

      {/* メッセージの矢印を描画 */}
      {messages.map((msg, index) => {
        const senderNode = nodeInfos.find(n => n.id === msg.senderId);
        const receiverNode = nodeInfos.find(n => n.id === msg.receiverId);
        if (senderNode && receiverNode) {
          return (
            <MessageArrow
              key={`${msg.senderId}-${msg.receiverId}-${index}`} // よりユニークなキー
              from={senderNode.position}
              to={receiverNode.position}
              type={msg.type}
            />
          );
        }
        return null;
      })}
    </div>
  );
};

export default Board;
