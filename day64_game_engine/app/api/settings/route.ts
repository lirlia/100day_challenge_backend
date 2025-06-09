import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

// 設定一覧取得
export async function GET() {
  try {
    const settings = db.prepare(`
      SELECT id, key, value, description
      FROM game_settings
      ORDER BY id
    `).all();

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: '設定の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// 設定値更新
export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json();

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'キーと値が必要です' },
        { status: 400 }
      );
    }

    // 数値検証
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      return NextResponse.json(
        { error: '値は0以上の数値である必要があります' },
        { status: 400 }
      );
    }

    // 設定を更新
    const updateSetting = db.prepare(`
      UPDATE game_settings
      SET value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE key = ?
    `);

    const result = updateSetting.run(value, key);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: '設定が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating setting:', error);
    return NextResponse.json(
      { error: '設定の更新に失敗しました' },
      { status: 500 }
    );
  }
}

// デフォルト値にリセット
export async function POST() {
  try {
    // デフォルト設定
    const defaultSettings = [
      { key: 'player_speed', value: '200' },
      { key: 'player_jump_power', value: '400' },
      { key: 'gravity', value: '800' },
      { key: 'enemy_speed', value: '100' },
      { key: 'coin_value', value: '10' },
      { key: 'goal_value', value: '100' },
    ];

    // 全設定をデフォルト値にリセット
    const updateSetting = db.prepare(`
      UPDATE game_settings
      SET value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE key = ?
    `);

    for (const setting of defaultSettings) {
      updateSetting.run(setting.value, setting.key);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting settings:', error);
    return NextResponse.json(
      { error: '設定のリセットに失敗しました' },
      { status: 500 }
    );
  }
}
