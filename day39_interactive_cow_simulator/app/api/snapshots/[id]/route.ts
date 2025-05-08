import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

interface RouteParams {
  params: { id: string };
}

// 特定のスナップショットを取得
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const snapshot = db.prepare('SELECT id, name, created_at, disk_state_json FROM snapshots WHERE id = ?').get(id);

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error(`[API_SNAPSHOTS_ID_GET] Error fetching snapshot ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to fetch snapshot' }, { status: 500 });
  }
}

// 特定のスナップショットを削除
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const stmt = db.prepare('DELETE FROM snapshots WHERE id = ?');
    const info = stmt.run(id);

    if (info.changes === 0) {
      return NextResponse.json({ error: 'Snapshot not found or already deleted' }, { status: 404 });
    }

    return NextResponse.json({ message: `Snapshot ${id} deleted successfully` }, { status: 200 });
  } catch (error) {
    console.error(`[API_SNAPSHOTS_ID_DELETE] Error deleting snapshot ${params.id}:`, error);
    return NextResponse.json({ error: 'Failed to delete snapshot' }, { status: 500 });
  }
}
