import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Database } from 'better-sqlite3'

const typedDb = db as Database

// Get all messages (group chat)
export async function GET(request: NextRequest) {
  try {
    const stmt = typedDb.prepare(
      `SELECT m.id, m.senderId, m.recipientId, m.encryptedMessage, m.signature, m.iv, m.createdAt, u.username as senderUsername
       FROM messages m
       JOIN users u ON m.senderId = u.id
       ORDER BY m.createdAt ASC`
    )
    const messages = stmt.all()
    return NextResponse.json(messages)
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

// Post a new message (to group chat)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { senderId, encryptedMessage, signature, iv } = body

    if (!senderId || !encryptedMessage || !signature || !iv) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // recipientId は NULL で保存
    const stmt = typedDb.prepare(
      'INSERT INTO messages (senderId, recipientId, encryptedMessage, signature, iv) VALUES (?, NULL, ?, ?, ?)'
    )
    const result = stmt.run(senderId, encryptedMessage, signature, iv)

    if (result.changes > 0) {
        const messageId = result.lastInsertRowid;
        const newMsgStmt = typedDb.prepare(
            `SELECT m.id, m.senderId, m.recipientId, m.encryptedMessage, m.signature, m.iv, m.createdAt, u.username as senderUsername
             FROM messages m
             JOIN users u ON m.senderId = u.id
             WHERE m.id = ?`
        );
        const newMessage = newMsgStmt.get(messageId);
      return NextResponse.json(newMessage, { status: 201 });
    } else {
      return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to create message:', error)
    return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })
  }
}
