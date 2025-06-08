/**
 * 検索エンジンのコア機能
 * クエリ処理・スコアリング・ランキング
 */

import { getDb } from './db';
import { preprocessDocument } from './japanese-analyzer';
import { getDocumentTfIdfScores, TfIdfScore } from './indexing';

/**
 * 検索結果の文書情報
 */
export interface SearchDocument {
  id: number;
  title: string;
  content: string;
  author: string;
  category: string;
  url: string;
  wordCount: number;
  pagerankScore: number;
  relevanceScore: number;
  tfIdfScore: number;
  matchedTerms: string[];
  snippet: string;
  highlightedSnippet: string;
  createdAt: string;
}

/**
 * 検索結果
 */
export interface SearchResult {
  documents: SearchDocument[];
  totalResults: number;
  query: string;
  executionTimeMs: number;
  pagination: {
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  statistics: {
    averageRelevanceScore: number;
    maxRelevanceScore: number;
    termFrequencies: Record<string, number>;
  };
}

/**
 * 検索設定
 */
export interface SearchOptions {
  page?: number;
  limit?: number;
  category?: string;
  author?: string;
  minWordCount?: number;
  maxWordCount?: number;
  sortBy?: 'relevance' | 'date' | 'pagerank' | 'title';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 検索統計情報
 */
export interface SearchStats {
  queryTerms: string[];
  termStats: Array<{
    term: string;
    documentFrequency: number;
    avgTfIdf: number;
    maxTfIdf: number;
  }>;
  executionBreakdown: {
    queryProcessingMs: number;
    documentRetrievalMs: number;
    scoringMs: number;
    rankingMs: number;
  };
}

/**
 * 検索クエリの前処理・分析
 */
export function processSearchQuery(query: string): {
  originalQuery: string;
  processedTerms: string[];
  termWeights: Map<string, number>;
} {
  const startTime = Date.now();

  console.log(`[Search] Processing query: "${query}"`);

  // 日本語分析で前処理
  const processed = preprocessDocument(query);

  console.log(`[Search] Query processed in ${Date.now() - startTime}ms: ${processed.words.length} terms`);

  return {
    originalQuery: query,
    processedTerms: processed.words,
    termWeights: processed.wordWeights
  };
}

/**
 * 文書の関連度計算（TF-IDF + PageRankの組み合わせ）
 */
async function calculateDocumentRelevance(
  documentId: number,
  queryTerms: string[],
  queryWeights: Map<string, number>
): Promise<{
  relevanceScore: number;
  tfIdfScore: number;
  matchedTerms: string[];
  termScores: Record<string, number>;
}> {
  const db = getDb();

  // 文書のPageRankスコアを取得
  const docInfo = db.prepare('SELECT pagerank_score FROM documents WHERE id = ?').get(documentId) as { pagerank_score: number } | undefined;
  const pagerankScore = docInfo?.pagerank_score || 0.1;

  // 文書のTF-IDFスコアを取得
  const tfIdfScores = await getDocumentTfIdfScores(documentId);

  let totalTfIdfScore = 0;
  const matchedTerms: string[] = [];
  const termScores: Record<string, number> = {};

  for (const queryTerm of queryTerms) {
    const termScore = tfIdfScores.find(score => score.word === queryTerm);
    if (termScore) {
      const queryWeight = queryWeights.get(queryTerm) || 1.0;
      const weightedScore = termScore.weight * queryWeight;

      totalTfIdfScore += weightedScore;
      matchedTerms.push(queryTerm);
      termScores[queryTerm] = weightedScore;
    }
  }

  // 関連度計算: TF-IDF(0.8) + PageRank(0.2)の重み付け
  const relevanceScore = (totalTfIdfScore * 0.8) + (pagerankScore * 0.2);

  return {
    relevanceScore,
    tfIdfScore: totalTfIdfScore,
    matchedTerms,
    termScores
  };
}

/**
 * スニペット生成（検索語周辺のテキスト抽出）
 */
function generateSnippet(content: string, matchedTerms: string[], maxLength: number = 200): {
  snippet: string;
  highlightedSnippet: string;
} {
  if (matchedTerms.length === 0) {
    const snippet = content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    return { snippet, highlightedSnippet: snippet };
  }

  // 最初にマッチした語句の位置を特定
  let bestPosition = 0;
  let bestTerm = matchedTerms[0];

  for (const term of matchedTerms) {
    const position = content.indexOf(term);
    if (position !== -1 && position < content.length / 2) {
      bestPosition = position;
      bestTerm = term;
      break;
    }
  }

  // スニペットの開始・終了位置を計算
  const startPos = Math.max(0, bestPosition - maxLength / 3);
  const endPos = Math.min(content.length, startPos + maxLength);

  let snippet = content.substring(startPos, endPos);

  // 前後の...を付加
  if (startPos > 0) snippet = '...' + snippet;
  if (endPos < content.length) snippet = snippet + '...';

  // ハイライト版を生成
  let highlightedSnippet = snippet;
  for (const term of matchedTerms) {
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    highlightedSnippet = highlightedSnippet.replace(regex, `<mark>$&</mark>`);
  }

  return { snippet, highlightedSnippet };
}

/**
 * メイン検索関数
 */
export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const startTime = Date.now();

