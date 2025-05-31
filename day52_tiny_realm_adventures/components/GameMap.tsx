'use client';

import React from 'react';
import type { WorldData, PlayerClientData, NPCData, MonsterData, MapTileData, OtherPlayerData } from '@/lib/types';

interface GameMapProps {
  worldData: WorldData | null;
  player: PlayerClientData | null;
  onEntityClick: (type: 'npc' | 'monster', data: NPCData | MonsterData) => void;
}

const TILE_SIZE_PX = 32; // 1タイルのピクセルサイズ
const MAP_COLS = 10; // マップの列数 (db.tsの初期データに合わせる)

const getTileStyle = (tile: MapTileData) => {
  let bgColor = 'bg-green-600'; // grass
  let borderColor = 'border-green-700';
  let content = '';

  switch (tile.tile_type) {
    case 'wall': bgColor = 'bg-gray-700'; borderColor = 'border-gray-800'; content = '🧱'; break;
    case 'water': bgColor = 'bg-blue-500'; borderColor = 'border-blue-600'; content = '💧'; break;
    case 'tree': bgColor = 'bg-green-700'; borderColor = 'border-green-800'; content = '🌲'; break;
    case 'rock': bgColor = 'bg-gray-500'; borderColor = 'border-gray-600'; content = '⛰️'; break;
    default: content = ''; // grassは絵文字なし
  }
  if (tile.is_passable === 0 || tile.is_passable === false) {
     // 通行不可タイルは少し暗くするなどの表現も可能
  }
  return { bgColor, borderColor, content };
};

const GameMap: React.FC<GameMapProps> = ({ worldData, player, onEntityClick }) => {
  if (!worldData || !player) {
    return <div className="w-full h-96 bg-gray-800 rounded-md flex items-center justify-center text-white">マップデータを読み込み中...</div>;
  }

  // マップタイルをx,y座標でアクセスしやすいようにオブジェクトに変換
  const tileMap: { [key: string]: MapTileData } = {};
  worldData.mapTiles.forEach(tile => {
    tileMap[`${tile.x}-${tile.y}`] = tile;
  });

  // グリッドの各セルに何が表示されるかを決定するロジック
  const renderCellContent = (x: number, y: number) => {
    // 1. 現在のプレイヤー
    if (player.x === x && player.y === y) return <span title={player.name} role="img" aria-label="player">🧑</span>;
    // 2. 他のプレイヤー
    const otherPlayer = worldData.otherPlayers.find(p => p.x === x && p.y === y && p.id !== player.id);
    if (otherPlayer) return <span title={otherPlayer.name} role="img" aria-label="other player">🙂</span>;
    // 3. NPC
    const npc = worldData.npcs.find(n => n.x === x && n.y === y);
    if (npc) return <button onClick={() => onEntityClick('npc', npc)} className="hover:scale-125 transition-transform" title={npc.name}><span role="img" aria-label="npc">🧍</span></button>;
    // 4. モンスター
    const monster = worldData.monsters.find(m => m.x === x && m.y === y && m.hp > 0);
    if (monster) return <button onClick={() => onEntityClick('monster', monster)} className="hover:scale-125 transition-transform" title={`${monster.name} (HP:${monster.hp})`}><span role="img" aria-label="monster">👾</span></button>;
    // 5. タイル固有の絵文字 (壁など)
    const tile = tileMap[`${x}-${y}`];
    if (tile) {
        const { content: tileContent } = getTileStyle(tile);
        if (tileContent) return <span role="img" aria-label={tile.tile_type}>{tileContent}</span>;
    }
    return null; // 何もなければnull
  };

  return (
    <div
      className="grid border border-gray-700 bg-black shadow-xl overflow-hidden select-none"
      style={{
        gridTemplateColumns: `repeat(${MAP_COLS}, minmax(0, 1fr))`,
        width: MAP_COLS * TILE_SIZE_PX,
        height: MAP_COLS * TILE_SIZE_PX, // 仮に正方形マップとする
      }}
    >
      {Array.from({ length: MAP_COLS * MAP_COLS }).map((_, index) => {
        const x = index % MAP_COLS;
        const y = Math.floor(index / MAP_COLS);
        const tile = tileMap[`${x}-${y}`] || { x, y, tile_type: 'grass', is_passable: true }; // データがない場合はデフォルトの草タイル
        const { bgColor, borderColor } = getTileStyle(tile);

        return (
          <div
            key={`${x}-${y}`}
            className={`flex items-center justify-center text-xl border-r border-b ${bgColor} ${borderColor}`}
            style={{ width: TILE_SIZE_PX, height: TILE_SIZE_PX }}
            title={`(${x},${y}) - ${tile.tile_type}`}
          >
            {renderCellContent(x, y)}
          </div>
        );
      })}
    </div>
  );
};

export default GameMap;
