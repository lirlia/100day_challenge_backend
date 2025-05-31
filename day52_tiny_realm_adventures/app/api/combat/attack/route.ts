import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface AttackRequestBody {
  playerId: number;
  monsterId: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AttackRequestBody;
    const { playerId, monsterId } = body;

    if (!playerId || !monsterId) {
      return NextResponse.json({ error: 'playerId and monsterId are required' }, { status: 400 });
    }

    const player = db.prepare('SELECT id, name, attackPower FROM players WHERE id = ?').get(playerId) as any;
    const monster = db.prepare('SELECT id, name, hp, maxHp, attackPower, dropsItemId FROM monsters WHERE id = ?').get(monsterId) as any;

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    if (!monster) {
      return NextResponse.json({ error: 'Monster not found' }, { status: 404 });
    }
    if (monster.hp <= 0) {
      return NextResponse.json({ message: `${monster.name} は既に倒されています。`, monster }, { status: 200 });
    }

    const damageDealt = player.attackPower;
    const newMonsterHp = Math.max(0, monster.hp - damageDealt);

    let message = `${player.name} は ${monster.name} に ${damageDealt} のダメージを与えた！`;
    let droppedItemInfo = null;

    db.prepare('UPDATE monsters SET hp = ? WHERE id = ?').run(newMonsterHp, monsterId);
    monster.hp = newMonsterHp;

    if (newMonsterHp <= 0) {
      message += ` ${monster.name} を倒した！`;
      const defeatedAt = new Date().toISOString();
      db.prepare('UPDATE monsters SET lastDefeatedAt = ? WHERE id = ?').run(defeatedAt, monsterId);

      // アイテムドロップ処理
      if (monster.dropsItemId) {
        const itemToDrop = db.prepare('SELECT id, name FROM items WHERE id = ?').get(monster.dropsItemId) as any;
        if (itemToDrop) {
          const existingInventoryItem = db.prepare(
            'SELECT quantity FROM player_inventory WHERE playerId = ? AND itemId = ?'
          ).get(playerId, itemToDrop.id) as { quantity: number } | undefined;

          if (existingInventoryItem) {
            db.prepare(
              'UPDATE player_inventory SET quantity = quantity + 1 WHERE playerId = ? AND itemId = ?'
            ).run(playerId, itemToDrop.id);
          } else {
            db.prepare(
              'INSERT INTO player_inventory (playerId, itemId, quantity) VALUES (?, ?, 1)'
            ).run(playerId, itemToDrop.id);
          }
          droppedItemInfo = { id: itemToDrop.id, name: itemToDrop.name, quantity: 1 };
          message += ` ${itemToDrop.name} を手に入れた！`;
        }
      }
    }

    // lastSeenを更新 (攻撃アクションも活動とみなす)
    const now = new Date().toISOString();
    db.prepare('UPDATE players SET lastSeen = ? WHERE id = ?').run(now, playerId);

    return NextResponse.json({
      message,
      player,
      monster, // 更新後のモンスター情報
      damageDealt,
      droppedItem: droppedItemInfo,
    });

  } catch (error) {
    console.error('Error in combat attack:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process attack' }, { status: 500 });
  }
}
