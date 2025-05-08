import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db'; // エイリアスが正しく設定されていれば動作
import { Snapshot } from '@/app/_lib/cow-simulator'; // cow-simulator.ts から型をインポート

// スナップショット一覧を取得
export async function GET(request: NextRequest) {
  try {
    const snapshotsFromDb = db.prepare('SELECT id, name, created_at, disk_state_json FROM snapshots ORDER BY created_at DESC').all();

    // disk_state_json は文字列なので、必要に応じてパースする（ここではそのまま返す）
    return NextResponse.json(snapshotsFromDb);
  } catch (error) {
    console.error('[API_SNAPSHOTS_GET] Error fetching snapshots:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
  }
}

interface CreateSnapshotPayload {
  name: string;
  diskStateJson: string; // クライアントからシリアライズされたディスク状態を受け取る
}

// 新しいスナップショットを作成して保存
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateSnapshotPayload;
    const { name, diskStateJson } = body;

    if (!name || !diskStateJson) {
      return NextResponse.json({ error: 'Missing name or diskStateJson' }, { status: 400 });
    }

    const stmt = db.prepare('INSERT INTO snapshots (name, disk_state_json) VALUES (?, ?)');
    const info = stmt.run(name, diskStateJson);

    return NextResponse.json({ id: info.lastInsertRowid, name, diskStateJson, createdAt: new Date().toISOString() }, { status: 201 });
  } catch (error) {
    console.error('[API_SNAPSHOTS_POST] Error creating snapshot:', error);
    if (error instanceof SyntaxError) { // JSONパースエラーの場合
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 });
  }
}
