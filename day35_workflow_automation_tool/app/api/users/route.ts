import { NextResponse } from 'next/server'
import db from '@/lib/db'
import type { Database } from 'better-sqlite3'

const typedDb = db as Database

/**
 * GET /api/users
 * Retrieves a list of all users.
 */
export async function GET() {
  console.log('[API][GET /api/users] Request received.')
  try {
    const users = typedDb.prepare('SELECT id, name, email, created_at FROM users ORDER BY id').all()
    console.log(`[DB][User] Fetched ${users.length} users.`)
    return NextResponse.json(users)
  } catch (error) {
    console.error('[Error][GET /api/users] Failed to fetch users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = body.name

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Name is required and must be a non-empty string' }, { status: 400 })
    }

    const stmt = typedDb.prepare('INSERT INTO users (name) VALUES (?) RETURNING id, name, created_at')
    const newUser = stmt.get(name.trim())

    if (!newUser) {
      throw new Error('Failed to create user or retrieve the created user data.')
    }

    return NextResponse.json(newUser, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Internal Server Error', details: (error as Error).message }, { status: 500 })
  }
}
