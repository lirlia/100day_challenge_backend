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
    // 既存のテーブルがあれば削除 (開発用)
    // 本番環境ではマイグレーションツールを使うべき
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

    // アイテムデータ
    db.exec(`INSERT INTO items (name, type, effectValue, description) VALUES ('回復ポーション', 'potion', 50, 'HPを50回復する。');`);
    const potionRow = db.prepare(`SELECT id FROM items WHERE name = '回復ポーション';`).get() as { id: number } | undefined;
    const potionId = potionRow ? potionRow.id : null;

    // NPCデータ
    db.exec(`INSERT INTO npcs (name, x, y, message) VALUES ('村人A', 3, 3, 'こんにちは、冒険者さん！');`);
    db.exec(`INSERT INTO npcs (name, x, y, message) VALUES ('長老', 8, 8, 'この先の森には気をつけるんじゃぞ。');`);

    // モンスターデータ
    const slimeDropsItemId = potionId !== null ? potionId : 'NULL'; // potionIdがnullならSQLのNULLを文字列で指定
    db.exec(`INSERT INTO monsters (name, x, y, hp, maxHp, attackPower, dropsItemId) VALUES ('スライム', 5, 5, 30, 30, 3, ${slimeDropsItemId});`);
    db.exec(`INSERT INTO monsters (name, x, y, hp, maxHp, attackPower) VALUES ('ゴブリン', 7, 2, 50, 50, 8);`);

    // マップデータ (10x10)
    const MAP_SIZE = 10;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        let tileType = 'grass';
        let isPassable = true;
        if (x === 0 || x === MAP_SIZE - 1 || y === 0 || y === MAP_SIZE - 1) {
          tileType = 'wall'; // 外周を壁に
          isPassable = false;
        } else if ((x === 2 && y > 1 && y < 5) || (x === 7 && y > 4 && y < 8)) {
          tileType = 'tree'; // いくつかの木
          isPassable = false;
        } else if (x === 5 && y === 7) {
          tileType = 'rock'; // 岩
          isPassable = false;
        }
        db.prepare(`INSERT INTO game_map_tiles (x, y, tile_type, is_passable) VALUES (?, ?, ?, ?)`).run(x, y, tileType, isPassable);
      }
    }

    console.log('MMORPG initial data inserted successfully.');
    console.log('Database schema (MMORPG) initialized successfully.');

  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }
};

// データベースの初期化を実行
initializeSchema();

export default db;
