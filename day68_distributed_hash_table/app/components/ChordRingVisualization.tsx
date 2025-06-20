'use client';

import { useMemo } from 'react';

interface ChordNode {
  id: number;
  address: string;
  isAlive: boolean;
  dataCount: number;
  fingerTable: number[];
  successor: number | null;
  predecessor: number | null;
}

interface ChordRingVisualizationProps {
  nodes: ChordNode[];
  selectedNodeId?: number | null;
  onNodeSelect?: (nodeId: number) => void;
}

export default function ChordRingVisualization({
  nodes,
  selectedNodeId,
  onNodeSelect
}: ChordRingVisualizationProps) {
  const ringSize = 256; // 8bit空間
  const svgSize = 400;
  const centerX = svgSize / 2;
  const centerY = svgSize / 2;
  const ringRadius = 150;
  const nodeRadius = 12;

  // ノードの位置を計算
  const nodePositions = useMemo(() => {
    return nodes.map(node => {
      const angle = (node.id / ringSize) * 2 * Math.PI - Math.PI / 2; // 上から開始
      const x = centerX + ringRadius * Math.cos(angle);
      const y = centerY + ringRadius * Math.sin(angle);
      return {
        ...node,
        x,
        y,
        angle
      };
    });
  }, [nodes]);

  // フィンガーテーブルの線を描画
  const fingerLines = useMemo(() => {
    if (!selectedNodeId) return [];

    const selectedNode = nodePositions.find(n => n.id === selectedNodeId);
    if (!selectedNode) return [];

    return selectedNode.fingerTable.map((targetId, index) => {
      const targetNode = nodePositions.find(n => n.id === targetId);
      if (!targetNode || targetId === selectedNodeId) return null;

      return {
        index,
        x1: selectedNode.x,
        y1: selectedNode.y,
        x2: targetNode.x,
        y2: targetNode.y,
        targetId
      };
    }).filter((line): line is NonNullable<typeof line> => line !== null);
  }, [nodePositions, selectedNodeId]);

  // 後継・前任の線を描画
  const connectionLines = useMemo(() => {
    return nodePositions.flatMap(node => {
      const lines = [];

      // 後継への線
      if (node.successor !== null && node.successor !== node.id) {
        const successorNode = nodePositions.find(n => n.id === node.successor);
        if (successorNode) {
          lines.push({
            type: 'successor',
            x1: node.x,
            y1: node.y,
            x2: successorNode.x,
            y2: successorNode.y,
            fromId: node.id,
            toId: node.successor
          });
        }
      }

      return lines;
    });
  }, [nodePositions]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md">
      <h2 className="text-xl font-semibold mb-4">Chord リング可視化</h2>

      <div className="flex flex-col items-center">
        <svg width={svgSize} height={svgSize} className="border rounded">
          {/* 背景の円 */}
          <circle
            cx={centerX}
            cy={centerY}
            r={ringRadius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="2"
            strokeDasharray="5,5"
          />

          {/* 後継への線 */}
          {connectionLines.map((line, index) => (
            <line
              key={`connection-${index}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#10b981"
              strokeWidth="2"
              opacity="0.6"
              markerEnd="url(#arrowhead-green)"
            />
          ))}

          {/* フィンガーテーブルの線 */}
          {fingerLines.map((line, index) => (
            <line
              key={`finger-${index}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#8b5cf6"
              strokeWidth="1.5"
              opacity="0.7"
              strokeDasharray="3,3"
            />
          ))}

          {/* 矢印マーカー定義 */}
          <defs>
            <marker
              id="arrowhead-green"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#10b981"
              />
            </marker>
          </defs>

          {/* ノード */}
          {nodePositions.map(node => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={nodeRadius}
                fill={selectedNodeId === node.id ? '#3b82f6' : '#6b7280'}
                stroke={node.isAlive ? '#10b981' : '#ef4444'}
                strokeWidth="3"
                className="cursor-pointer hover:stroke-blue-500"
                onClick={() => onNodeSelect?.(node.id)}
              />

              {/* ノードID */}
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                className="text-xs font-bold fill-white pointer-events-none"
              >
                {node.id}
              </text>

              {/* データ数インジケーター */}
              {node.dataCount > 0 && (
                <circle
                  cx={node.x + nodeRadius - 3}
                  cy={node.y - nodeRadius + 3}
                  r="6"
                  fill="#f59e0b"
                  stroke="white"
                  strokeWidth="1"
                />
              )}

              {/* データ数テキスト */}
              {node.dataCount > 0 && (
                <text
                  x={node.x + nodeRadius - 3}
                  y={node.y - nodeRadius + 6}
                  textAnchor="middle"
                  className="text-xs font-bold fill-white pointer-events-none"
                >
                  {node.dataCount}
                </text>
              )}
            </g>
          ))}

          {/* 中央のタイトル */}
          <text
            x={centerX}
            y={centerY - 10}
            textAnchor="middle"
            className="text-sm font-semibold fill-gray-600 dark:fill-gray-300"
          >
            Chord Ring
          </text>
          <text
            x={centerX}
            y={centerY + 10}
            textAnchor="middle"
            className="text-xs fill-gray-500 dark:fill-gray-400"
          >
            {nodes.length} nodes
          </text>
        </svg>

        {/* 凡例 */}
        <div className="mt-4 text-sm space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
            <span>ノード (クリックで選択)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            <span>選択中のノード</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-green-500"></div>
            <span>後継リンク</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-0.5 bg-purple-500 border-dashed border-t"></div>
            <span>フィンガーテーブル (選択時)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
            <span>データ保存数</span>
          </div>
        </div>

        {/* 選択ノード情報 */}
        {selectedNodeId && (
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg w-full max-w-md">
            {(() => {
              const selectedNode = nodes.find(n => n.id === selectedNodeId);
              if (!selectedNode) return null;

              return (
                <div>
                  <h3 className="font-semibold mb-2">ノード {selectedNode.id} 詳細</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    アドレス: {selectedNode.address}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    データ数: {selectedNode.dataCount}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    後継: {selectedNode.successor}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    前任: {selectedNode.predecessor}
                  </p>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      フィンガーテーブル: [{selectedNode.fingerTable.join(', ')}]
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
