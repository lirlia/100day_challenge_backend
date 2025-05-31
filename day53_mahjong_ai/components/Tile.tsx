import { Tile as TileType } from "../lib/mahjong/tiles";

interface TileProps {
  tile: TileType | null; // nullの場合は裏向きの牌などを想定
  onClick?: (tile: TileType) => void;
  className?: string;
  isSelected?: boolean;
  isSelectable?: boolean;
}

// 牌の文字表現を調整する関数
const getTileDisplay = (tile: TileType): { top: string; bottom: string } => {
  if (tile.suit === "z") { // 字牌
    switch (tile.name) {
      case "東": return { top: "東", bottom: "" };
      case "南": return { top: "南", bottom: "" };
      case "西": return { top: "西", bottom: "" };
      case "北": return { top: "北", bottom: "" };
      case "白": return { top: "白", bottom: "" }; // 通常は「中」などだが、デザイン的にシンプルに
      case "發": return { top: "發", bottom: "" };
      case "中": return { top: "中", bottom: "" };
      default: return { top: tile.name, bottom: "" };
    }
  }
  // 数牌
  const valueStr = tile.value.toString();
  let suitChar = "";
  switch (tile.suit) {
    case "m": suitChar = "萬"; break;
    case "s": suitChar = "索"; break;
    case "p": suitChar = "筒"; break;
  }
  return { top: valueStr, bottom: suitChar };
};

export default function Tile({ tile, onClick, className, isSelected, isSelectable = true }: TileProps) {
  if (!tile) {
    // 裏向きの牌などの表示 (仮)
    return (
      <div
        className={`w-12 h-20 sm:w-14 sm:h-24 md:w-16 md:h-28 bg-green-700 border border-green-800 rounded-md clay-element flex items-center justify-center select-none ${className}`}
      >
        {/* 裏面の模様など */}
      </div>
    );
  }

  const display = getTileDisplay(tile);
  const tileColor = tile.suit === "z" && (tile.name === "發" || tile.name === "中")
                    ? (tile.name === "發" ? "text-green-600" : "text-red-600")
                    : "text-slate-800";

  return (
    <div
      className={`w-12 h-20 sm:w-14 sm:h-24 md:w-16 md:h-28 clay-element flex flex-col items-center justify-center p-1 select-none transition-all duration-150 ease-in-out
        ${isSelectable && onClick ? "cursor-pointer hover:scale-105 active:scale-95" : ""}
        ${isSelected ? "ring-2 ring-blue-500 scale-105 shadow-xl" : ""}
        ${className}`}
      onClick={() => onClick && isSelectable && onClick(tile)}
      role="button"
      tabIndex={onClick && isSelectable ? 0 : -1}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick && isSelectable) {
          onClick(tile);
        }
      }}
    >
      <div className={`text-xl sm:text-2xl md:text-3xl font-bold ${tileColor}`}>{display.top}</div>
      {display.bottom && <div className={`text-md sm:text-lg md:text-xl font-bold ${tileColor}`}>{display.bottom}</div>}
    </div>
  );
}
