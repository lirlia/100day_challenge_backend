import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// global に _db プロパティの型を定義
declare global {
  // eslint-disable-next-line no-var
  var _db: Database.Database | undefined;
}

const DB_DIR = path.join(process.cwd(), 'db');
const DB_PATH = path.join(DB_DIR, 'dev.db');

// dbディレクトリが存在しない場合は作成
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export const db = new Database(DB_PATH, { verbose: console.log });
db.pragma('journal_mode = WAL'); // WALモードを有効にして同時書き込み性能を向上

// スキーマ初期化関数
export function initializeSchema() {
  const schemaExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

  if (!schemaExists) {
    console.log('Initializing database schema...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        publicKey TEXT, -- NULL許容に変更
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderId INTEGER NOT NULL,
        recipientId INTEGER NOT NULL, -- 1対1チャットのため NOT NULL に戻す
        encryptedSymmetricKey TEXT NOT NULL, -- 暗号化された共通鍵 (Base64エンコード)
        encryptedMessage TEXT NOT NULL, -- 暗号化されたメッセージ本文 (Base64エンコード)
        signature TEXT NOT NULL,        -- 送信者による署名 (Base64エンコード)
        iv TEXT NOT NULL,               -- 初期化ベクトル (AES-GCM用、Base64エンコード)
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (senderId) REFERENCES users(id),
        FOREIGN KEY (recipientId) REFERENCES users(id)
      );

      -- インデックス作成 (任意ですが、パフォーマンス向上のために検討)
      CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient ON messages (senderId, recipientId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_messages_recipient_sender ON messages (recipientId, senderId, createdAt);
    `);
    console.log('Database schema initialized.');

    // 固定ユーザーの初期登録処理は削除
  } else {
    console.log('Database schema already exists.');
  }
}

// 初回起動時（テーブルが存在しない場合など）にスキーマを初期化
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users';").get();
if (!tableCheck) {
  console.log('Users table not found, initializing schema...');
  initializeSchema();
} else {
  // usersテーブルは存在するが、publicKeyカラムがない場合(古いスキーマ)はALTER TABLEで追加
  // (より堅牢なマイグレーション処理が必要な場合は専用ライブラリを検討)
  try {
    const stmt = db.prepare("SELECT publicKey FROM users LIMIT 1");
    stmt.get();
  } catch (e) {
    console.warn('publicKey column not found in users table, attempting to add it.');
    try {
      db.exec('ALTER TABLE users ADD COLUMN publicKey TEXT;');
      console.log('publicKey column added to users table.');
    } catch (alterError) {
      console.error('Failed to add publicKey column:', alterError);
    }
  }
}

// アプリケーション起動時にスキーマを初期化
initializeSchema();

// 必要に応じて、DB接続を閉じる関数もエクスポートできます
// export function closeDb() {
//   db.close();
// }

// Next.jsのホットリロード時にDB接続が重複しないようにするための対策
// (本番環境では不要な場合が多いですが、開発時には役立つことがあります)
if (process.env.NODE_ENV !== 'production') {
  if (!global._db) {
    global._db = db;
  }
}
