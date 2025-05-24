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
  // WALモードを有効化 (推奨)
  db.pragma('journal_mode = WAL');
  // Node.jsプロセス終了時にDB接続を閉じる
  process.on('exit', () => {
    if (db && db.open) {
      db.close();
    }
  });
} catch (error) {
  console.error('Failed to connect to the database:', error);
  process.exit(1); // 接続失敗時はプロセス終了
}

// 初期スキーマ作成関数
const initializeSchema = () => {
  try {
    // Traditional Certificates
    db.exec(`
      CREATE TABLE IF NOT EXISTS TraditionalCertificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        commonName TEXT NOT NULL,
        organizationName TEXT,
        countryCode TEXT,
        publicKeyPem TEXT NOT NULL,
        certificatePem TEXT NOT NULL,
        serialNumber TEXT NOT NULL UNIQUE,
        issuedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        expiresAt DATETIME NOT NULL,
        status TEXT DEFAULT 'valid' CHECK(status IN ('valid', 'revoked')),
        issuedBy TEXT NOT NULL
      );
    `);

    // ACME Accounts
    db.exec(`
      CREATE TABLE IF NOT EXISTS AcmeAccounts (
        id TEXT PRIMARY KEY,
        publicKeyJwk TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ACME Orders
    db.exec(`
      CREATE TABLE IF NOT EXISTS AcmeOrders (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        domain TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'ready', 'processing', 'valid', 'invalid')),
        expires DATETIME NOT NULL,
        certificateId TEXT UNIQUE,
        finalizeUrl TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (accountId) REFERENCES AcmeAccounts(id),
        FOREIGN KEY (certificateId) REFERENCES AcmeCertificates(id)
      );
    `);

    // ACME Authorizations
    db.exec(`
      CREATE TABLE IF NOT EXISTS AcmeAuthorizations (
        id TEXT PRIMARY KEY,
        orderId TEXT NOT NULL,
        domain TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'valid', 'invalid')),
        expires DATETIME NOT NULL,
        FOREIGN KEY (orderId) REFERENCES AcmeOrders(id)
      );
    `);

    // ACME Challenges
    db.exec(`
      CREATE TABLE IF NOT EXISTS AcmeChallenges (
        id TEXT PRIMARY KEY,
        authorizationId TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('http-01', 'dns-01')),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'valid', 'invalid')),
        token TEXT NOT NULL,
        validatedAt DATETIME,
        FOREIGN KEY (authorizationId) REFERENCES AcmeAuthorizations(id)
      );
    `);

    // ACME Certificates
    db.exec(`
      CREATE TABLE IF NOT EXISTS AcmeCertificates (
        id TEXT PRIMARY KEY,
        orderId TEXT NOT NULL UNIQUE,
        csrPem TEXT NOT NULL,
        certificatePem TEXT NOT NULL,
        serialNumber TEXT NOT NULL UNIQUE,
        issuedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        expiresAt DATETIME NOT NULL,
        status TEXT DEFAULT 'valid' CHECK(status IN ('valid', 'revoked')),
        FOREIGN KEY (orderId) REFERENCES AcmeOrders(id)
      );
    `);

    console.log('Database schema initialized successfully.');

  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }
};

// データベースの初期化を実行
// 開発中はホットリロードで何度も実行されるのを防ぐため、
// DBファイルが存在しない場合のみ初期化するなどの工夫も考えられるが、
// ここではシンプルに毎回呼び出す。
// CREATE TABLE IF NOT EXISTS を使っているので問題は起きにくい。
if (db.open) { // ensure db is open before initializing
    initializeSchema();
}

export default db;
