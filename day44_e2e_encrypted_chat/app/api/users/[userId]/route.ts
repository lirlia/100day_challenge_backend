import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Database } from 'better-sqlite3'

const typedDb = db as Database

interface Params {
  userId: string
}

export async function PUT(request: NextRequest, context: { params: Params }) {
  try {
    const params = context.params;
    const userId = parseInt(params.userId, 10)

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 })
    }

    const body = await request.json()
    const { publicKey } = body

    if (!publicKey || typeof publicKey !== 'string') {
      return NextResponse.json({ error: 'Public key is required and must be a string' }, { status: 400 })
    }

    // 念のためユーザーが存在するか確認
    const existingUser = typedDb.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const stmt = typedDb.prepare('UPDATE users SET publicKey = ? WHERE id = ?')
    const result = stmt.run(publicKey, userId)

    if (result.changes > 0) {
      const updatedUserStmt = typedDb.prepare('SELECT id, username, publicKey, createdAt FROM users WHERE id = ?')
      const updatedUser = updatedUserStmt.get(userId)
      return NextResponse.json(updatedUser)
    } else {
      return NextResponse.json({ error: 'Failed to update public key' }, { status: 500 })
    }
  } catch (error) {
    console.error('Failed to update public key:', error)
    // JSON解析エラーの場合
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON format in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error while updating public key' }, { status: 500 })
  }
}
