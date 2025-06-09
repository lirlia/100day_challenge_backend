import Database from 'better-sqlite3';
import { join } from 'path';
import fs from 'node:fs';

const dbPath = join(process.cwd(), 'db', 'dev.db');
const db = new Database(dbPath);

// DBディレクトリが存在しない場合は作成
const dbDir = join(process.cwd(), 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Node.jsプロセス終了時にDB接続を閉じる
process.on('exit', () => db.close());

// データベーススキーマを初期化
function initializeSchema() {
  console.log('Initializing database schema...');

  // アセットテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL, -- 'image' or 'sound'
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // レベルテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      width INTEGER NOT NULL DEFAULT 1200,
      height INTEGER NOT NULL DEFAULT 600,
      data TEXT NOT NULL, -- JSON形式のレベルデータ
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ゲーム設定テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // デフォルト設定を挿入
  const defaultSettings = [
    { key: 'player_speed', value: '200', description: 'プレイヤーの移動速度' },
    { key: 'player_jump_power', value: '400', description: 'プレイヤーのジャンプ力' },
    { key: 'gravity', value: '800', description: '重力の強さ' },
    { key: 'enemy_speed', value: '100', description: '敵の移動速度' },
    { key: 'coin_value', value: '10', description: 'コインの得点' },
    { key: 'goal_value', value: '100', description: 'ゴールの得点' },
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO game_settings (key, value, description)
    VALUES (?, ?, ?)
  `);

  for (const setting of defaultSettings) {
    insertSetting.run(setting.key, setting.value, setting.description);
  }

  // デフォルトレベルを作成
  const defaultLevel = {
    name: 'Level 1',
    width: 1200,
    height: 600,
    data: JSON.stringify({
      platforms: [
        { x: 300, y: 450, width: 128, height: 32 },
        { x: 500, y: 350, width: 128, height: 32 },
        { x: 700, y: 250, width: 128, height: 32 },
        { x: 900, y: 400, width: 128, height: 32 },
      ],
      enemies: [
        { x: 400, y: 400, patrolDistance: 100 },
        { x: 600, y: 300, patrolDistance: 100 },
        { x: 800, y: 200, patrolDistance: 100 },
      ],
      coins: [
        { x: 350, y: 420 },
        { x: 550, y: 320 },
        { x: 750, y: 220 },
        { x: 950, y: 370 },
        { x: 200, y: 500 },
      ],
      goal: { x: 1100, y: 500 },
      playerStart: { x: 100, y: 400 },
    }),
  };

  const insertLevel = db.prepare(`
    INSERT OR IGNORE INTO levels (name, width, height, data)
    VALUES (?, ?, ?, ?)
  `);

  insertLevel.run(defaultLevel.name, defaultLevel.width, defaultLevel.height, defaultLevel.data);

  console.log('Database schema initialized successfully');
}

// データベースを初期化
initializeSchema();

export default db;
