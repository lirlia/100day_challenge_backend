import { NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Database } from 'better-sqlite3';

const typedDb = db as Database;

// 予約一覧取得
export async function GET() {
  try {
    const stmt = typedDb.prepare('SELECT * FROM reservations ORDER BY created_at DESC');
    const reservations = stmt.all();
    return NextResponse.json(reservations);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: (error as Error).message }, { status: 500 });
  }
}

// 予約新規作成
export async function POST(request: Request) {
  try {
    // TODO: バリデーション・Saga処理は後続で実装
    return NextResponse.json({ message: 'Not implemented' }, { status: 501 });
  } catch (error) {
    console.error('Error creating reservation:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: (error as Error).message }, { status: 500 });
  }
}