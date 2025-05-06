import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const stmt = db.prepare('SELECT id, title, artist, bpm FROM songs ORDER BY createdAt DESC');
    const songs = stmt.all();
    return NextResponse.json(songs);
  } catch (error) {
    console.error('Failed to fetch songs:', error);
    return NextResponse.json({ error: 'Failed to fetch songs' }, { status: 500 });
  }
}