  console.log(`[Search] Starting search for: "${query}"`);
  console.log(`[Search] Options:`, options);

  // デフォルト設定
  const {
    page = 1,
    limit = 10,
    category,
    author,
    minWordCount,
    maxWordCount,
    sortBy = 'relevance',
    sortOrder = 'desc'
  } = options;

  // 1. クエリ前処理
  const queryProcessingStart = Date.now();
  const { processedTerms, termWeights } = processSearchQuery(query);
  const queryProcessingMs = Date.now() - queryProcessingStart;

  if (processedTerms.length === 0) {
    return {
      documents: [],
      totalResults: 0,
      query,
      executionTimeMs: Date.now() - startTime,
      pagination: {
        page,
        limit,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      },
      statistics: {
        averageRelevanceScore: 0,
        maxRelevanceScore: 0,
        termFrequencies: {}
      }
    };
  }

  // 2. 候補文書の検索
  const documentRetrievalStart = Date.now();
  const db = getDb();

  // クエリ語を含む文書IDを取得
  const termPlaceholders = processedTerms.map(() => '?').join(',');
  let documentQuery = `
    SELECT DISTINCT d.id, d.title, d.content, d.author, d.category, d.url,
           d.word_count, d.pagerank_score, d.created_at
    FROM documents d
    JOIN postings p ON d.id = p.document_id
    JOIN words w ON p.word_id = w.id
    WHERE w.word IN (${termPlaceholders})
  `;

  const queryParams: any[] = [...processedTerms];

  // フィルタ条件の追加
  if (category) {
    documentQuery += ' AND d.category = ?';
    queryParams.push(category);
  }
  if (author) {
    documentQuery += ' AND d.author = ?';
    queryParams.push(author);
  }
  if (minWordCount) {
    documentQuery += ' AND d.word_count >= ?';
    queryParams.push(minWordCount);
  }
  if (maxWordCount) {
    documentQuery += ' AND d.word_count <= ?';
    queryParams.push(maxWordCount);
  }

  const candidateDocuments = db.prepare(documentQuery).all(...queryParams) as Array<{
    id: number;
    title: string;
    content: string;
    author: string;
    category: string;
    url: string;
    word_count: number;
    pagerank_score: number;
    created_at: string;
  }>;

  const documentRetrievalMs = Date.now() - documentRetrievalStart;

  console.log(`[Search] Found ${candidateDocuments.length} candidate documents`);

  // 3. スコアリング
  const scoringStart = Date.now();
  const scoredDocuments: SearchDocument[] = [];

  for (const doc of candidateDocuments) {
    const relevanceData = await calculateDocumentRelevance(doc.id, processedTerms, termWeights);

    if (relevanceData.matchedTerms.length > 0) {
      const { snippet, highlightedSnippet } = generateSnippet(doc.content, relevanceData.matchedTerms);

      scoredDocuments.push({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        author: doc.author,
        category: doc.category,
        url: doc.url,
        wordCount: doc.word_count,
        pagerankScore: doc.pagerank_score,
        relevanceScore: relevanceData.relevanceScore,
        tfIdfScore: relevanceData.tfIdfScore,
        matchedTerms: relevanceData.matchedTerms,
        snippet,
        highlightedSnippet,
        createdAt: doc.created_at
      });
    }
  }

