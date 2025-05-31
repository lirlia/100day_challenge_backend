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
  console.log('[DB InitializeSchema] Function called. Checking if players table exists...'); // 元のログに戻す
  const tableCheckStmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='players';");
  const playersTableExists = tableCheckStmt.get();
  console.log('[DB InitializeSchema] playersTableExists evaluation result:', playersTableExists);

  if (!playersTableExists) { // ← この条件を再度有効化
    console.log('[DB] Players table not found (playersTableExists is falsey). Initializing schema and default data...'); // 元のログに戻す
    try {
      // 既存のテーブルがあれば削除 (開発用、参照整合性を考慮した順序で)
      db.exec(`DROP TABLE IF EXISTS player_inventory;`);
      db.exec(`DROP TABLE IF EXISTS chat_messages;`);
      db.exec(`DROP TABLE IF EXISTS monsters;`);
      db.exec(`DROP TABLE IF EXISTS npcs;`);
      db.exec(`DROP TABLE IF EXISTS items;`);
      db.exec(`DROP TABLE IF EXISTS players;`);
      db.exec(`DROP TABLE IF EXISTS game_map_tiles;`);

      // プレイヤーテーブル
      db.exec(`
        CREATE TABLE players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          x INTEGER NOT NULL DEFAULT 1,
          y INTEGER NOT NULL DEFAULT 1,
          hp INTEGER NOT NULL DEFAULT 100,
          maxHp INTEGER NOT NULL DEFAULT 100,
          attackPower INTEGER NOT NULL DEFAULT 10,
          lastSeen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // NPCテーブル
      db.exec(`
        CREATE TABLE npcs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          message TEXT NOT NULL
        );
      `);

      // アイテムテーブル
      db.exec(`
        CREATE TABLE items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('potion', 'weapon', 'armor')),
          effectValue INTEGER, -- ポーションなら回復量、武器なら攻撃力上昇など
          description TEXT
        );
      `);

      // モンスターテーブル
      db.exec(`
        CREATE TABLE monsters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          hp INTEGER NOT NULL DEFAULT 50,
          maxHp INTEGER NOT NULL DEFAULT 50,
          attackPower INTEGER NOT NULL DEFAULT 5,
          dropsItemId INTEGER, -- ドロップするアイテムのID
          respawnTimeSeconds INTEGER DEFAULT 60, -- リスポーン時間(秒)
          lastDefeatedAt TIMESTAMP, -- 最後に倒された時刻
          FOREIGN KEY (dropsItemId) REFERENCES items(id) ON DELETE SET NULL
        );
      `);

      // プレイヤーインベントリテーブル (中間テーブル)
      db.exec(`
        CREATE TABLE player_inventory (
          playerId INTEGER NOT NULL,
          itemId INTEGER NOT NULL,
          quantity INTEGER DEFAULT 1,
          PRIMARY KEY (playerId, itemId),
          FOREIGN KEY (playerId) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE
        );
      `);

      // チャットメッセージテーブル
      db.exec(`
        CREATE TABLE chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          playerId INTEGER NOT NULL,
          playerName TEXT NOT NULL, -- players.nameをJOINするより非正規化で持つ方が楽な場合も
          message TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (playerId) REFERENCES players(id) ON DELETE CASCADE
        );
      `);

      // ゲームマップタイルテーブル
      db.exec(`
        CREATE TABLE game_map_tiles (
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          tile_type TEXT NOT NULL DEFAULT 'grass' CHECK(tile_type IN ('grass', 'wall', 'water', 'tree', 'rock')),
          is_passable BOOLEAN NOT NULL DEFAULT TRUE,
          PRIMARY KEY (x, y)
        );
      `);

      // --- 初期データ挿入 ---
      // アイテムデータ
      const insertItemStmt = db.prepare(`INSERT INTO items (name, type, effectValue, description) VALUES (?, ?, ?, ?);`);
      insertItemStmt.run('回復ポーション', 'potion', 50, 'HPを50回復する。');
      const potionRow = db.prepare(`SELECT id FROM items WHERE name = '回復ポーション';`).get() as { id: number } | undefined;
      const potionId = potionRow ? potionRow.id : null;

      // NPCデータ
      const insertNpcStmt = db.prepare(`INSERT INTO npcs (name, x, y, message) VALUES (?, ?, ?, ?);`);
      insertNpcStmt.run('村人A', 3, 3, 'こんにちは、冒険者さん！');
      insertNpcStmt.run('長老', 8, 8, 'この先の森には気をつけるんじゃぞ。');

      // モンスターデータ
      const insertMonsterStmt = db.prepare(`INSERT INTO monsters (name, x, y, hp, maxHp, attackPower, dropsItemId) VALUES (?, ?, ?, ?, ?, ?, ?);`);
      insertMonsterStmt.run('スライム', 5, 5, 30, 30, 3, potionId);
      insertMonsterStmt.run('ゴブリン', 7, 2, 50, 50, 8, null); // ゴブリンは何もドロップしない例

      // マップデータ (10x10)
      const MAP_SIZE = 10;
      const insertMapTileStmt = db.prepare(`INSERT INTO game_map_tiles (x, y, tile_type, is_passable) VALUES (?, ?, ?, ?);`);
      for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
          let tileType = 'grass';
          let isPassable = true;
          if (x === 0 || x === MAP_SIZE - 1 || y === 0 || y === MAP_SIZE - 1) {
            tileType = 'wall';
            isPassable = false;
          } else if ((x === 2 && y > 1 && y < 5) || (x === 7 && y > 4 && y < 8)) {
            tileType = 'tree';
            isPassable = false;
          } else if (x === 5 && y === 7) {
            tileType = 'rock';
            isPassable = false;
          }
          insertMapTileStmt.run(x, y, tileType, isPassable ? 1 : 0);
        }
      }

      // デバッグログ: 挿入されたタイルの一部を確認
      // console.log('[DB DEBUG] Checking inserted map tiles around (2,1):');
      // const checkTilesStmt = db.prepare('SELECT x, y, tile_type, is_passable FROM game_map_tiles WHERE x >= 1 AND x <= 3 AND y >= 0 AND y <= 2 ORDER BY y, x');
      // const debugTiles = checkTilesStmt.all();
      // console.log(JSON.stringify(debugTiles, null, 2));

      console.log('[DB] MMORPG initial data inserted successfully.');
      console.log('[DB] Database schema (MMORPG) initialized successfully.');

    } catch (error) {
      console.error('[DB] Failed to initialize database schema:', error);
      process.exit(1); // 初期化失敗は致命的エラーとしてプロセス終了
    }
  } else { // ← このブロックも再度有効化
    console.log('[DB] Players table found (playersTableExists is truthy). Skipping initialization.'); // 元のログに戻す
  }
};

// データベースの初期化を実行
initializeSchema();

export default db;
