import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const levels = db.prepare(`
      SELECT * FROM levels ORDER BY created_at DESC
    `).all();

    return NextResponse.json(levels);
  } catch (error) {
    console.error('Levels fetch error:', error);
    return NextResponse.json(
      { error: 'レベルの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, width, height, platforms, enemies, items, playerStart } = body;

    if (!name || !width || !height) {
      return NextResponse.json(
        { error: '必要なフィールドが不足しています' },
        { status: 400 }
      );
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO levels (
        name, width, height, data, created_at
      ) VALUES (?, ?, ?, ?, datetime('now'))
    `);

    const levelData = JSON.stringify({
      platforms,
      enemies,
      items,
      playerStart
    });

    const result = stmt.run(name, width, height, levelData);

    return NextResponse.json({
      success: true,
      id: result.lastInsertRowid
    });

  } catch (error) {
    console.error('Level save error:', error);
    return NextResponse.json(
      { error: 'レベルの保存に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'IDが指定されていません' },
        { status: 400 }
      );
    }

    const stmt = db.prepare('DELETE FROM levels WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'レベルが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Level delete error:', error);
    return NextResponse.json(
      { error: 'レベルの削除に失敗しました' },
      { status: 500 }
    );
  }
}
