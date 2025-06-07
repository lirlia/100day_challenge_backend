import fs from 'fs';
import path from 'path';
import { db } from './db';

interface DocumentData {
  title: string;
  content: string;
  author: string;
  category: string;
  url?: string;
}

/**
 * テキストファイルからドキュメントメタデータを解析
 */
function parseTextFile(filePath: string): DocumentData {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let title = '';
  let author = '';
  let category = '';
  let documentContent = '';

  let isMetadata = true;

  for (const line of lines) {
    if (isMetadata) {
      if (line.startsWith('タイトル:')) {
        title = line.replace('タイトル:', '').trim();
      } else if (line.startsWith('作者:')) {
        author = line.replace('作者:', '').trim();
      } else if (line.startsWith('カテゴリ:')) {
        category = line.replace('カテゴリ:', '').trim();
      } else if (line.trim() === '') {
        isMetadata = false;
      }
    } else {
      documentContent += line + '\n';
    }
  }

  return {
    title,
    content: documentContent.trim(),
    author,
    category,
    url: path.basename(filePath)
  };
}

/**
 * 全サンプルデータをデータベースにインポート
 */
export async function importSampleData(): Promise<void> {
  console.log('📚 Starting sample data import...');

  try {
    // 既存データを削除
    db.exec('DELETE FROM postings');
    db.exec('DELETE FROM words');
    db.exec('DELETE FROM links');
    db.exec('DELETE FROM documents');
    db.exec('DELETE FROM search_logs');

    console.log('🗑️  Cleared existing data');

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
        console.log(`⚠️  Directory not found: ${categoryDir}`);
        continue;
      }

      const files = fs.readdirSync(categoryDir)
        .filter(file => file.endsWith('.txt'));

      console.log(`📁 Processing ${category} directory: ${files.length} files`);

      for (const file of files) {
        const filePath = path.join(categoryDir, file);

        try {
          const docData = parseTextFile(filePath);

          // 単語数を計算
          const wordCount = docData.content
            .replace(/[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uFF66-\uFF9Fa-zA-Z0-9]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0)
            .length;

          // 文書をデータベースに挿入
          const result = insertDoc.run(
            docData.title,
            docData.content,
            docData.author,
            docData.category,
            docData.url,
            wordCount
          );

          console.log(`✅ Imported: ${docData.title} (ID: ${result.lastInsertRowid}, ${wordCount} words)`);
          totalDocuments++;

        } catch (error) {
          console.error(`❌ Failed to import ${file}:`, error);
        }
      }
    }

    // サンプルリンクデータを追加（PageRank計算用）
    console.log('🔗 Adding sample links...');
    const insertLink = db.prepare(`
      INSERT OR IGNORE INTO links (from_document_id, to_document_id)
      VALUES (?, ?)
    `);

    // 技術記事同士のリンク、文学作品同士のリンクなどを追加
    const docs = db.prepare('SELECT id, category FROM documents').all() as Array<{id: number, category: string}>;

    let linkCount = 0;
    for (const doc1 of docs) {
      for (const doc2 of docs) {
        if (doc1.id !== doc2.id) {
          // 同じカテゴリ内でのリンク（50%の確率）
          if (doc1.category === doc2.category && Math.random() < 0.5) {
            insertLink.run(doc1.id, doc2.id);
            linkCount++;
          }
          // 異なるカテゴリへのリンク（20%の確率）
          else if (doc1.category !== doc2.category && Math.random() < 0.2) {
            insertLink.run(doc1.id, doc2.id);
            linkCount++;
          }
        }
      }
    }

    console.log(`✅ Sample data import completed!`);
    console.log(`📊 Statistics:`);
    console.log(`   - Documents: ${totalDocuments}`);
    console.log(`   - Links: ${linkCount}`);

        // データベース統計を表示
    const stats = db.prepare(`
      SELECT
        category,
        COUNT(*) as count,
        AVG(word_count) as avg_words
      FROM documents
      GROUP BY category
    `).all() as Array<{category: string, count: number, avg_words: number}>;

    console.log(`📈 Document statistics by category:`);
    for (const stat of stats) {
      console.log(`   - ${stat.category}: ${stat.count} docs, avg ${Math.round(stat.avg_words)} words`);
    }

  } catch (error) {
    console.error('❌ Failed to import sample data:', error);
    throw error;
  }
}

/**
 * データベースの状態を確認
 */
export function checkDatabaseStatus(): void {
  try {
    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents').get() as {count: number};
    const wordCount = db.prepare('SELECT COUNT(*) as count FROM words').get() as {count: number};
    const postingCount = db.prepare('SELECT COUNT(*) as count FROM postings').get() as {count: number};
    const linkCount = db.prepare('SELECT COUNT(*) as count FROM links').get() as {count: number};

    console.log('📊 Database Status:');
    console.log(`   - Documents: ${docCount.count}`);
    console.log(`   - Words: ${wordCount.count}`);
    console.log(`   - Postings: ${postingCount.count}`);
    console.log(`   - Links: ${linkCount.count}`);

    if (docCount.count === 0) {
      console.log('💡 Tip: Run importSampleData() to populate the database');
    }

  } catch (error) {
    console.error('❌ Failed to check database status:', error);
  }
}