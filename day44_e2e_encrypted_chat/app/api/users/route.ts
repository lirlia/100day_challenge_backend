import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Database } from 'better-sqlite3'

const typedDb = db as Database

export async function GET() {
  try {
    const stmt = typedDb.prepare('SELECT id, username, publicKey, createdAt FROM users ORDER BY createdAt DESC')
    const users = stmt.all()
    return NextResponse.json(users)
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { username, publicKey } = body

    if (!username || !publicKey) {
      return NextResponse.json({ error: 'Username and publicKey are required' }, { status: 400 })
    }

    const existingUser = typedDb.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existingUser) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }

    const stmt = typedDb.prepare('INSERT INTO users (username, publicKey) VALUES (?, ?)')
    const info = stmt.run(username, publicKey)

    return NextResponse.json({ id: info.lastInsertRowid, username, publicKey }, { status: 201 })
  } catch (error) {
    console.error('Failed to create user:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'Username already exists (DB constraint)' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
