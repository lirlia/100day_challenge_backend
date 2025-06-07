import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'db', 'dev.db');

// データベース接続の作成（シングルトン）
const db = new Database(dbPath);

// 外部キー制約を有効化
db.exec('PRAGMA foreign_keys = ON');

// トランザクションの性能向上のため
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

/**
 * データベーススキーマを初期化
 * 検索エンジンに必要な全テーブルを作成
 */
export function initializeSchema() {
  try {
    console.log('🔧 Initializing search engine database schema...');

    // 文書テーブル: 検索対象の全文書を管理
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT,
        category TEXT,
        url TEXT,
        word_count INTEGER DEFAULT 0,
        pagerank_score REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 単語テーブル: 全文書に出現する単語の辞書
    db.exec(`
      CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT UNIQUE NOT NULL,
        document_frequency INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 転置インデックステーブル: 単語→文書のマッピング
    db.exec(`
      CREATE TABLE IF NOT EXISTS postings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER NOT NULL,
        document_id INTEGER NOT NULL,
        term_frequency INTEGER NOT NULL,
        positions TEXT, -- JSON配列: 単語の文書内位置
        tf_idf_score REAL DEFAULT 0.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(word_id, document_id)
      )
    `);

    // 文書間リンクテーブル: PageRank計算用
    db.exec(`
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_document_id INTEGER NOT NULL,
        to_document_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (to_document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE(from_document_id, to_document_id)
      )
    `);

    // 検索ログテーブル: 検索履歴・統計用
    db.exec(`
      CREATE TABLE IF NOT EXISTS search_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        results_count INTEGER DEFAULT 0,
        execution_time_ms INTEGER DEFAULT 0,
        clicked_document_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (clicked_document_id) REFERENCES documents(id) ON DELETE SET NULL
      )
    `);

    // パフォーマンス向上のためのインデックス作成
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_words_word ON words(word);
      CREATE INDEX IF NOT EXISTS idx_postings_word_id ON postings(word_id);
      CREATE INDEX IF NOT EXISTS idx_postings_document_id ON postings(document_id);
      CREATE INDEX IF NOT EXISTS idx_postings_tf_idf ON postings(tf_idf_score DESC);
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
      CREATE INDEX IF NOT EXISTS idx_documents_author ON documents(author);
      CREATE INDEX IF NOT EXISTS idx_documents_pagerank ON documents(pagerank_score DESC);
      CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_document_id);
      CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_document_id);
      CREATE INDEX IF NOT EXISTS idx_search_logs_query ON search_logs(query);
      CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at);
    `);

    // トリガー: 文書更新時のupdated_atタイムスタンプ自動更新
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_documents_timestamp
      AFTER UPDATE ON documents
      BEGIN
        UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);

    console.log('✅ Search engine database schema initialized successfully');

    // サンプルデータの自動インポートチェック
    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents').get() as {count: number};
    if (docCount.count === 0) {
      console.log('📦 No documents found. Auto-importing sample data...');
      importSampleDataSync();
    } else {
      console.log(`📊 Database contains ${docCount.count} documents`);
    }

  } catch (error) {
    console.error('❌ Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * 同期版サンプルデータインポート（初期化時専用）
 */
function importSampleDataSync(): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const categories = ['aozora', 'wikipedia', 'tech'];
    let totalDocuments = 0;

    // 文書挿入用のプリペアードステートメント
    const insertDoc = db.prepare(`
      INSERT INTO documents (title, content, author, category, url, word_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const category of categories) {
      const categoryDir = path.join(dataDir, category);

      if (!fs.existsSync(categoryDir)) {
        continue;
      }

      const files = fs.readdirSync(categoryDir)
        .filter((file: string) => file.endsWith('.txt'));

      for (const file of files) {
        const filePath = path.join(categoryDir, file);

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const lines = content.split('\n');

          let title = '';
          let author = '';
          let documentContent = '';
          let isMetadata = true;

          for (const line of lines) {
            if (isMetadata) {
              if (line.startsWith('タイトル:')) {
                title = line.replace('タイトル:', '').trim();
              } else if (line.startsWith('作者:')) {
                author = line.replace('作者:', '').trim();
              } else if (line.trim() === '') {
                isMetadata = false;
              }
            } else {
              documentContent += line + '\n';
            }
          }

          // 単語数を計算
          const wordCount = documentContent
            .replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uFF66-\uFF9Fa-zA-Z0-9]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0)
            .length;

          insertDoc.run(title, documentContent.trim(), author, category, file, wordCount);
          totalDocuments++;

        } catch (error) {
          console.error(`❌ Failed to import ${file}:`, error);
        }
      }
    }

    console.log(`✅ Auto-imported ${totalDocuments} documents`);

  } catch (error) {
    console.error('❌ Failed to auto-import sample data:', error);
  }
}

// データベース接続をエクスポート
export { db };

// アプリケーション起動時にスキーマを初期化
initializeSchema();
