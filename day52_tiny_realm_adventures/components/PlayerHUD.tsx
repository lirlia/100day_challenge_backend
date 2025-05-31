'use client';

import React from 'react';
import type { PlayerClientData, ItemData } from '@/lib/types';

interface PlayerHUDProps {
  player: PlayerClientData | null;
  onUseItem: (itemId: number) => void;
  // TODO: 将来的には装備変更などのためのハンドラも追加
}

const PlayerHUD: React.FC<PlayerHUDProps> = ({ player, onUseItem }) => {
  if (!player) {
    return <div className="p-4 bg-gray-800 rounded-md shadow-lg text-white">プレイヤー情報を読み込み中...</div>;
  }

  const hpPercentage = player.maxHp > 0 ? (player.hp / player.maxHp) * 100 : 0;

  return (
    <div className="p-4 bg-gray-800 rounded-md shadow-lg text-white font-mono flex flex-col gap-4 h-full">
      <div>
        <h2 className="text-xl font-bold text-yellow-400 mb-1">{player.name}</h2>
        <p className="text-sm">ID: {player.id} | 位置: ({player.x}, {player.y})</p>
      </div>

      <div>
        <h3 className="text-lg mb-1">HP: {player.hp} / {player.maxHp}</h3>
        <div className="w-full bg-gray-600 rounded-full h-4 border border-gray-500 overflow-hidden">
          <div
            className="bg-red-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${hpPercentage}%` }}
            role="progressbar"
            aria-valuenow={player.hp}
            aria-valuemin={0}
            aria-valuemax={player.maxHp}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg mb-2">インベントリ:</h3>
        {player.inventory && player.inventory.length > 0 ? (
          <ul className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {player.inventory.map((item) => (
              <li key={item.id} className="p-2 bg-gray-700 rounded-md border border-gray-600 hover:bg-gray-600 transition-colors">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-yellow-300">{item.name}</span>
                    <span className="text-xs text-gray-400">(x{item.quantity})</span>
                    {item.description && <p className="text-xs text-gray-300 mt-0.5">{item.description}</p>}
                  </div>
                  {item.type === 'potion' && (
                     <button
                        onClick={() => onUseItem(item.id)}
                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold py-1 px-2 rounded transition-transform hover:scale-105"
                        title={`使う: ${item.name}`}
                      >
                        使う
                      </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">持ち物はありません。</p>
        )}
      </div>
      {/* TODO: 装備品スロットなどをここに追加 */}
    </div>
  );
};

export default PlayerHUD;
