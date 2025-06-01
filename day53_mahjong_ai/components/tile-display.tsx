'use client';

import { Tile as TileType } from '../lib/mahjong/tiles';

interface TileDisplayProps {
  tile: TileType | null; // nullを許容して裏向き牌なども表現できるように
  onClick?: (tile: TileType) => void;
  isSelected?: boolean;
  isPlayable?: boolean; // プレイヤーが操作可能かどうかのフラグ
  isHidden?: boolean; // CPUの手牌など、裏向きで表示する場合
  size?: 'small' | 'medium' | 'large'; // サイズ指定を追加
}

export const TileDisplay = ({
  tile,
  onClick,
  isSelected,
  isPlayable = true,
  isHidden = false,
  size = 'medium'
}: TileDisplayProps) => {
  if (isHidden || !tile) {
    let sizeClasses = "w-10 h-14";
    if (size === 'small') sizeClasses = "w-8 h-12";
    if (size === 'large') sizeClasses = "w-12 h-16";
    return <div className={`clay-tile-back ${sizeClasses} m-0.5 rounded-md bg-slate-600 border-2 border-slate-700`} aria-label="Hidden Tile" />;
  }

  const suitMap: Record<string, string> = { m: '萬', p: '筒', s: '索', z: '字' };
  const honorMap: Record<string, string> = {
    ton: '東', nan: '南', sha: '西', pei: '北',
    haku: '白', hatsu: '發', chun: '中'
  };

  let displayValue = tile.value.toString();
  let suitCharacter = suitMap[tile.suit];

  if (tile.suit === 'z') {
    displayValue = honorMap[tile.id] || '字';
    suitCharacter = ''; // 字牌の場合はスーツ文字を非表示にすることも検討
  }

  const baseStyle = "m-0.5 flex flex-col items-center justify-center rounded-md shadow-md transform transition-all";
  let sizeClasses = "w-10 h-14 text-base";
  let valueFontSize = "text-xl";
  let suitFontSize = "text-xs";

  if (size === 'small') {
    sizeClasses = "w-8 h-12 text-sm";
    valueFontSize = "text-lg";
    suitFontSize = "text-[10px]";
  }
  if (size === 'large') {
    sizeClasses = "w-12 h-16 text-lg";
    valueFontSize = "text-2xl";
    suitFontSize = "text-sm";
  }

  const selectedStyle = isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-green-700 scale-105' : 'hover:scale-105';
  const playableStyle = isPlayable && onClick ? 'cursor-pointer' : 'cursor-default';
  const tileColorStyle = tile.isRedDora ? 'text-red-500' : 'text-black'; // 赤ドラ対応 (仮)

  // クレイモーフィズムスタイルを強化
  const clayStyle = `clay-tile ${isSelected ? 'clay-tile-selected' : ''}`;

  return (
    <button
      type="button"
      onClick={() => onClick && isPlayable && onClick(tile)}
      className={`${baseStyle} ${sizeClasses} ${clayStyle} ${selectedStyle} ${playableStyle}`}
      aria-label={`Tile ${displayValue} ${suitCharacter}`}
      disabled={!isPlayable || !onClick}
    >
      <span className={`${valueFontSize} font-bold ${tileColorStyle}`}>{displayValue}</span>
      {suitCharacter && <span className={`${suitFontSize} ${tileColorStyle}`}>{suitCharacter}</span>}
    </button>
  );
};
