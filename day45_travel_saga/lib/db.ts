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

const db = new Database(dbFile, { verbose: console.log });

// 初期スキーマ作成関数
const initializeSchema = () => {
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saga_requests'").get();

  if (!tableExists) {
    console.log('Initializing database schema...');

    // saga_requests テーブル作成
    db.exec(`
      CREATE TABLE saga_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        trip_details TEXT,
        status TEXT, -- PENDING, SUCCESS, FAILED, ERROR
        error_details TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    `);

    // saga_logs テーブル作成
    db.exec(`
      CREATE TABLE saga_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        saga_id TEXT,
        step_name TEXT,
        status TEXT, -- EXECUTING, SUCCESS, FAILED, COMPENSATING, COMPENSATED_SUCCESS, COMPENSATED_FAILED
        details TEXT,
        created_at TEXT,
        FOREIGN KEY (saga_id) REFERENCES saga_requests(id)
      );
    `);

    console.log('Database schema initialized with saga_requests and saga_logs tables.');
  } else {
    console.log('Database schema (saga_requests and saga_logs) already exists.');
  }
};

// データベースの初期化を実行
initializeSchema();

export default db;
