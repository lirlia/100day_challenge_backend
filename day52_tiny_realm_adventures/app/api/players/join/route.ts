import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface JoinRequestBody {
  name: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as JoinRequestBody;
    const { name } = body;

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Player name is required' }, { status: 400 });
    }

    // 既存プレイヤーを探す
    let player = db.prepare('SELECT id, name, x, y, hp, maxHp, attackPower FROM players WHERE name = ?').get(name) as any;

    const now = new Date().toISOString();

    if (player) {
      // 既存プレイヤーの場合、lastSeenを更新
      db.prepare('UPDATE players SET lastSeen = ? WHERE id = ?').run(now, player.id);
    } else {
      // 新規プレイヤー作成
      const defaultHp = 100;
      const defaultAttack = 10;
      // TODO: マップの空き地など、安全な初期位置を設定するロジック。今回は固定。
      const initialX = 1;
      const initialY = 1;
      const result = db.prepare(
        'INSERT INTO players (name, x, y, hp, maxHp, attackPower, lastSeen) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(name, initialX, initialY, defaultHp, defaultHp, defaultAttack, now);

      player = {
        id: result.lastInsertRowid,
        name,
        x: initialX,
        y: initialY,
        hp: defaultHp,
        maxHp: defaultHp,
        attackPower: defaultAttack,
      };
    }

    return NextResponse.json(player);

  } catch (error) {
    console.error('Error in player join:', error);
    if (error instanceof SyntaxError) { // JSONパースエラー
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process player join' }, { status: 500 });
  }
}
