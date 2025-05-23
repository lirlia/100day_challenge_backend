import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Database } from 'better-sqlite3'

const typedDb = db as Database

// Get messages for a 1-on-1 chat
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId1 = searchParams.get('userId1');
  const userId2 = searchParams.get('userId2');

  if (!userId1 || !userId2) {
    return NextResponse.json({ error: 'Missing userId1 or userId2 parameters' }, { status: 400 });
  }

  try {
    const stmt = typedDb.prepare(
      `SELECT m.id, m.senderId, m.recipientId, m.encryptedSymmetricKey, m.encryptedMessage, m.signature, m.iv, m.createdAt, u.username as senderUsername
       FROM messages m
       JOIN users u ON m.senderId = u.id
       WHERE (m.senderId = ? AND m.recipientId = ?) OR (m.senderId = ? AND m.recipientId = ?)
       ORDER BY m.createdAt ASC`
    );
    const messages = stmt.all(userId1, userId2, userId2, userId1);
    return NextResponse.json(messages);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// Post a new message (1-on-1 chat)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { senderId, recipientId, encryptedSymmetricKey, encryptedMessage, signature, iv } = body;

    if (!senderId || !recipientId || !encryptedSymmetricKey || !encryptedMessage || !signature || !iv) {
      return NextResponse.json({ error: 'Missing required fields for 1-on-1 chat' }, { status: 400 });
    }

    const stmt = typedDb.prepare(
      'INSERT INTO messages (senderId, recipientId, encryptedSymmetricKey, encryptedMessage, signature, iv) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(senderId, recipientId, encryptedSymmetricKey, encryptedMessage, signature, iv);

    if (result.changes > 0) {
        const messageId = result.lastInsertRowid;
        const newMsgStmt = typedDb.prepare(
            `SELECT m.id, m.senderId, m.recipientId, m.encryptedSymmetricKey, m.encryptedMessage, m.signature, m.iv, m.createdAt, u.username as senderUsername
             FROM messages m
             JOIN users u ON m.senderId = u.id
             WHERE m.id = ?`
        );
        const newMessage = newMsgStmt.get(messageId);
      return NextResponse.json(newMessage, { status: 201 });
    } else {
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
    }
  } catch (error) {
    console.error('Failed to create message:', error);
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 });
  }
}
