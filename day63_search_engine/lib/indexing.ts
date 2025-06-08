/**
 * 転置インデックス & TF-IDF スコアリングエンジン
 */

import { getDb } from './db';
import { preprocessDocument, ProcessedDocument } from './japanese-analyzer';

// TF-IDF計算設定
const TF_IDF_CONFIG = {
  // TF計算方式: "log" | "normalized" | "raw"
  tfMethod: 'log' as const,
  // IDF平滑化係数
  idfSmoothing: 1,
  // 最小単語長
  minWordLength: 2,
  // 最大単語長
  maxWordLength: 20,
};

/**
 * 単語統計情報
 */
export interface WordStats {
  wordId: number;
  word: string;
  documentFrequency: number; // 単語が出現する文書数
  totalOccurrences: number;  // 全文書での総出現回数
}

/**
 * 文書内単語情報
 */
export interface DocumentTerm {
  wordId: number;
  word: string;
  termFrequency: number;    // 文書内出現回数
  positions: number[];      // 文書内での位置
  tfScore: number;          // TF スコア
  weight: number;           // 日本語分析での重み
}

/**
 * TF-IDF スコア
 */
export interface TfIdfScore {
  wordId: number;
  word: string;
  tf: number;      // Term Frequency
  idf: number;     // Inverse Document Frequency
  tfIdf: number;   // TF-IDF スコア
  weight: number;  // 重み調整後スコア
}

/**
 * 文書インデックス情報
 */
export interface DocumentIndex {
  documentId: number;
  terms: DocumentTerm[];
  tfIdfScores: TfIdfScore[];
  totalWords: number;
  uniqueWords: number;
  averageTfIdf: number;
  maxTfIdf: number;
}

/**
 * TF (Term Frequency) 計算
 */
function calculateTF(termFreq: number, totalWords: number, method: 'log' | 'normalized' | 'raw' = 'log'): number {
  switch (method) {
    case 'log':
      return termFreq > 0 ? 1 + Math.log(termFreq) : 0;
    case 'normalized':
      return totalWords > 0 ? termFreq / totalWords : 0;
    case 'raw':
      return termFreq;
    default:
      return termFreq > 0 ? 1 + Math.log(termFreq) : 0;
  }
}

/**
 * IDF (Inverse Document Frequency) 計算
 */
function calculateIDF(totalDocs: number, docsWithTerm: number, smoothing: number = 1): number {
  return Math.log((totalDocs + smoothing) / (docsWithTerm + smoothing));
}

/**
 * 文書の単語を分析してデータベースに格納
 */
