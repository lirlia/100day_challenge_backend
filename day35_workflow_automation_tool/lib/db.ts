import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// DBファイルのパス (プロジェクトルートからの相対パス)
const dbPath = path.resolve('db', 'dev.db');
// DBファイルが存在するディレクトリ
const dbDir = path.dirname(dbPath);

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database.Database;

try {
    // データベースファイルに接続
    db = new Database(dbPath, { verbose: console.log });
    // WALモードを有効にする (推奨)
    db.pragma('journal_mode = WAL');
} catch (error) {
    console.error("データベース接続に失敗しました:", error);
    // エラーが発生した場合、dbオブジェクトは未定義の可能性があるため、
    // それ以降の処理を試みる前にプロセスを終了するなどの対策が必要
    process.exit(1);
}


// テーブルスキーマを初期化する関数
function initializeSchema() {
    console.log("Initializing database schema...");

    const schema = `
        -- ユーザーテーブル
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            email TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- ワークフローテーブル
        CREATE TABLE IF NOT EXISTS workflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- タスクテーブル
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL CHECK(status IN ('ToDo', 'InProgress', 'Done', 'Blocked')) DEFAULT 'ToDo',
            assigned_user_id INTEGER,
            due_date DATE, -- YYYY-MM-DD形式
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        -- タスク依存関係テーブル (先行タスク)
        -- task_id は depends_on_task_id が完了するまで開始できない
        CREATE TABLE IF NOT EXISTS task_dependencies (
            task_id INTEGER NOT NULL,
            depends_on_task_id INTEGER NOT NULL,
            PRIMARY KEY (task_id, depends_on_task_id),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
            CHECK (task_id != depends_on_task_id) -- 自己参照を防ぐ
        );

        -- インデックス (パフォーマンス向上のため)
        CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id ON tasks(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user_id ON tasks(assigned_user_id);
        CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);

        -- トリガー (updated_at を自動更新)
        CREATE TRIGGER IF NOT EXISTS update_workflows_updated_at
        AFTER UPDATE ON workflows
        FOR EACH ROW
        BEGIN
            UPDATE workflows SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS update_tasks_updated_at
        AFTER UPDATE ON tasks
        FOR EACH ROW
        BEGIN
            UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `;

    try {
        db.exec(schema);
        console.log("Database schema initialized or already exists.");

        // --- 初期データの挿入 ---
        const insertUserStmt = db.prepare('INSERT OR IGNORE INTO users (id, name, email) VALUES (?, ?, ?)');
        const insertWorkflowStmt = db.prepare('INSERT OR IGNORE INTO workflows (id, name, description, created_by_user_id) VALUES (?, ?, ?, ?)');
        const insertTaskStmt = db.prepare('INSERT OR IGNORE INTO tasks (id, workflow_id, name, description, status, assigned_user_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const insertDependencyStmt = db.prepare('INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id) VALUES (?, ?)');

        // トランザクションで実行
        db.transaction(() => {
            // 1. ユーザー作成
            const userId = 1;
            insertUserStmt.run(userId, 'サンプルユーザー', 'sample@example.com');

            // 2. ワークフロー作成
            const workflowId = 1;
            insertWorkflowStmt.run(workflowId, 'サンプル 新製品リリースプロセス', '新製品を市場に投入するための標準的なワークフロー', userId);

            // 3. タスク作成 (5件)
            const tasks = [
                { id: 1, name: '市場調査', description: '競合製品とターゲット顧客の分析', status: 'Done', assigned_user_id: userId, due_date: '2024-07-15' },
                { id: 2, name: '製品設計', description: '市場調査に基づき製品仕様を決定', status: 'InProgress', assigned_user_id: null, due_date: '2024-07-30' },
                { id: 3, name: 'プロトタイプ開発', description: '製品の初期バージョンを作成', status: 'ToDo', assigned_user_id: null, due_date: '2024-08-15' },
                { id: 4, name: 'マーケティング戦略立案', description: '価格設定、プロモーション計画', status: 'ToDo', assigned_user_id: userId, due_date: '2024-08-10' },
                { id: 5, name: 'リリース準備', description: '最終テストとドキュメント作成', status: 'ToDo', assigned_user_id: null, due_date: '2024-08-30' },
            ];
            tasks.forEach(task => {
                insertTaskStmt.run(task.id, workflowId, task.name, task.description, task.status, task.assigned_user_id, task.due_date);
            });

            // 4. 依存関係作成
            // タスク2 (製品設計) は タスク1 (市場調査) に依存
            insertDependencyStmt.run(2, 1);
            // タスク3 (プロトタイプ開発) は タスク2 (製品設計) に依存
            insertDependencyStmt.run(3, 2);
            // タスク5 (リリース準備) は タスク3 (プロトタイプ開発) と タスク4 (マーケティング戦略) に依存
            insertDependencyStmt.run(5, 3);
            insertDependencyStmt.run(5, 4);

        })();

        console.log("Initial data inserted or already exists.");

    } catch (error) {
        console.error("スキーマの初期化または初期データ挿入に失敗しました:", error);
    }
}

// アプリケーション起動時にスキーマをチェック・初期化
initializeSchema();

// データベースインスタンスをエクスポート
export default db;

// 必要に応じて追加のDB操作関数をここに定義
// 例:
// export function getUserById(id: number) {
//     const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
//     return stmt.get(id);
// }

// --- Graceful Shutdown ---
// SIGINT (Ctrl+C) と SIGTERM シグナルを捕捉
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
    console.log('シャットダウンシグナル受信。データベース接続を閉じています...');
    if (db && db.open) {
        try {
            db.close();
            console.log('データベース接続が正常に閉じられました。');
            process.exit(0);
        } catch (err: any) {
            console.error('データベース接続クローズ中にエラーが発生:', err.message);
            process.exit(1);
        }
    } else {
        console.log('データベース接続は既に閉じられているか、初期化されていません。');
        process.exit(0);
    }
}
