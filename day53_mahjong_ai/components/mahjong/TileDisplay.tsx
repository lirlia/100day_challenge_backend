'use client';

import { Tile, TileSuit, HonorType } from '@/lib/mahjong/tiles';
import Image from 'next/image';

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
  const getTileImagePath = (tile: Tile | null): string => {
    if (!tile) {
      return '/images/p_no_1.gif'; // 裏向きの牌
    }
    let suitPrefix = '';
    let valuePart = '';

    switch (tile.suit) {
      case TileSuit.MANZU:
        suitPrefix = 'ms';
        valuePart = tile.value.toString();
        break;
      case TileSuit.PINZU:
        suitPrefix = 'ps';
        valuePart = tile.value.toString();
        break;
      case TileSuit.SOZU:
        suitPrefix = 'ss';
        valuePart = tile.value.toString();
        break;
      case TileSuit.JIHAI:
        suitPrefix = 'ji_';
        // 提供されたファイル名 p_ji_c_1.gif (中), p_ji_h_1.gif (白), p_ji_e_1.gif (東), p_ji_n_1.gif (北), p_ji_s_1.gif (南), p_ji_w_1.gif (西) に合わせる
        const honorMap: Record<HonorType, string> = {
          [HonorType.TON]: 'e',
          [HonorType.NAN]: 's',
          [HonorType.SHA]: 'w',
          [HonorType.PEI]: 'n',
          [HonorType.HAKU]: 'h',
          [HonorType.HATSU]: ' ', // 發に対応するファイルがないため、一時的にスペースや認識できない文字にしてエラーを誘発させないようにする。もしくはデフォルト画像。
          [HonorType.CHUN]: 'c',
        };
        valuePart = honorMap[tile.value as HonorType];
        if (tile.value === HonorType.HATSU) { // 發の場合の特別な処理
          console.warn("Image for HATSU (發) not found. Using fallback (facedown tile).");
          return '/images/p_no_1.gif'; // 代替として裏面画像
        }
        if (!valuePart) { // マップにない、またはHATSU以外の未定義の字牌の場合
          console.error(`Unknown honor tile value: ${tile.value} for tile ${tile.id}. Using fallback.`);
          return '/images/p_no_1.gif'; // 不明な字牌は裏向き
        }
        break;
      default:
        console.error(`Unknown tile suit: ${tile.suit} for tile ${tile.id}. Using fallback.`);
        return '/images/p_no_1.gif'; // 不明な牌は裏向き
    }
    // 赤ドラはファイル名に r が含まれることが多いが、提供されたファイル名にはなさそう。
    // p_ms5_1.gif のような形式なので、赤ドラは考慮しない。
    const finalPath = `/images/p_${suitPrefix}${valuePart}_1.gif`;
    // console.log(`Generated image path for ${tile.name}: ${finalPath}`); // デバッグ用
    return finalPath;
  };

  if (isHidden) {
    return (
      <div
        className={`w-12 h-20 sm:w-14 sm:h-24 md:w-16 md:h-28 bg-gray-400 rounded-md shadow-clay-sm ${className}`}
        aria-label="Hidden tile"
      />
    );
  }

  const imagePath = getTileImagePath(tile);
  const tileName = tile ? tile.name : '裏向きの牌';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isSelectable}
      className={`hover:shadow-clay-md focus:shadow-clay-md transform transition-all duration-150 ease-in-out ${isSelectable ? 'cursor-pointer' : 'cursor-default'} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${className} p-0.5 bg-slate-50`}
      aria-label={`Tile ${tileName}`}
      title={tileName}
    >
      <Image
        src={imagePath}
        alt={tileName}
        width={64} // md:w-16 に対応 (1rem = 16px と仮定し、Tailwindのw-16は4rem = 64px)
        height={112} // md:h-28 に対応 (Tailwindのh-28は7rem = 112px)
        className="object-contain w-full h-full rounded-sm"
        unoptimized // GIFアニメーションの場合や、最適化が不要なローカル画像の場合
      />
    </button>
  );
}