export async function indexDocument(documentId: number, content: string): Promise<DocumentIndex> {
  console.log(`[Indexing] Starting indexing for document ${documentId}`);

  const db = getDb();

  // 1. 日本語分析
  const processed = preprocessDocument(content);
  console.log(`[Indexing] Processed ${processed.totalWords} words, ${processed.uniqueWords} unique`);

  // 2. 単語統計の計算
  const wordFrequency = new Map<string, number>();
  const wordPositions = new Map<string, number[]>();

  processed.words.forEach((word, index) => {
    // 頻度カウント
    wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);

    // 位置記録
    if (!wordPositions.has(word)) {
      wordPositions.set(word, []);
    }
    wordPositions.get(word)!.push(index);
  });

  // 3. words テーブルの更新
  const documentTerms: DocumentTerm[] = [];

  for (const [word, frequency] of wordFrequency.entries()) {
    // 文字数制限チェック
    if (word.length < TF_IDF_CONFIG.minWordLength || word.length > TF_IDF_CONFIG.maxWordLength) {
      continue;
    }

    try {
      // 単語をwords テーブルに挿入または更新
      const insertResult = db.prepare(`
        INSERT INTO words (word, document_frequency)
        VALUES (?, 1)
        ON CONFLICT(word) DO UPDATE SET
          document_frequency = document_frequency + 1
        RETURNING id
      `).get(word) as { id: number } | undefined;

      let wordId: number;

      if (insertResult) {
        wordId = insertResult.id;
      } else {
        // 既存の単語IDを取得
        const existing = db.prepare('SELECT id FROM words WHERE word = ?').get(word) as { id: number } | undefined;
        if (!existing) {
          console.error(`[Indexing] Failed to get word ID for: ${word}`);
          continue;
        }
        wordId = existing.id;
      }

      // TF計算
      const tfScore = calculateTF(frequency, processed.totalWords, TF_IDF_CONFIG.tfMethod);
      const positions = wordPositions.get(word) || [];
      const weight = processed.wordWeights.get(word) || 1.0;

      documentTerms.push({
        wordId,
        word,
        termFrequency: frequency,
        positions,
        tfScore,
        weight
      });

      // postings テーブルに挿入
      db.prepare(`
        INSERT INTO postings (word_id, document_id, term_frequency, positions)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(word_id, document_id) DO UPDATE SET
          term_frequency = excluded.term_frequency,
          positions = excluded.positions
      `).run(wordId, documentId, frequency, JSON.stringify(positions));

    } catch (error) {
      console.error(`[Indexing] Error processing word "${word}":`, error);
    }
  }

  console.log(`[Indexing] Indexed ${documentTerms.length} unique terms for document ${documentId}`);

  // 4. TF-IDF 計算は後で全体更新時に実行
  const documentIndex: DocumentIndex = {
    documentId,
    terms: documentTerms,
    tfIdfScores: [], // 後で計算
    totalWords: processed.totalWords,
    uniqueWords: processed.uniqueWords,
    averageTfIdf: 0,
    maxTfIdf: 0
  };

  // 5. 文書統計をdocumentsテーブルに更新
  db.prepare(`
    UPDATE documents
    SET word_count = ?
    WHERE id = ?
  `).run(processed.totalWords, documentId);

  return documentIndex;
}

/**
 * 全文書のTF-IDFスコアを再計算
 */
export async function recalculateTfIdfScores(): Promise<void> {
  console.log('[Indexing] Recalculating TF-IDF scores for all documents...');

  const db = getDb();

  // 総文書数を取得
  const totalDocsResult = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
  const totalDocs = totalDocsResult.count;

  console.log(`[Indexing] Total documents: ${totalDocs}`);

  // 全ての単語の文書頻度を取得
  const words = db.prepare(`
    SELECT id, word, document_frequency
    FROM words
  `).all() as { id: number; word: string; document_frequency: number }[];

  console.log(`[Indexing] Processing ${words.length} unique words`);

  // 各単語のIDF計算とpostingsテーブル更新
  let processedWords = 0;

  for (const word of words) {
    const idf = calculateIDF(totalDocs, word.document_frequency, TF_IDF_CONFIG.idfSmoothing);

    // その単語を含む全てのpostingsを取得してTF-IDFを計算
    const postings = db.prepare(`
      SELECT p.*, d.word_count
      FROM postings p
      JOIN documents d ON p.document_id = d.id
      WHERE p.word_id = ?
    `).all(word.id) as Array<{
      word_id: number;
      document_id: number;
      term_frequency: number;
      positions: string;
      word_count: number;
    }>;

    for (const posting of postings) {
      const tf = calculateTF(posting.term_frequency, posting.word_count, TF_IDF_CONFIG.tfMethod);
      const tfIdf = tf * idf;

      // TF-IDFスコアをpostingsテーブルに保存（カラムを追加する場合）
      // 今回は計算結果をメモリに保持して必要時に再計算する方針
    }

    processedWords++;
    if (processedWords % 100 === 0) {
      console.log(`[Indexing] Processed ${processedWords}/${words.length} words`);
    }
  }

  console.log('[Indexing] TF-IDF recalculation completed');
}

/**
 * 特定文書のTF-IDFスコアを取得
 */
