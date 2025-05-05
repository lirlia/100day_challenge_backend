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
    // ワークフロー自動化ツール用のテーブルスキーマ
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_by_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL -- 作成者が削除されてもワークフローは残す
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        assigned_user_id INTEGER,
        due_date DATETIME,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'on_hold')),
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE, -- ワークフロー削除時にタスクも削除
        FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL -- 担当者が削除されてもタスクは残す (担当者未割り当てにする)
      );
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        task_id INTEGER NOT NULL,
        depends_on_task_id INTEGER NOT NULL,
        PRIMARY KEY (task_id, depends_on_task_id),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        CHECK (task_id != depends_on_task_id) -- 自己依存の禁止
      );
    `);

    // トリガー: workflows テーブルの updated_at を自動更新
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_workflows_updated_at
      AFTER UPDATE ON workflows
      FOR EACH ROW
      BEGIN
          UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // トリガー: tasks テーブルの updated_at を自動更新
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_tasks_updated_at
      AFTER UPDATE ON tasks
      FOR EACH ROW
      BEGIN
          UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // サンプルユーザーデータの挿入 (初回のみ)
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (userCount.count === 0) {
      const insertUser = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
      const insertUsers = db.transaction((users) => {
        for (const user of users) insertUser.run(user.name, user.email);
      });
      insertUsers([
        { name: 'Alice', email: 'alice@example.com' },
        { name: 'Bob', email: 'bob@example.com' },
        { name: 'Charlie', email: 'charlie@example.com' },
      ]);
      console.log('Sample users inserted.');
    }

    console.log('Database schema initialized successfully.');

  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }
};

// データベースの初期化を実行
initializeSchema();

export default db;
