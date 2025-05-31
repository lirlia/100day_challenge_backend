import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface MoveRequestBody {
  direction: 'up' | 'down' | 'left' | 'right';
}

// マップサイズ (db.tsの初期データと合わせる)
const MAP_MAX_X = 9; // 0-9
const MAP_MAX_Y = 9; // 0-9

export async function POST(
  request: Request,
  { params }: { params: { playerId: string } }
) {
  const awaitedParams = await params; // params を await する
  console.log(`[Move API Pre-Try] Received request for playerId: ${awaitedParams?.playerId}`);
  try {
    console.log(`[Move API In-Try] Attempting to parse body for playerId: ${awaitedParams?.playerId}`);
    const body = await request.json() as MoveRequestBody;
    console.log(`[Move API Post-Body-Parse] Body parsed for playerId: ${awaitedParams?.playerId}, Body: ${JSON.stringify(body)}`);
    const { direction } = body;
    // ★★★ ここが awaitedParams.playerId になっていることを確認 ★★★
    const playerId = parseInt(awaitedParams.playerId, 10);

    if (isNaN(playerId)) {
      return NextResponse.json({ error: 'Invalid player ID' }, { status: 400 });
    }
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
    }

    const player = db.prepare('SELECT id, x, y FROM players WHERE id = ?').get(playerId) as { id: number; x: number; y: number } | undefined;

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    let newX = player.x;
    let newY = player.y;

    if (direction === 'up') newY -= 1;
    else if (direction === 'down') newY += 1;
    else if (direction === 'left') newX -= 1;
    else if (direction === 'right') newX += 1;

    // マップ境界チェック
    if (newX < 0 || newX > MAP_MAX_X || newY < 0 || newY > MAP_MAX_Y) {
      return NextResponse.json({ error: 'Cannot move outside map boundaries', player }, { status: 400 });
    }

    // 移動先のタイル情報を取得
    const targetTile = db.prepare('SELECT x, y, tile_type, is_passable FROM game_map_tiles WHERE x = ? AND y = ?').get(newX, newY) as { x:number, y:number, tile_type:string, is_passable:number } | undefined;

    console.log(`[Move API] PlayerId: ${playerId}, Current: (${player.x},${player.y}), Target: (${newX},${newY}), Tile: ${JSON.stringify(targetTile)}`);

    if (!targetTile || targetTile.is_passable === 0) { // is_passable は 0 or 1
      return NextResponse.json({ error: 'Cannot move into an obstacle', player, targetTileInfo: targetTile }, { status: 400 });
    }

    const now = new Date().toISOString();
    db.prepare('UPDATE players SET x = ?, y = ?, lastSeen = ? WHERE id = ?').run(newX, newY, now, playerId);

    const updatedPlayer = db.prepare('SELECT id, name, x, y, hp, maxHp, attackPower FROM players WHERE id = ?').get(playerId);

    return NextResponse.json(updatedPlayer);

  } catch (error) {
    console.error('Error in player move:', error);
    if (error instanceof SyntaxError) {
        console.error('[Move API] SyntaxError parsing request body:', error);
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to process player move' }, { status: 500 });
  }
}