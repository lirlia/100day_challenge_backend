import { NextResponse } from 'next/server';
import db from '@/lib/db';

// 他プレイヤーとみなす最終閲覧からの経過時間（ミリ秒）
const PLAYER_ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // 5分

export async function GET() {
  try {
    // 1. マップタイルの取得
    const mapTiles = db.prepare('SELECT x, y, tile_type, is_passable FROM game_map_tiles').all();

    // 2. NPCの取得
    const npcs = db.prepare('SELECT id, name, x, y, message FROM npcs').all();

    // 3. モンスターの取得 (リスポーン考慮)
    const monstersRaw = db.prepare(`
      SELECT id, name, x, y, hp, maxHp, attackPower, dropsItemId, lastDefeatedAt, respawnTimeSeconds
      FROM monsters
    `).all() as any[];

    const now = new Date().getTime();
    const nowInSeconds = Math.floor(now / 1000);
    const monsters = monstersRaw.filter(monster => {
      if (!monster.lastDefeatedAt) return true; // まだ倒されていない
      const lastDefeatedTimestamp = Math.floor(new Date(monster.lastDefeatedAt).getTime() / 1000);
      return (nowInSeconds - lastDefeatedTimestamp) >= monster.respawnTimeSeconds;
    }).map(({ lastDefeatedAt, respawnTimeSeconds, ...rest }) => rest); // 表示に不要な情報は削る

    // 4. 他のプレイヤーの取得 (アクティブなプレイヤーのみ)
    const activeThresholdTime = new Date(now - PLAYER_ACTIVE_THRESHOLD_MS).toISOString();
    const otherPlayers = db.prepare(`
      SELECT id, name, x, y, hp, maxHp
      FROM players
      WHERE lastSeen >= ?
    `).all(activeThresholdTime);

    return NextResponse.json({
      mapTiles,
      npcs,
      monsters,
      otherPlayers,
    });
  } catch (error) {
    console.error('Error fetching world data:', error);
    return NextResponse.json({ error: 'Failed to fetch world data' }, { status: 500 });
  }
}
