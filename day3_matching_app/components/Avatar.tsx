import React from 'react';

interface AvatarProps {
  type?: 'casual' | 'business' | 'sporty' | 'artistic';
  size?: number;
  skinColor?: string;
  hairColor?: string;
  clothesColor?: string;
  bgColor?: string;
  status?: 'online' | 'offline' | 'away';
  onClick?: () => void;
  gender?: 'male' | 'female';
}

/**
 * SVGを使用したリアルなアバターコンポーネント
 */
export default function Avatar({
  type = 'casual',
  size = 100,
  skinColor = '#F5D0A9',
  hairColor = '#4A2700',
  clothesColor = '#3498DB',
  bgColor = '#E6F3FF',
  status,
  onClick,
  gender = 'male'
}: AvatarProps) {
  // ステータスの色を設定
  const statusColors = {
    online: '#44b700',
    offline: '#999',
    away: '#ff9800',
  };

  // ステータスのラベル
  const statusLabels = {
    online: 'オンライン',
    offline: 'オフライン',
    away: '離席中',
  };

  // 肌の色から派生色を生成（ハイライトと影）
  const skinHighlight = lightenColor(skinColor, 20);
  const skinShadow = darkenColor(skinColor, 20);

  // 髪の色から派生色を生成
  const hairHighlight = lightenColor(hairColor, 30);
  const hairShadow = darkenColor(hairColor, 20);

  // 服の色から派生色を生成
  const clothesHighlight = lightenColor(clothesColor, 20);
  const clothesShadow = darkenColor(clothesColor, 30);

  // タイプに応じた服装のパスを取得
  const getClothesPath = () => {
    switch (type) {
      case 'business':
        return (
          <g>
            <path
              d="M35,80 v35 h30 v-35 l-15,-5 -15,5 z"
              fill={clothesColor}
              stroke="#333"
              strokeWidth="0.5"
            />
            {/* ネクタイ */}
            <path
              d="M48,80 l2,-5 l2,5 l-1,15 l-2,0 l-1,-15 z"
              fill="#B22222"
              stroke="#333"
              strokeWidth="0.2"
            />
            {/* シャツの襟 */}
            <path
              d="M35,85 l5,-5 l10,0 l5,5"
              fill="none"
              stroke="#333"
              strokeWidth="0.5"
              strokeLinecap="round"
            />
            <path
              d="M65,85 l-5,-5 l-10,0"
              fill="none"
              stroke="#333"
              strokeWidth="0.5"
              strokeLinecap="round"
            />
            {/* 服のハイライト */}
            <path
              d="M38,82 l3,-3 l0,30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="0.5"
              opacity="0.7"
            />
          </g>
        );
      case 'sporty':
        return (
          <g>
            <path
              d="M32,80 v35 h36 v-35 l-18,-3 -18,3 z"
              fill={clothesColor}
              stroke="#333"
              strokeWidth="0.5"
            />
            {/* 服のディテール */}
            <path
              d="M40,85 h20"
              fill="none"
              stroke="#FFF"
              strokeWidth="1"
              strokeLinecap="round"
            />
            <path
              d="M40,90 h20"
              fill="none"
              stroke="#FFF"
              strokeWidth="1"
              strokeLinecap="round"
            />
            {/* 服のハイライト */}
            <path
              d="M35,82 l3,-3 l0,30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="0.5"
              opacity="0.7"
            />
          </g>
        );
      case 'artistic':
        return (
          <g>
            <path
              d="M30,80 v35 h40 v-35 l-20,-8 -20,8 z"
              fill={clothesColor}
              stroke="#333"
              strokeWidth="0.5"
            />
            {/* スカーフやアクセサリー */}
            <path
              d="M38,80 c0,0 5,5 12,5 c7,0 12,-5 12,-5 l0,5 c0,0 -5,5 -12,5 c-7,0 -12,-5 -12,-5 z"
              fill={lightenColor(clothesColor, 40)}
              stroke="#333"
              strokeWidth="0.2"
            />
            {/* 服のハイライト */}
            <path
              d="M33,82 l3,-3 l0,30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="0.5"
              opacity="0.7"
            />
          </g>
        );
      default: // casual
        return (
          <g>
            <path
              d="M35,80 v35 h30 v-35 l-15,-5 -15,5 z"
              fill={clothesColor}
              stroke="#333"
              strokeWidth="0.5"
            />
            {/* Tシャツの襟 */}
            <path
              d="M42,81 a8,4 0 0,0 16,0"
              fill="none"
              stroke="#333"
              strokeWidth="0.3"
            />
            {/* 服のハイライト */}
            <path
              d="M38,82 l3,-3 l0,30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="0.5"
              opacity="0.7"
            />
          </g>
        );
    }
  };

  // タイプとジェンダーに応じた髪型のパスを取得
  const getHairPath = () => {
    if (gender === 'female') {
      switch (type) {
        case 'business':
          return (
            <g>
              <path
                d="M30,45 a20,20 0 0,0 40,0 v-10 a20,25 0 0,0 -40,0 z"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M32,42 a18,18 0 0,0 36,0 v-5 a18,23 0 0,0 -36,0 z"
                fill={hairShadow}
                stroke="none"
                opacity="0.3"
              />
              {/* ハイライト */}
              <path
                d="M38,30 a10,15 0 0,1 10,-8"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1"
                opacity="0.5"
              />
            </g>
          );
        case 'sporty':
          return (
            <g>
              <path
                d="M35,50 v-15 a15,15 0 0,1 30,0 v15"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M50,25 l12,5 l-12,5 l-12,-5 z"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              {/* ハイライト */}
              <path
                d="M40,38 a12,13 0 0,1 12,-10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1"
                opacity="0.5"
              />
            </g>
          );
        case 'artistic':
          return (
            <g>
              <path
                d="M30,50 c0,-20 10,-30 20,-30 c10,0 20,10 20,30"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M28,50 c-5,-10 5,-20 5,-30 c0,-5 5,-8 10,-8"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M72,50 c5,-10 -5,-20 -5,-30 c0,-5 -5,-8 -10,-8"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              {/* ハイライト */}
              <path
                d="M38,25 a15,15 0 0,1 15,-10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.5"
              />
            </g>
          );
        default: // casual
          return (
            <g>
              <path
                d="M30,50 c0,-15 10,-25 20,-25 c10,0 20,10 20,25"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M32,47 c0,-13 8,-23 18,-23 c10,0 18,10 18,23"
                fill={hairShadow}
                stroke="none"
                opacity="0.3"
              />
              {/* ハイライト */}
              <path
                d="M35,32 a15,15 0 0,1 15,-8"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.5"
              />
            </g>
          );
      }
    } else { // male
      switch (type) {
        case 'business':
          return (
            <g>
              <path
                d="M35,40 c-3,-5 -5,-15 5,-20 c10,-5 20,-5 25,5 c2,5 0,10 -5,15"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M37,38 c-2,-4 -4,-13 4,-17 c8,-4 16,-4 20,4 c1,4 0,8 -4,12"
                fill={hairShadow}
                stroke="none"
                opacity="0.3"
              />
              {/* ハイライト */}
              <path
                d="M40,25 a8,8 0 0,1 8,-3"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1"
                opacity="0.5"
              />
            </g>
          );
        case 'sporty':
          return (
            <g>
              <path
                d="M35,40 h30 v-15 h-30 z"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M37,38 h26 v-11 h-26 z"
                fill={hairShadow}
                stroke="none"
                opacity="0.3"
              />
              {/* ハイライト */}
              <path
                d="M40,30 h10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1"
                opacity="0.5"
              />
            </g>
          );
        case 'artistic':
          return (
            <g>
              <path
                d="M30,45 c0,-20 40,-20 40,0"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M35,43 c0,-15 30,-15 30,0"
                fill={hairShadow}
                stroke="none"
                opacity="0.2"
              />
              <path
                d="M30,42 c-5,-10 5,-25 20,-25 c15,0 25,15 20,25"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              {/* ハイライト */}
              <path
                d="M35,30 a15,15 0 0,1 15,-10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.5"
              />
            </g>
          );
        default: // casual
          return (
            <g>
              <path
                d="M35,42 c-10,-15 0,-25 15,-25 c15,0 25,10 15,25"
                fill={hairColor}
                stroke="#333"
                strokeWidth="0.5"
              />
              <path
                d="M38,40 c-8,-12 0,-20 12,-20 c12,0 20,8 12,20"
                fill={hairShadow}
                stroke="none"
                opacity="0.3"
              />
              {/* ハイライト */}
              <path
                d="M45,22 a8,8 0 0,1 8,3"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1"
                opacity="0.5"
              />
            </g>
          );
      }
    }
  };

  // オンラインステータスを表示するかどうか
  const showStatus = status !== undefined;

  // レスポンシブ対応のためのサイズ計算（小さめのステータスインジケーター）
  const statusSize = Math.max(size * 0.15, 8); // 最小サイズは8px、アバターサイズの15%

  return (
    <div
      className="avatar-container"
      style={{
        width: size,
        height: size,
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default'
      }}
      onClick={onClick}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 背景円 */}
        <defs>
          <radialGradient id="bgGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" stopColor={lightenColor(bgColor, 15)} />
            <stop offset="100%" stopColor={bgColor} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#bgGradient)" stroke="#ccc" strokeWidth="0.5" />

        {/* 服 */}
        {getClothesPath()}

        {/* 首 */}
        <path
          d="M43,70 c0,0 3,5 7,5 c4,0 7,-5 7,-5 v-5 h-14 z"
          fill={skinColor}
          stroke="#333"
          strokeWidth="0.3"
        />
        {/* 首のハイライト */}
        <path
          d="M44,68 c0,0 2,3 6,3 c4,0 6,-3 6,-3"
          fill="none"
          stroke={skinHighlight}
          strokeWidth="0.5"
          opacity="0.5"
        />

        {/* 顔 - 楕円形に変更してより人間らしく */}
        <ellipse
          cx="50"
          cy="50"
          rx="18"
          ry="20"
          fill={skinColor}
          stroke="#333"
          strokeWidth="0.3"
        />

        {/* 顔の陰影 */}
        <path
          d="M40,57 a20,25 0 0,0 20,0"
          fill="none"
          stroke={skinShadow}
          strokeWidth="3"
          opacity="0.1"
        />

        {/* 顔のハイライト */}
        <path
          d="M40,43 a20,25 0 0,1 10,-8"
          fill="none"
          stroke={skinHighlight}
          strokeWidth="4"
          opacity="0.1"
          strokeLinecap="round"
        />

        {/* 髪 */}
        {getHairPath()}

        {/* 目 */}
        <g>
          {/* 左目 */}
          <ellipse cx="43" cy="48" rx="3" ry="4" fill="white" stroke="#333" strokeWidth="0.3" />
          <circle cx="43" cy="48" r="1.5" fill="#333" />
          <circle cx="43.5" cy="47.5" r="0.5" fill="white" />

          {/* 右目 */}
          <ellipse cx="57" cy="48" rx="3" ry="4" fill="white" stroke="#333" strokeWidth="0.3" />
          <circle cx="57" cy="48" r="1.5" fill="#333" />
          <circle cx="57.5" cy="47.5" r="0.5" fill="white" />

          {/* 眉毛 */}
          <path
            d="M38,43 a10,5 0 0,1 10,0"
            fill="none"
            stroke={hairColor}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M52,43 a10,5 0 0,1 10,0"
            fill="none"
            stroke={hairColor}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>

        {/* 鼻 */}
        <path
          d="M50,48 l0,6 l-2,2 l4,0 z"
          fill={skinShadow}
          opacity="0.1"
          stroke="#333"
          strokeWidth="0.3"
        />

        {/* 口 */}
        {gender === 'female' ? (
          <path
            d="M45,60 c3,2 7,2 10,0"
            fill="none"
            stroke="#333"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M44,58 c4,3 8,3 12,0"
            fill="none"
            stroke="#333"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* オンラインステータス表示 - 小さく改良したレスポンシブ版 */}
      {showStatus && (
        <div
          className="status-indicator"
          style={{
            position: 'absolute',
            bottom: '2%',
            right: '2%',
            width: statusSize,
            height: statusSize,
            borderRadius: '50%',
            backgroundColor: statusColors[status] || statusColors.offline,
            border: `${Math.max(1, statusSize * 0.1)}px solid white`,
            boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.1)',
            animation: status === 'online' ? 'pulse 2s infinite' : 'none',
            zIndex: 10,
          }}
          title={statusLabels[status] || '不明'}
        >
          {/* オンライン状態の時のみパルスアニメーション用の要素を追加 */}
          {status === 'online' && (
            <span
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                backgroundColor: statusColors.online,
                opacity: 0.5,
                animation: 'ripple 1.5s infinite ease-out',
              }}
            />
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(68, 183, 0, 0.7);
          }

          70% {
            transform: scale(1);
            box-shadow: 0 0 0 3px rgba(68, 183, 0, 0);
          }

          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(68, 183, 0, 0);
          }
        }

        @keyframes ripple {
          0% {
            transform: scale(1);
            opacity: 0.4;
          }

          100% {
            transform: scale(1.3);
            opacity: 0;
          }
        }

        /* レスポンシブ対応 */
        @media (max-width: 768px) {
          .status-indicator {
            width: ${Math.max(size * 0.12, 6)}px !important;
            height: ${Math.max(size * 0.12, 6)}px !important;
            border-width: 1px !important;
          }
        }
      `}</style>
    </div>
  );
}

// 色を明るくする関数
function lightenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
}

// 色を暗くする関数
function darkenColor(color: string, percent: number): string {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
  const B = Math.max(0, (num & 0x0000FF) - amt);
  return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
}
