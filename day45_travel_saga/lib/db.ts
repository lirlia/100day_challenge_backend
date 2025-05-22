import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

// DBファイルへのパスを解決
const dbPath = path.resolve('db');
const dbFile = path.join(dbPath, 'dev.db');

// DBディレクトリが存在しない場合は作成
if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

let db: Database.Database;
try {
  db = new Database(dbFile);
  // Node.jsプロセス終了時にDB接続を閉じる
  process.on('exit', () => db.close());
} catch (error) {
  console.error('Failed to connect to the database:', error);
  process.exit(1); // 接続失敗時はプロセス終了
}

// 初期スキーマ作成関数
const initializeSchema = () => {
  try {
    // ここにアプリケーションに必要なテーブル作成クエリを記述
    // 例:
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        people INTEGER NOT NULL,
        status TEXT NOT NULL, -- pending, success, failure, compensating, compensated
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS reservation_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id INTEGER NOT NULL,
        service_type TEXT NOT NULL, -- hotel, flight, car
        status TEXT NOT NULL, -- pending, success, failure, compensating, compensated
        external_reservation_id TEXT, -- 外部サービスの予約番号（あれば）
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reservation_id) REFERENCES reservations(id)
      );
    `);

    console.log('Database schema initialized successfully.');

  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }
};

// データベースの初期化を実行
initializeSchema();

export default db;
