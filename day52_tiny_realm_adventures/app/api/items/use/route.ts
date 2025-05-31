import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface UseItemRequestBody {
  playerId: number;
  itemId: number;
  // quantity?: number; // 将来的に複数個同時使用を考慮する場合
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as UseItemRequestBody;
    const { playerId, itemId } = body;

    if (!playerId || !itemId) {
      return NextResponse.json({ error: 'playerId and itemId are required' }, { status: 400 });
    }

    const player = db.prepare('SELECT id, name, hp, maxHp FROM players WHERE id = ?').get(playerId) as any;
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const inventoryItem = db.prepare(
      'SELECT pi.quantity, i.id as itemId, i.name as itemName, i.type, i.effectValue, i.description FROM player_inventory pi JOIN items i ON pi.itemId = i.id WHERE pi.playerId = ? AND pi.itemId = ?'
    ).get(playerId, itemId) as any;

    if (!inventoryItem || inventoryItem.quantity <= 0) {
      return NextResponse.json({ error: 'Item not found in inventory or quantity is zero' }, { status: 404 });
    }

    let message = `${player.name} は ${inventoryItem.itemName} を使った。`;
    let playerHpChanged = false;

    // アイテム効果処理 (現在はポーションのみ)
    if (inventoryItem.type === 'potion') {
      const healAmount = inventoryItem.effectValue || 0;
      const newHp = Math.min(player.maxHp, player.hp + healAmount);
      if (newHp > player.hp) {
        db.prepare('UPDATE players SET hp = ? WHERE id = ?').run(newHp, playerId);
        player.hp = newHp;
        message += ` HPが ${healAmount} 回復した。（現在のHP: ${newHp}）`;
        playerHpChanged = true;
      } else {
        message += ' しかし、効果はなかった。' // すでにHP最大など
      }
    } else {
      message += ' しかし、このアイテムはまだ使えないようだ。'
    }

    // インベントリ更新
    if (inventoryItem.quantity > 1) {
      db.prepare('UPDATE player_inventory SET quantity = quantity - 1 WHERE playerId = ? AND itemId = ?').run(playerId, itemId);
    } else {
      db.prepare('DELETE FROM player_inventory WHERE playerId = ? AND itemId = ?').run(playerId, itemId);
    }

    // lastSeenを更新
    const now = new Date().toISOString();
    db.prepare('UPDATE players SET lastSeen = ? WHERE id = ?').run(now, playerId);

    return NextResponse.json({
      message,
      player, // 更新後のプレイヤー情報
      itemUsed: {
        id: inventoryItem.itemId,
        name: inventoryItem.itemName,
      },
      playerHpChanged,
    });

  } catch (error) {
    console.error('Error in item use:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process item use' }, { status: 500 });
  }
}
