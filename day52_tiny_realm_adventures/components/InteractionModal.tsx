'use client';

import React from 'react';
import type { InteractionContent, NPCData, MonsterData } from '@/lib/types';

interface InteractionModalProps {
  content: InteractionContent;
  onClose: () => void;
  onAttack?: (monsterId: number) => Promise<void>;
  // onUseItem?: (itemId: number) => void; // 将来的にアイテム使用の選択肢など
}

const InteractionModal: React.FC<InteractionModalProps> = ({ content, onClose, onAttack }) => {
  if (!content) return null;

  const [isAttacking, setIsAttacking] = React.useState(false);

  const handleAttackClick = async (monster: MonsterData) => {
    if (!onAttack || isAttacking) return;
    setIsAttacking(true);
    try {
      await onAttack(monster.id);
      // 攻撃成功後、自動でモーダルを閉じるか、あるいは戦闘結果をモーダル内で更新するかは要件による
      // onClose(); // ここでは攻撃後にモーダルを閉じる
    } catch (error) {
      console.error('Attack failed from modal:', error);
      alert(`攻撃に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
    setIsAttacking(false);
    onClose(); // エラーでも閉じる（UI次第）
  };

  const renderContent = () => {
    switch (content.type) {
      case 'npc':
        const npc = content.data as NPCData;
        return (
          <>
            <h3 className="text-xl font-bold text-yellow-300 mb-3">{npc.name}</h3>
            <p className="text-gray-200 whitespace-pre-wrap">{npc.message}</p>
          </>
        );
      case 'monster':
        const monster = content.data as MonsterData;
        return (
          <>
            <h3 className="text-xl font-bold text-red-400 mb-2">{monster.name}</h3>
            <p className="text-gray-300 mb-1">HP: {monster.hp} / {monster.maxHp}</p>
            {/* モンスターの詳細情報や画像などもここに追加可能 */}
            {monster.hp > 0 && onAttack && (
              <button
                onClick={() => handleAttackClick(monster)}
                disabled={isAttacking}
                className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition-colors disabled:opacity-70 disabled:cursor-wait"
              >
                {isAttacking ? '攻撃中...' : '攻撃する'}
              </button>
            )}
            {monster.hp <= 0 && <p className='text-green-400 mt-2'>{monster.name} は倒されている。</p>}
          </>
        );
      case 'message':
        return (
          <>
            <h3 className="text-xl font-bold text-blue-300 mb-3">{content.title}</h3>
            {content.text.map((line, index) => (
                <p key={index} className="text-gray-200 whitespace-pre-wrap">{line}</p>
            ))}
          </>
        );
      default:
        return <p>不明なインタラクションです。</p>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50 font-mono backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-800 p-6 rounded-lg shadow-2xl max-w-sm w-full border border-gray-700 transform transition-all duration-150 ease-out scale-100"
        onClick={(e) => e.stopPropagation()} // モーダル内部のクリックで閉じないようにする
      >
        {renderContent()}
        <button
          onClick={onClose}
          className="mt-6 w-full bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded transition-colors"
        >
          閉じる
        </button>
      </div>
    </div>
  );
};

export default InteractionModal;
