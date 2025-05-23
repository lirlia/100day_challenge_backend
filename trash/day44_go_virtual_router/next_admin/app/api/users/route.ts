import db from '@/lib/db';
import type { Database } from 'better-sqlite3';
import { NextResponse } from 'next/server';

const typedDb = db as Database;

export async function GET() {
  try {
    const stmt = typedDb.prepare('SELECT id, name, created_at FROM users ORDER BY created_at DESC');
    const users = stmt.all();
    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = body.name;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: 'Name is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const stmt = typedDb.prepare(
      'INSERT INTO users (name) VALUES (?) RETURNING id, name, created_at'
    );
    const newUser = stmt.get(name.trim());

    if (!newUser) {
      throw new Error('Failed to create user or retrieve the created user data.');
    }

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: (error as Error).message },
      { status: 500 }
    );
  }
}
