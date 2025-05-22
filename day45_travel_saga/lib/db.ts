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
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        service_type TEXT NOT NULL CHECK (service_type IN ('hotel', 'flight', 'car')),
        service_reservation_id TEXT, -- 各サービスの予約ID
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'FAILED')),
        details TEXT, -- JSON形式で詳細情報 (例: 部屋タイプ、便名、車種)
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS saga_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saga_id TEXT NOT NULL, -- どのSaga実行に属するか
        step_name TEXT NOT NULL, -- 例: 'hotel_booking', 'flight_compensation'
        status TEXT NOT NULL CHECK (status IN ('EXECUTING', 'SUCCESS', 'FAILED', 'COMPENSATING', 'COMPENSATED_SUCCESS', 'COMPENSATED_FAILED')),
        details TEXT, -- JSON形式で詳細情報 (例: エラーメッセージ、予約ID)
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS saga_requests (
        id TEXT PRIMARY KEY, -- saga_id と同じ値
        user_id TEXT,
        trip_details TEXT, -- 旅行の詳細 (JSON)
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'ERROR')), -- Saga全体の最終状態
        error_details TEXT, -- Saga失敗時のエラー情報 (JSON)
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
