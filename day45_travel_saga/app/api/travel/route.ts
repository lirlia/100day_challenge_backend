import { NextResponse } from 'next/server';
import { handleSagaRequest } from '@/app/_lib/saga';
import db from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, tripDetails, forcedStepResults } = body;

    if (!userId || !tripDetails) {
      return NextResponse.json({ error: 'Missing userId or tripDetails' }, { status: 400 });
    }

    console.log(`[Travel API] Received travel request for userId: ${userId}`, tripDetails, "Forced results:", forcedStepResults);

    // Saga の実行IDを生成 (ここではシンプルにタイムスタンプを使用)
    const sagaId = `saga-${Date.now()}`;

    // SagaリクエストをDBに記録 (オプションだが、トレーサビリティ向上のため推奨)
    db.prepare(
      'INSERT INTO saga_requests (id, user_id, trip_details, status, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(sagaId, userId, JSON.stringify(tripDetails), 'PENDING');

    // handleSagaRequest に forcedStepResults を渡す
    const result = await handleSagaRequest(sagaId, userId, tripDetails, forcedStepResults);

    if (result.success) {
      console.log(`[Travel API] Saga successful for userId: ${userId}, sagaId: ${sagaId}`);
      db.prepare('UPDATE saga_requests SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run('SUCCESS', sagaId);
      return NextResponse.json({ message: 'Travel booked successfully', details: result.details, sagaId });
    }
    console.error(`[Travel API] Saga failed for userId: ${userId}, sagaId: ${sagaId}`, result.error);
    db.prepare('UPDATE saga_requests SET status = ?, error_details = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run('FAILED', JSON.stringify(result.error), sagaId);
    return NextResponse.json({ error: 'Travel booking failed', details: result.error, sagaId }, { status: 500 });
  } catch (error) {
    console.error('[Travel API] Error processing travel request:', error);
    // 予期せぬエラーの場合も sagaId を発行して記録しておくと追跡しやすい
    const sagaId = `saga-error-${Date.now()}`;
     db.prepare(
      'INSERT INTO saga_requests (id, status, error_details, created_at, updated_at) VALUES (?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
    ).run(sagaId, 'ERROR', JSON.stringify(error instanceof Error ? error.message : String(error)));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
