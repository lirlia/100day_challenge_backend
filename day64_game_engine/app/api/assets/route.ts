import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// アセット一覧取得
export async function GET() {
  try {
    const assets = db.prepare(`
      SELECT id, name, type, file_path, file_size, created_at
      FROM assets
      ORDER BY created_at DESC
    `).all();

    return NextResponse.json(assets);
  } catch (error) {
    console.error('Error fetching assets:', error);
    return NextResponse.json(
      { error: 'アセットの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// アセットアップロード
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const type = formData.get('type') as string;

    if (!file || !name || !type) {
      return NextResponse.json(
        { error: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    // ファイルタイプ検証
    if (type === 'image' && !file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: '画像ファイルを選択してください' },
        { status: 400 }
      );
    }

    if (type === 'sound' && !file.type.startsWith('audio/')) {
      return NextResponse.json(
        { error: '音声ファイルを選択してください' },
        { status: 400 }
      );
    }

    // ファイルサイズ制限（10MB）
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'ファイルサイズは10MB以下にしてください' },
        { status: 400 }
      );
    }

    // アセットディレクトリを作成
    const assetsDir = join(process.cwd(), 'public', 'assets');
    if (!existsSync(assetsDir)) {
      await mkdir(assetsDir, { recursive: true });
    }

    // ファイル拡張子を取得
    const extension = file.name.split('.').pop() || '';
    const fileName = `${name}_${Date.now()}.${extension}`;
    const filePath = join(assetsDir, fileName);

    // ファイルを保存
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // データベースに記録
    const insertAsset = db.prepare(`
      INSERT INTO assets (name, type, file_path, file_size)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertAsset.run(name, type, fileName, file.size);

    return NextResponse.json({
      id: result.lastInsertRowid,
      name,
      type,
      file_path: fileName,
      file_size: file.size,
    });
  } catch (error) {
    console.error('Error uploading asset:', error);
    return NextResponse.json(
      { error: 'アップロードに失敗しました' },
      { status: 500 }
    );
  }
}

// アセット削除
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'アセットIDが必要です' },
        { status: 400 }
      );
    }

    // アセット情報を取得
    const asset = db.prepare(`
      SELECT file_path FROM assets WHERE id = ?
    `).get(id) as { file_path: string } | undefined;

    if (!asset) {
      return NextResponse.json(
        { error: 'アセットが見つかりません' },
        { status: 404 }
      );
    }

    // ファイルを削除
    const filePath = join(process.cwd(), 'public', 'assets', asset.file_path);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }

    // データベースから削除
    const deleteAsset = db.prepare(`
      DELETE FROM assets WHERE id = ?
    `);
    deleteAsset.run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json(
      { error: '削除に失敗しました' },
      { status: 500 }
    );
  }
}
