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

  // Clamp function to ensure values are between 0 and 255
  const clamp = (val: number) => Math.min(255, Math.max(0, val));

  // Hex to RGB
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  // RGB to Hex
  const rgbToHex = (r: number, g: number, b: number): string => {
    return `#${[r, g, b]
      .map((x) => {
        const hex = clamp(Math.round(x)).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')}`;
  };

  // Lighten color
  const lightenColor = (color: string, percent: number): string => {
    const rgb = hexToRgb(color);
    if (!rgb) return color; // Return original color if conversion fails
    const factor = 1 + percent / 100;
    return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
  };

  // Darken color
  const darkenColor = (color: string, percent: number): string => {
    const rgb = hexToRgb(color);
    if (!rgb) return color; // Return original color if conversion fails
    const factor = 1 - percent / 100;
    return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
  };

  // 肌の色から派生色を生成（ハイライトと影）
  const skinHighlight = lightenColor(skinColor, 15);
  const skinShadow = darkenColor(skinColor, 15);

  // 髪の色から派生色を生成
  const hairHighlight = lightenColor(hairColor, 25);
  const hairShadow = darkenColor(hairColor, 25);

  // 服の色から派生色を生成
  const clothesHighlight = lightenColor(clothesColor, 15);
  const clothesShadow = darkenColor(clothesColor, 25);

  // タイプに応じた服装のパスを取得
  const getClothesPath = () => {
    switch (type) {
      case 'business':
        return (
          <g>
            <path
              d="M35,80 v35 h30 v-35 l-15,-5 -15,5 z"
              fill={clothesColor}
              stroke={darkenColor(clothesColor, 40)}
              strokeWidth="0.6"
            />
            {/* ネクタイ */}
            <path
              d="M48,80 l2,-5 l2,5 l-1,15 l-2,0 l-1,-15 z"
              fill="#A52A2A"
              stroke={darkenColor("#A52A2A", 30)}
              strokeWidth="0.3"
            />
            {/* シャツの襟 */}
            <path
              d="M35,85 l5,-5 l10,0 l5,5"
              fill="none"
              stroke={darkenColor(clothesColor, 40)}
              strokeWidth="0.6"
              strokeLinecap="round"
            />
            <path
              d="M65,85 l-5,-5 l-10,0"
              fill="none"
              stroke={darkenColor(clothesColor, 40)}
              strokeWidth="0.6"
              strokeLinecap="round"
            />
            {/* 服のハイライト */}
            <path
              d="M38,82 l3,-3 v30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="1"
              opacity="0.6"
            />
            {/* 服の影 */}
            <path
                d="M62,82 l-3,-3 v30"
                fill="none"
                stroke={clothesShadow}
                strokeWidth="1"
                opacity="0.4"
             />
          </g>
        );
      case 'sporty':
        return (
          <g>
            <path
              d="M32,80 v35 h36 v-35 l-18,-3 -18,3 z"
              fill={clothesColor}
              stroke={darkenColor(clothesColor, 40)}
              strokeWidth="0.6"
            />
            {/* 服のディテール */}
            <path
              d="M40,87 h20"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.8"
            />
            <path
              d="M40,95 h20"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.8"
            />
            {/* 服のハイライト */}
            <path
              d="M35,82 l3,-3 v30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="1"
              opacity="0.6"
            />
            {/* 服の影 */}
            <path
                d="M65,82 l-3,-3 v30"
                fill="none"
                stroke={clothesShadow}
                strokeWidth="1"
                opacity="0.4"
             />
          </g>
        );
      case 'artistic':
        return (
          <g>
            <path
              d="M30,80 v35 h40 v-35 l-20,-8 -20,8 z"
              fill={clothesColor}
              stroke={darkenColor(clothesColor, 40)}
              strokeWidth="0.6"
            />
            {/* スカーフやアクセサリー */}
            <path
              d="M38,80 c0,0 5,5 12,5 c7,0 12,-5 12,-5 l0,5 c0,0 -5,5 -12,5 c-7,0 -12,-5 -12,-5 z"
              fill={lightenColor(clothesColor, 30)}
              stroke={darkenColor(clothesColor, 20)}
              strokeWidth="0.3"
            />
            {/* 服のハイライト */}
            <path
              d="M33,82 l3,-3 v30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="1"
              opacity="0.6"
            />
            {/* 服の影 */}
            <path
                d="M67,82 l-3,-3 v30"
                fill="none"
                stroke={clothesShadow}
                strokeWidth="1"
                opacity="0.4"
             />
          </g>
        );
      default: // casual
        return (
          <g>
            <path
              d="M35,80 v35 h30 v-35 l-15,-5 -15,5 z"
              fill={clothesColor}
              stroke={darkenColor(clothesColor, 40)}
              strokeWidth="0.6"
            />
            {/* Tシャツの襟 */}
            <path
              d="M42,81 a8,4 0 0,0 16,0"
              fill="none"
              stroke={darkenColor(clothesColor, 50)}
              strokeWidth="0.5"
            />
            {/* 服のハイライト */}
            <path
              d="M38,82 l3,-3 v30"
              fill="none"
              stroke={clothesHighlight}
              strokeWidth="1"
              opacity="0.6"
            />
            {/* 服の影 */}
            <path
                d="M62,82 l-3,-3 v30"
                fill="none"
                stroke={clothesShadow}
                strokeWidth="1"
                opacity="0.4"
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
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              <path
                d="M32,42 a18,18 0 0,0 36,0 v-5 a18,23 0 0,0 -36,0 z"
                fill={hairShadow}
                stroke="none"
                opacity="0.4"
              />
              {/* ハイライト */}
              <path
                d="M38,30 a10,15 0 0,1 10,-8 q 5 8 0 15"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
          );
        case 'sporty':
          return (
            <g>
              <path
                d="M35,50 v-15 a15,15 0 0,1 30,0 v15"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              <path
                d="M50,25 l12,5 l-12,5 l-12,-5 z"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              {/* ハイライト */}
              <path
                d="M40,38 a12,13 0 0,1 12,-10 q 5 5 0 10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
          );
        case 'artistic':
          return (
            <g>
              <path
                d="M30,50 c0,-20 10,-30 20,-30 c10,0 20,10 20,30 v10 h-40 z"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              <path
                d="M35,35 q 15 10 0 20"
                fill="none"
                stroke={hairShadow}
                strokeWidth="1"
                opacity="0.4"
              />
              <path
                d="M65,35 q -15 10 0 20"
                fill="none"
                stroke={hairShadow}
                strokeWidth="1"
                opacity="0.4"
              />
              {/* ハイライト */}
              <path
                d="M40,25 a10,15 0 0,1 10,-5 q 5 5 0 10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
          );
        default: // casual
          return (
            <g>
              <path
                d="M32,35 a18,20 0 0,0 36,0 v20 a18,15 0 0,1 -36,0 z"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              {/* 髪の流れ (影) */}
              <path
                  d="M40,40 q 10 5 0 10"
                  fill="none"
                  stroke={hairShadow}
                  strokeWidth="1"
                  opacity="0.4"
              />
              {/* ハイライト */}
              <path
                d="M38,30 a10,15 0 0,1 10,-5 q 5 5 0 8"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.6"
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
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              <path
                d="M37,38 c-2,-4 -4,-13 4,-17 c8,-4 16,-4 20,4 c1,4 0,8 -4,12"
                fill={hairShadow}
                stroke="none"
                opacity="0.4"
              />
              {/* ハイライト */}
              <path
                d="M40,25 a8,8 0 0,1 8,-3"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1"
                opacity="0.6"
              />
            </g>
          );
        case 'sporty':
          return (
            <g>
              <path
                d="M35,40 h30 v-15 h-30 z"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              <path
                d="M37,38 h26 v-11 h-26 z"
                fill={hairShadow}
                stroke="none"
                opacity="0.4"
              />
              {/* ハイライト */}
              <path
                d="M40,30 h10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1"
                opacity="0.6"
              />
            </g>
          );
        case 'artistic':
          return (
            <g>
              <path
                d="M30,45 c0,-20 40,-20 40,0"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              <path
                d="M35,43 c0,-15 30,-15 30,0"
                fill={hairShadow}
                stroke="none"
                opacity="0.4"
              />
              <path
                d="M30,42 c-5,-10 5,-25 20,-25 c15,0 25,15 20,25"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              {/* ハイライト */}
              <path
                d="M35,30 a15,15 0 0,1 15,-10"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
          );
        default: // casual
          return (
            <g>
              <path
                d="M32,35 a18,20 0 0,0 36,0 v15 h-36 z"
                fill={hairColor}
                stroke={darkenColor(hairColor, 30)}
                strokeWidth="0.5"
              />
              {/* 髪の流れ (影) */}
              <path
                  d="M40,40 q 10 5 0 10"
                  fill="none"
                  stroke={hairShadow}
                  strokeWidth="1"
                  opacity="0.4"
              />
              {/* ハイライト */}
              <path
                d="M38,30 a10,15 0 0,1 10,-5 q 5 5 0 8"
                fill="none"
                stroke={hairHighlight}
                strokeWidth="1.5"
                opacity="0.6"
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

        {/* 体 */}
        <g transform="translate(0, 0)">
          {/* 顔 */}
          <circle cx="50" cy="50" r="25" fill={skinColor} stroke="#333" strokeWidth="0.5" />
          {/* 顔のハイライト */}
          <path d="M40,40 Q 50 35, 60 40" fill="none" stroke={skinHighlight} strokeWidth="1.5" opacity="0.7" strokeLinecap="round" />
          {/* 顔の影 */}
          <path d="M40,60 Q 50 65, 60 60" fill="none" stroke={skinShadow} strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />

          {/* 首 */}
          <rect x="45" y="70" width="10" height="15" fill={skinColor} />
          <path d="M45,85 Q 50 88, 55 85" fill="none" stroke={skinShadow} strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />

          {/* 服 */}
          {getClothesPath()}

          {/* 髪 */}
          {getHairPath()}

          {/* 目 */}
          <g transform="translate(-3, 0)"> {/* 少し内側に寄せる */}
            {/* 左目 */}
            <ellipse cx="40" cy="52" rx="3.5" ry="4.5" fill="#FFF" />
            <circle cx={gender === 'female' ? "41" : "40"} cy="52" r="2" fill="#333" /> {/* 瞳孔、女性は少し外向き */}
            <circle cx="39" cy="50" r="0.8" fill="#FFF" opacity="0.9" /> {/* ハイライト */}
            {/* 女性ならまつ毛 */}
            {gender === 'female' && (
               <path d="M36.5,47.5 q 3 -1.5 7 0 M37,46 q 3 -2 6 -0.5 M38,45 q 2 -2 4 -1" fill="none" stroke="#333" strokeWidth="0.4" strokeLinecap="round" />
             )}
          </g>
           <g transform="translate(3, 0)"> {/* 少し内側に寄せる */}
            {/* 右目 */}
            <ellipse cx="60" cy="52" rx="3.5" ry="4.5" fill="#FFF" />
            <circle cx={gender === 'female' ? "59" : "60"} cy="52" r="2" fill="#333" /> {/* 瞳孔、女性は少し外向き */}
            <circle cx="61" cy="50" r="0.8" fill="#FFF" opacity="0.9" /> {/* ハイライト */}
             {/* 女性ならまつ毛 */}
             {gender === 'female' && (
               <path d="M63.5,47.5 q -3 -1.5 -7 0 M63,46 q -3 -2 -6 -0.5 M62,45 q -2 -2 -4 -1" fill="none" stroke="#333" strokeWidth="0.4" strokeLinecap="round" />
             )}
          </g>

          {/* 眉 */}
           <g transform="translate(0, -2)"> {/* 少し上げる */}
              {/* 左眉 */}
              <path d={gender === 'female' ? "M36,45 q 4 -2 8 0" : "M35,45 q 5 -1 10 0"} stroke="#333" strokeWidth={gender === 'female' ? "0.8" : "1.2"} fill="none" strokeLinecap="round" />
              {/* 右眉 */}
              <path d={gender === 'female' ? "M56,45 q 4 0 8 -2" : "M55,45 q 5 0 10 -1"} stroke="#333" strokeWidth={gender === 'female' ? "0.8" : "1.2"} fill="none" strokeLinecap="round" />
           </g>

          {/* 鼻 */}
          <path d="M49,58 l 2,2" stroke={darkenColor(skinColor, 30)} strokeWidth="0.6" fill="none" strokeLinecap="round" />

          {/* 口 */}
          <path d="M45,65 q 5 2 10 0" stroke="#800000" strokeWidth="0.8" fill="none" strokeLinecap="round" />

        </g>

        {/* ステータスインジケーター */}
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

      </svg>

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
