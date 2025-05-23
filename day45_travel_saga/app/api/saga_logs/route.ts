import db from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sagaId = searchParams.get('sagaId');
  if (!sagaId) {
    return NextResponse.json({ error: 'sagaId is required' }, { status: 400 });
  }
  try {
    const logs = db.prepare('SELECT * FROM saga_logs WHERE saga_id = ? ORDER BY created_at ASC').all(sagaId);
    return NextResponse.json({ logs });
  } catch (error: any) {
    console.error('[API] saga_logs fetch error', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
