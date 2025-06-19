import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'db', 'dev.db');
const db = new Database(dbPath);

// WALモードを有効にして同時読み書きを改善
db.pragma('journal_mode = WAL');

function initializeSchema() {
  console.log('🔧 データベーススキーマを初期化中...');

  // ノード管理テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online', -- online, offline, partitioned
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // CRDT操作履歴テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS crdt_operations (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      crdt_type TEXT NOT NULL, -- g_counter, pn_counter, g_set, or_set, lww_register, rga, awormap
      crdt_id TEXT NOT NULL,
      operation_type TEXT NOT NULL, -- increment, decrement, add, remove, assign, insert, delete
      operation_data TEXT NOT NULL, -- JSON形式の操作データ
      vector_clock TEXT NOT NULL, -- JSON形式のベクタークロック
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      applied BOOLEAN DEFAULT false,
      FOREIGN KEY (node_id) REFERENCES nodes (id)
    )
  `);

  // CRDT状態スナップショットテーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS crdt_snapshots (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      crdt_type TEXT NOT NULL,
      crdt_id TEXT NOT NULL,
      state TEXT NOT NULL, -- JSON形式の現在の状態
      vector_clock TEXT NOT NULL, -- JSON形式のベクタークロック
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (node_id) REFERENCES nodes (id),
      UNIQUE(node_id, crdt_type, crdt_id)
    )
  `);

  // ネットワーク状態管理テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS network_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected', -- connected, disconnected, delayed
      delay_ms INTEGER DEFAULT 0,
      packet_loss_rate REAL DEFAULT 0.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_node) REFERENCES nodes (id),
      FOREIGN KEY (to_node) REFERENCES nodes (id),
      UNIQUE(from_node, to_node)
    )
  `);

  // デモデータ管理テーブル（各デモアプリの状態）
  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_data (
      id TEXT PRIMARY KEY,
      demo_type TEXT NOT NULL, -- counter, text_editor, todo, voting, settings
      demo_id TEXT NOT NULL,
      crdt_type TEXT NOT NULL,
      crdt_id TEXT NOT NULL,
      metadata TEXT, -- JSON形式のメタデータ（タイトル、説明など）
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(demo_type, demo_id)
    )
  `);

  // 初期ノードの作成
  const insertNode = db.prepare(`
    INSERT OR IGNORE INTO nodes (id, name) VALUES (?, ?)
  `);

  // デフォルトで3つのノードを作成
  insertNode.run('node-alpha', 'Node Alpha');
  insertNode.run('node-beta', 'Node Beta');
  insertNode.run('node-gamma', 'Node Gamma');

  // 初期ネットワーク状態（全ノード間が接続）
  const insertConnection = db.prepare(`
    INSERT OR IGNORE INTO network_state (from_node, to_node) VALUES (?, ?)
  `);

  const nodes = ['node-alpha', 'node-beta', 'node-gamma'];
  for (const fromNode of nodes) {
    for (const toNode of nodes) {
      if (fromNode !== toNode) {
        insertConnection.run(fromNode, toNode);
      }
    }
  }

  console.log('✅ データベース初期化完了');
}

// テーブルが存在しない場合に初期化
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'").get();
if (!tables) {
  initializeSchema();
}

export { db };
export default db;