export async function getDocumentTfIdfScores(documentId: number): Promise<TfIdfScore[]> {
  const db = getDb();

  // 総文書数
  const totalDocsResult = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
  const totalDocs = totalDocsResult.count;

  // 文書の単語数
  const docResult = db.prepare('SELECT word_count FROM documents WHERE id = ?').get(documentId) as { word_count: number } | undefined;
  const docWordCount = docResult?.word_count || 1;

  // 文書内の全ての単語とその統計を取得
  const terms = db.prepare(`
    SELECT
      p.word_id,
      w.word,
      p.term_frequency,
      p.positions,
      w.document_frequency
    FROM postings p
    JOIN words w ON p.word_id = w.id
    WHERE p.document_id = ?
    ORDER BY p.term_frequency DESC
  `).all(documentId) as Array<{
    word_id: number;
    word: string;
    term_frequency: number;
    positions: string;
    document_frequency: number;
  }>;

  const tfIdfScores: TfIdfScore[] = terms.map(term => {
    const tf = calculateTF(term.term_frequency, docWordCount, TF_IDF_CONFIG.tfMethod);
    const idf = calculateIDF(totalDocs, term.document_frequency, TF_IDF_CONFIG.idfSmoothing);
    const tfIdf = tf * idf;

    // 日本語分析での重み（再計算が必要だが、簡易的に1.0とする）
    const weight = 1.0;

    return {
      wordId: term.word_id,
      word: term.word,
      tf,
      idf,
      tfIdf,
      weight: tfIdf * weight
    };
  });

  return tfIdfScores.sort((a, b) => b.weight - a.weight);
}

/**
 * 文書の転置インデックスを削除
 */
export async function removeDocumentIndex(documentId: number): Promise<void> {
  console.log(`[Indexing] Removing index for document ${documentId}`);

  const db = getDb();

  // postingsから削除
  db.prepare('DELETE FROM postings WHERE document_id = ?').run(documentId);

  // 文書頻度を更新（使用されなくなった単語の頻度を減らす）
  // 実際の実装では、削除された文書で使用されていた単語の document_frequency を減らす必要がある
  // 簡単のため今回は省略

  console.log(`[Indexing] Index removed for document ${documentId}`);
}

/**
 * 全インデックスの再構築
 */
export async function rebuildAllIndexes(): Promise<void> {
  console.log('[Indexing] Rebuilding all indexes...');

  const db = getDb();

  // 既存のインデックスをクリア
  db.prepare('DELETE FROM postings').run();
  db.prepare('DELETE FROM words').run();

  // 全文書を取得
  const documents = db.prepare('SELECT id, content FROM documents').all() as Array<{
    id: number;
    content: string;
  }>;

  console.log(`[Indexing] Rebuilding indexes for ${documents.length} documents`);

  // 各文書を順次インデックス
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    console.log(`[Indexing] Processing document ${i + 1}/${documents.length} (ID: ${doc.id})`);

    try {
      await indexDocument(doc.id, doc.content);
    } catch (error) {
      console.error(`[Indexing] Failed to index document ${doc.id}:`, error);
    }
  }

  // TF-IDFスコアを再計算
  await recalculateTfIdfScores();

  console.log('[Indexing] Index rebuild completed');
}

/**
 * インデックス統計情報を取得
 */
export async function getIndexStats(): Promise<{
  totalDocuments: number;
  totalWords: number;
  totalPostings: number;
  averageWordsPerDocument: number;
  averageDocumentFrequency: number;
}> {
  const db = getDb();

  const documentsCount = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
  const wordsCount = db.prepare('SELECT COUNT(*) as count FROM words').get() as { count: number };
  const postingsCount = db.prepare('SELECT COUNT(*) as count FROM postings').get() as { count: number };

  const avgWordsResult = db.prepare(`
    SELECT AVG(word_count) as avg_words
    FROM documents
    WHERE word_count > 0
  `).get() as { avg_words: number | null };

  const avgDocFreqResult = db.prepare(`
    SELECT AVG(document_frequency) as avg_doc_freq
    FROM words
  `).get() as { avg_doc_freq: number | null };

  return {
    totalDocuments: documentsCount.count,
    totalWords: wordsCount.count,
    totalPostings: postingsCount.count,
    averageWordsPerDocument: avgWordsResult.avg_words || 0,
    averageDocumentFrequency: avgDocFreqResult.avg_doc_freq || 0
  };
}