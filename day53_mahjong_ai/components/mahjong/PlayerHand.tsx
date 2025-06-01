'use client';

import { Tile } from '@/lib/mahjong/tiles';
import TileDisplay from './TileDisplay';

interface PlayerHandProps {
  hand: Tile[]; // 手牌 (ツモ牌を含む場合は14枚、それ以外は13枚)
  lastDraw?: Tile | null; // 最後にツモった牌 (区別して表示する場合)
  onTileSelect?: (tile: Tile) => void;
  selectedTile?: Tile | null;
  canDiscard: boolean; // 打牌可能な状態か (自分のターンの時など)
}

export default function PlayerHand({
  hand,
  lastDraw,
  onTileSelect,
  selectedTile,
  canDiscard
}: PlayerHandProps) {
  const displayHand = [...hand];
  let drawnTile: Tile | null = null;

  if (displayHand.length === 14 && lastDraw) {
    // lastDrawが手牌の最後にあると仮定して分離する
    // ただし、完全に一致する牌でなくても良い (IDが同じならOK)
    const lastDrawInHandIndex = displayHand.findIndex(t => t.id === lastDraw.id);
    if (lastDrawInHandIndex !== -1) {
      drawnTile = displayHand.splice(lastDrawInHandIndex, 1)[0];
    } else {
      // lastDraw が手牌に見つからない場合、最後の牌をツモ牌扱い (フォールバック)
      // console.warn("Last draw tile not found in hand, using last tile as drawn tile.");
      // drawnTile = displayHand.pop()!;
      // lastDraw が手牌に含まれていない場合、そのまま14枚表示し、lastDrawは無視する
      // (例：カン直後の嶺上開花ツモなど、手牌に加えた直後の状態）
    }
  } else if (displayHand.length === 14 && !lastDraw){
    // lastDraw がない14枚手牌の場合 (カン直後でまだ打牌していないなど)
    // 特に区別せず表示
  } else if (displayHand.length > 13 && !lastDraw) {
    // 13枚より多いが lastDraw がない場合、最後の牌をツモ牌扱いとする
    // これは、APIから lastDraw が適切に渡ってこない場合のフォールバック
    // drawnTile = displayHand.pop()!;
  }

  return (
    <div className="flex flex-wrap justify-center items-end gap-1 p-2 bg-gray-100 shadow-clay-inset rounded-lg">
      {displayHand.map((tile, index) => (
        <TileDisplay
          key={`${tile.id}-${index}`}
          tile={tile}
          onClick={() => onTileSelect && onTileSelect(tile)}
          isSelectable={canDiscard}
          isSelected={canDiscard && selectedTile?.id === tile.id}
          className={canDiscard && selectedTile?.id === tile.id ? 'transform -translate-y-2' : ''}
        />
      ))}
      {drawnTile && (
        <div className="ml-2 md:ml-4">
          <TileDisplay
            key={`${drawnTile.id}-lastDraw`}
            tile={drawnTile}
            onClick={() => onTileSelect && onTileSelect(drawnTile!)}
            isSelectable={canDiscard}
            isSelected={canDiscard && selectedTile?.id === drawnTile.id}
            className={canDiscard && selectedTile?.id === drawnTile.id ? 'transform -translate-y-2' : ''}
          />
        </div>
      )}
    </div>
  );
}