  const scoringMs = Date.now() - scoringStart;

  // 4. ソート・ランキング
  const rankingStart = Date.now();

  scoredDocuments.sort((a, b) => {
    switch (sortBy) {
      case 'relevance':
        return sortOrder === 'desc' ? b.relevanceScore - a.relevanceScore : a.relevanceScore - b.relevanceScore;
      case 'date':
        return sortOrder === 'desc' ?
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() :
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'pagerank':
        return sortOrder === 'desc' ? b.pagerankScore - a.pagerankScore : a.pagerankScore - b.pagerankScore;
      case 'title':
        return sortOrder === 'desc' ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title);
      default:
        return b.relevanceScore - a.relevanceScore;
    }
  });

  const rankingMs = Date.now() - rankingStart;

  // 5. ページネーション
  const totalResults = scoredDocuments.length;
  const totalPages = Math.ceil(totalResults / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = Math.min(startIndex + limit, totalResults);
  const paginatedDocuments = scoredDocuments.slice(startIndex, endIndex);

  // 6. 統計情報の計算
  const relevanceScores = scoredDocuments.map(doc => doc.relevanceScore);
  const averageRelevanceScore = relevanceScores.length > 0 ?
    relevanceScores.reduce((sum, score) => sum + score, 0) / relevanceScores.length : 0;
  const maxRelevanceScore = relevanceScores.length > 0 ? Math.max(...relevanceScores) : 0;

  const termFrequencies: Record<string, number> = {};
  scoredDocuments.forEach(doc => {
    doc.matchedTerms.forEach(term => {
      termFrequencies[term] = (termFrequencies[term] || 0) + 1;
    });
  });

  const executionTimeMs = Date.now() - startTime;

  console.log(`[Search] Search completed in ${executionTimeMs}ms:`);
  console.log(`  - Query processing: ${queryProcessingMs}ms`);
  console.log(`  - Document retrieval: ${documentRetrievalMs}ms`);
  console.log(`  - Scoring: ${scoringMs}ms`);
  console.log(`  - Ranking: ${rankingMs}ms`);
  console.log(`  - Results: ${totalResults} documents`);

  return {
    documents: paginatedDocuments,
    totalResults,
    query,
    executionTimeMs,
    pagination: {
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    },
    statistics: {
      averageRelevanceScore,
      maxRelevanceScore,
      termFrequencies
    }
  };
}

/**
 * 検索ログの保存
 */
export async function logSearch(
  query: string,
  resultsCount: number,
  executionTimeMs: number,
  clickedDocumentId?: number
): Promise<void> {
  try {
    const db = getDb();

    db.prepare(`
      INSERT INTO search_logs (query, results_count, execution_time_ms, clicked_document_id)
      VALUES (?, ?, ?, ?)
    `).run(query, resultsCount, executionTimeMs, clickedDocumentId || null);

    console.log(`[Search] Logged search: "${query}" (${resultsCount} results, ${executionTimeMs}ms)`);

  } catch (error) {
    console.error('[Search] Failed to log search:', error);
  }
}

/**
 * 人気検索クエリの取得
 */
export async function getPopularQueries(limit: number = 10): Promise<Array<{
  query: string;
  searchCount: number;
  avgExecutionTime: number;
  avgResultsCount: number;
}>> {
  const db = getDb();

  const queries = db.prepare(`
    SELECT
      query,
      COUNT(*) as search_count,
      AVG(execution_time_ms) as avg_execution_time,
      AVG(results_count) as avg_results_count
    FROM search_logs
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY query
    ORDER BY search_count DESC
    LIMIT ?
  `).all(limit) as Array<{
    query: string;
    search_count: number;
    avg_execution_time: number;
    avg_results_count: number;
  }>;

  return queries.map(q => ({
    query: q.query,
    searchCount: q.search_count,
    avgExecutionTime: Math.round(q.avg_execution_time),
    avgResultsCount: Math.round(q.avg_results_count)
  }));
}