import React from 'react';

interface MessageArrowProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: string; // メッセージの種類 (RequestVote, AppendEntriesなど)
}

const NODE_RADIUS = 40; // Nodeの半径 (Node.tsxでのサイズと合わせる)

const MessageArrow: React.FC<MessageArrowProps> = ({ from, to, type }) => {
  // 矢印の開始点と終了点をノードの中心から円周上に調整
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const startX = from.x + NODE_RADIUS * Math.cos(angle) + NODE_RADIUS; // 中心座標から半径分移動 + 中心座標オフセット
  const startY = from.y + NODE_RADIUS * Math.sin(angle) + NODE_RADIUS; // 中心座標から半径分移動 + 中心座標オフセット
  const endX = to.x - NODE_RADIUS * Math.cos(angle) + NODE_RADIUS; // 中心座標から半径分移動 + 中心座標オフセット
  const endY = to.y - NODE_RADIUS * Math.sin(angle) + NODE_RADIUS; // 中心座標から半径分移動 + 中心座標オフセット

  // メッセージの種類に応じて色を決定 (例)
  let color = 'stroke-gray-500';
  let textColor = 'text-gray-500'; // マーカー用のテキストカラー
  if (type.includes('RequestVote')) { color = 'stroke-orange-500'; textColor = 'text-orange-500'; }
  if (type.includes('AppendEntries') && !type.includes('Reply')) { color = 'stroke-green-500'; textColor = 'text-green-500'; } // AppendEntries (Heartbeat含む)
  if (type.includes('Reply')) { color = 'stroke-blue-500'; textColor = 'text-blue-500'; } // 各種Reply

  // 線が短すぎる場合は矢印を描画しない (重なりを防ぐ)
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx*dx + dy*dy);
  if (length < 5) return null; // 短すぎる場合は描画しない

  // 矢印マーカーのIDを生成 (特殊文字を置換)
  const markerId = `arrowhead-${type.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ overflow: 'visible' }} // SVGがコンテナ外にはみ出るのを許可
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="7"
          refX="7" // 矢印の先端が線にめり込まないように調整
          refY="3.5"
          orient="auto"
        >
          {/* Tailwindクラスを直接適用 */}
          <polygon points="0 0, 10 3.5, 0 7" className={`fill-current ${textColor}`} />
        </marker>
      </defs>
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        className={`${color} stroke-2 message-arrow-line`} // アニメーション用クラス追加
        markerEnd={`url(#${markerId})`}
        // style={{ animation: 'dashdraw 0.5s linear forwards' }} // CSSで制御する
      />
      {/* アニメーション用のCSSはglobals.cssで定義 */}
    </svg>
  );
};

export default MessageArrow;
