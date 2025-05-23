import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Database } from 'better-sqlite3'

const typedDb = db as Database

export async function GET(request: NextRequest) {
  try {
    const stmt = typedDb.prepare('SELECT id, username, publicKey, createdAt FROM users')
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
    const { username } = body

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const existingUser = typedDb.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existingUser) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }

    const stmt = typedDb.prepare('INSERT INTO users (username) VALUES (?)')
    const result = stmt.run(username)

    if (result.changes > 0) {
      const newUserId = result.lastInsertRowid
      const newUserStmt = typedDb.prepare('SELECT id, username, createdAt FROM users WHERE id = ?')
      const newUser = newUserStmt.get(newUserId)
      return NextResponse.json(newUser, { status: 201 })
    } else {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Failed to create user:', error)
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
