import { NextResponse } from 'next/server';
import db from '@/lib/db';
import type { Database } from 'better-sqlite3';

const typedDb = db as Database;

// 予約詳細取得
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const reservationId = params.id;
    if (!reservationId || Number.isNaN(Number(reservationId))) {
      return NextResponse.json({ error: 'Invalid reservation ID' }, { status: 400 });
    }

    const stmt = typedDb.prepare('SELECT * FROM reservations WHERE id = ?');
    const reservation = stmt.get(Number(reservationId));

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    const stepsStmt = typedDb.prepare('SELECT * FROM reservation_steps WHERE reservation_id = ? ORDER BY created_at ASC');
    const steps = stepsStmt.all(Number(reservationId));

    return NextResponse.json({ ...reservation, steps });
  } catch (error) {
    console.error('Error fetching reservation details:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: (error as Error).message }, { status: 500 });
  }
}

// 予約補償処理（キャンセル）
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    // TODO: バリデーション・Saga補償処理は後続で実装
    return NextResponse.json({ message: 'Not implemented' }, { status: 501 });
  } catch (error) {
    console.error('Error compensating reservation:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: (error as Error).message }, { status: 500 });
  }
}
