'use client';

import { Tile, TileSuit, HonorType } from '@/lib/mahjong/tiles';

interface TileDisplayProps {
  tile: Tile | null; // null の場合は裏向きの牌などを想定
  onClick?: () => void;
  className?: string;
  isSelectable?: boolean;
  isSelected?: boolean;
  isHidden?: boolean; // CPUの手牌など、完全に隠す場合
}

const suitToChar: Record<TileSuit, string> = {
  [TileSuit.MANZU]: '萬',
  [TileSuit.PINZU]: '筒',
  [TileSuit.SOZU]: '索',
  [TileSuit.JIHAI]: '',
};

const honorToChar: Record<HonorType, string> = {
  [HonorType.TON]: '東',
  [HonorType.NAN]: '南',
  [HonorType.SHA]: '西',
  [HonorType.PEI]: '北',
  [HonorType.HAKU]: '白',
  [HonorType.HATSU]: '發',
  [HonorType.CHUN]: '中',
};

export default function TileDisplay({
  tile,
  onClick,
  className = '',
  isSelectable = false,
  isSelected = false,
  isHidden = false,
}: TileDisplayProps) {
  if (isHidden) {
    return (
      <div
        className={`w-12 h-20 sm:w-14 sm:h-24 md:w-16 md:h-28 bg-gray-400 rounded-md shadow-clay-sm ${className}`}
        aria-label="Hidden tile"
      />
    );
  }
  if (!tile) {
    // 裏向きの牌 (例: CPUの手牌の一部として表示)
    return (
      <div
        className={`w-12 h-20 sm:w-14 sm:h-24 md:w-16 md:h-28 bg-green-700 border-2 border-green-800 rounded-md shadow-clay-sm flex justify-center items-center ${className}`}
        aria-label="Facedown tile"
      >
        {/* 裏面の模様などを追加しても良い */}
      </div>
    );
  }

  const tileValue = tile.suit === TileSuit.JIHAI ? honorToChar[tile.value as HonorType] : tile.value.toString();
  const tileSuitChar = suitToChar[tile.suit];
  const tileName = tile.name;
  const tileId = tile.id;

  let bgColor = tile.isRedDora ? 'bg-red-200' : 'bg-slate-50';
  let textColor = tile.isRedDora ? 'text-red-600' : 'text-black';
  if (tile.suit === TileSuit.SOZU) textColor = tile.isRedDora ? 'text-red-700' : 'text-green-600';
  if (tile.suit === TileSuit.JIHAI && (tile.value === HonorType.HATSU || tile.value === HonorType.CHUN)) {
    textColor = tile.value === HonorType.HATSU ? (tile.isRedDora ? 'text-red-700' : 'text-green-600') : (tile.isRedDora ? 'text-red-700' : 'text-red-500');
  }

  if (isSelected) {
    bgColor = 'bg-blue-200';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isSelectable}
      className={`w-12 h-20 sm:w-14 sm:h-24 md:w-16 md:h-28 rounded-md border-2 border-gray-300 shadow-clay-sm hover:shadow-clay-md focus:shadow-clay-md transform transition-all duration-150 ease-in-out ${bgColor} ${isSelectable ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${className}`}
      aria-label={`Tile ${tileName}`}
      title={tileName}
    >
      <div className="flex flex-col items-center justify-center h-full p-1">
        <span className={`text-xl sm:text-2xl md:text-3xl font-bold ${textColor}`}>{tileValue}</span>
        {tile.suit !== TileSuit.JIHAI && (
          <span className={`text-sm sm:text-base md:text-lg ${textColor}`}>{tileSuitChar}</span>
        )}
      </div>
    </button>
  );
}
