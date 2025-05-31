import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface ChatMessagePostBody {
  playerId: number;
  message: string;
}

const MAX_CHAT_HISTORY = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json() as ChatMessagePostBody;
    const { playerId, message } = body;

    if (!playerId || !message || message.trim() === '') {
      return NextResponse.json({ error: 'playerId and message are required' }, { status: 400 });
    }

    const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId) as { id: number; name: string } | undefined;
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    const result = db.prepare(
      'INSERT INTO chat_messages (playerId, playerName, message) VALUES (?, ?, ?)'
    ).run(playerId, player.name, message.trim());

    // lastSeenを更新 (チャットも活動とみなす)
    const now = new Date().toISOString();
    db.prepare('UPDATE players SET lastSeen = ? WHERE id = ?').run(now, playerId);

    return NextResponse.json({ id: result.lastInsertRowid, playerId, playerName: player.name, message: message.trim(), timestamp: new Date().toISOString() }, { status: 201 });

  } catch (error) {
    console.error('Error posting chat message:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to post chat message' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const messages = db.prepare(
      'SELECT id, playerId, playerName, message, timestamp FROM chat_messages ORDER BY timestamp DESC LIMIT ?'
    ).all(MAX_CHAT_HISTORY).reverse(); // 取得後、昇順に戻す (表示のため)

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return NextResponse.json({ error: 'Failed to fetch chat messages' }, { status: 500 });
  }
}
