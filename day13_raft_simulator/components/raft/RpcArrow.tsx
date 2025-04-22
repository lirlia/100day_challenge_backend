import React from 'react';
import { RPCMessage, NodeId } from '../../lib/types/raft'; // Adjust path if needed

// Export the props interface
export interface RpcArrowProps {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    messageType: RPCMessage['type'] | 'Heartbeat'; // ハートビートも区別
    voteGranted?: boolean; // RequestVoteReply用
    success?: boolean; // AppendEntriesReply用
    nodeSize: number; // ノードの直径 (px)
}

// メッセージタイプに応じた色を決定
const getArrowColor = (
    messageType: RpcArrowProps['messageType'],
    voteGranted?: boolean,
    success?: boolean
): string => {
    switch (messageType) {
        case 'RequestVote':
            return 'stroke-yellow-500';
        case 'AppendEntries':
            return 'stroke-blue-500';
        case 'Heartbeat': // AppendEntries(empty) を Heartbeat として扱う
            return 'stroke-blue-300 opacity-70';
        case 'RequestVoteReply':
            return voteGranted ? 'stroke-green-500' : 'stroke-red-500';
        case 'AppendEntriesReply':
            return success ? 'stroke-green-500' : 'stroke-red-500';
        default:
            return 'stroke-gray-400';
    }
};

// メッセージタイプに応じた線のスタイルを決定
const getArrowStyle = (messageType: RpcArrowProps['messageType']): React.SVGProps<SVGLineElement> => {
     switch (messageType) {
        case 'RequestVoteReply':
        case 'AppendEntriesReply':
            return { strokeDasharray: "4 2", strokeWidth: 1.5 }; // 応答は破線
        case 'Heartbeat':
             return { strokeWidth: 1 }; // ハートビートは細線
        default:
             return { strokeWidth: 2 }; // 通常の要求は実線
    }
}

export const RpcArrow: React.FC<RpcArrowProps> = ({
    startX, startY, endX, endY, messageType, voteGranted, success, nodeSize
}) => {
    const color = getArrowColor(messageType, voteGranted, success);
    const style = getArrowStyle(messageType);

    // ノードの中心座標を計算
    const nodeRadius = nodeSize / 2;
    const startCenterX = startX + nodeRadius;
    const startCenterY = startY + nodeRadius;
    const endCenterX = endX + nodeRadius;
    const endCenterY = endY + nodeRadius;

    // ノードの境界線上で矢印を開始/終了させるためのオフセット計算
    const dx = endCenterX - startCenterX;
    const dy = endCenterY - startCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < nodeSize) return null; // Avoid drawing arrow if nodes overlap significantly or same node

    // ノード境界までのオフセットベクトル
    const offsetX = (dx / dist) * nodeRadius;
    const offsetY = (dy / dist) * nodeRadius;

    // 矢印の開始点と終了点をノードの境界に調整
    const arrowStartX = startCenterX + offsetX;
    const arrowStartY = startCenterY + offsetY;
    const arrowEndX = endCenterX - offsetX;
    const arrowEndY = endCenterY - offsetY;

    const markerId = `arrowhead-${messageType}-${Math.random().toString(36).substring(7)}`;

    return (
        <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ overflow: 'visible' }} // Ensure arrowhead is visible
        >
            {/* Define marker */}
            <defs>
                <marker
                    id={markerId}
                    markerWidth="10"
                    markerHeight="7"
                    refX="9" // Adjust based on stroke width and desired appearance
                    refY="3.5"
                    orient="auto"
                    markerUnits="strokeWidth"
                >
                    <polygon points="0 0, 10 3.5, 0 7" className={color.replace('stroke-', 'fill-')} />
                </marker>
            </defs>
            {/* Arrow Line */}
            <line
                x1={arrowStartX}
                y1={arrowStartY}
                x2={arrowEndX}
                y2={arrowEndY}
                className={`${color} transition-all duration-100`}
                markerEnd={`url(#${markerId})`}
                {...style}
            />
        </svg>
    );
};
