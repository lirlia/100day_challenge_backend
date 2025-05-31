import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(
  request: Request, // requestは未使用だが、Next.jsの規約上必要
  { params }: { params: { playerId: string } }
) {
  try {
    const awaitedParams = await params;
    const playerId = parseInt(awaitedParams.playerId, 10);

    if (isNaN(playerId)) {
      return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
    }

    const player = db.prepare(
      'SELECT id, name, x, y, hp, maxHp, attackPower, lastSeen FROM players WHERE id = ?'
    ).get(playerId) as any;

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // プレイヤーのインベントリを取得
    const inventory = db.prepare(`
      SELECT i.id, i.name, i.type, i.effectValue, i.description, pi.quantity
      FROM player_inventory pi
      JOIN items i ON pi.itemId = i.id
      WHERE pi.playerId = ?
    `).all(playerId) as any[];

    // lastSeenを更新
    const now = new Date().toISOString();
    db.prepare('UPDATE players SET lastSeen = ? WHERE id = ?').run(now, playerId);
    player.lastSeen = now; // 返却する情報も更新


    return NextResponse.json({
      ...player,
      inventory,
    });

  } catch (error) {
    const awaitedParams = await params;
    console.error(`Error fetching player data for ID ${awaitedParams?.playerId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch player data' }, { status: 500 });
  }
}
