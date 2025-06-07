/**
 * PageRank アルゴリズム実装
 * 文書間のリンク構造を分析してPageRankスコアを算出
 */

import { getDb } from './db';

export interface PageRankOptions {
  dampingFactor: number;  // 減衰係数（通常0.85）
  maxIterations: number;  // 最大反復回数
  tolerance: number;      // 収束判定の閾値
}

export interface PageRankResult {
  documentId: number;
  pageRankScore: number;
  iterations: number;
  converged: boolean;
}

/**
 * デフォルトのPageRankオプション
 */
export const DEFAULT_PAGERANK_OPTIONS: PageRankOptions = {
  dampingFactor: 0.85,
  maxIterations: 100,
  tolerance: 1e-6
};

/**
 * PageRankスコアを計算する
 */
export async function calculatePageRank(options: PageRankOptions = DEFAULT_PAGERANK_OPTIONS): Promise<PageRankResult[]> {
  console.log('[PageRank] Starting PageRank calculation...');

  const db = getDb();

  // 全文書を取得
  const documents = db.prepare('SELECT id FROM documents ORDER BY id').all() as { id: number }[];
  const documentIds = documents.map(doc => doc.id);
  const n = documentIds.length;

  if (n === 0) {
    console.log('[PageRank] No documents found');
    return [];
  }

  console.log(`[PageRank] Processing ${n} documents`);

  // リンク情報を取得
  const links = db.prepare(`
    SELECT from_document_id, to_document_id
    FROM links
  `).all() as { from_document_id: number, to_document_id: number }[];

  console.log(`[PageRank] Found ${links.length} links`);

  // 隣接行列を構築
  const adjacencyMatrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
  const outboundCounts: number[] = Array(n).fill(0);

  // 文書IDとインデックスのマッピング
  const docIdToIndex = new Map<number, number>();
  documentIds.forEach((id, index) => docIdToIndex.set(id, index));

  // リンクを隣接行列に変換
  for (const link of links) {
    const fromIndex = docIdToIndex.get(link.from_document_id);
    const toIndex = docIdToIndex.get(link.to_document_id);

    if (fromIndex !== undefined && toIndex !== undefined) {
      adjacencyMatrix[fromIndex][toIndex] = 1;
      outboundCounts[fromIndex]++;
    }
  }

  // 遷移行列を構築（列確率的行列）
  const transitionMatrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    if (outboundCounts[i] === 0) {
      // デッドエンド（発リンクなし）の場合は全文書に等確率で遷移
      for (let j = 0; j < n; j++) {
        transitionMatrix[i][j] = 1.0 / n;
      }
    } else {
      // 通常の場合は発リンク先に等確率で遷移
      for (let j = 0; j < n; j++) {
        transitionMatrix[i][j] = adjacencyMatrix[i][j] / outboundCounts[i];
      }
    }
  }

  // PageRankベクトルの初期化（均等分布）
  let pageRank: number[] = Array(n).fill(1.0 / n);
  let newPageRank: number[] = Array(n).fill(0);

  let iteration = 0;
  let converged = false;

  console.log('[PageRank] Starting iterative calculation...');

  // 反復計算
  for (iteration = 0; iteration < options.maxIterations; iteration++) {
    // PageRankの更新
    for (let i = 0; i < n; i++) {
      newPageRank[i] = (1 - options.dampingFactor) / n;

      for (let j = 0; j < n; j++) {
        newPageRank[i] += options.dampingFactor * transitionMatrix[j][i] * pageRank[j];
      }
    }

    // 収束判定
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      const diff = Math.abs(newPageRank[i] - pageRank[i]);
      maxDiff = Math.max(maxDiff, diff);
    }

    if (maxDiff < options.tolerance) {
      converged = true;
      console.log(`[PageRank] Converged after ${iteration + 1} iterations (max diff: ${maxDiff.toExponential(3)})`);
      break;
    }

    // 次の反復のために値をコピー
    [pageRank, newPageRank] = [newPageRank, pageRank];

    if ((iteration + 1) % 10 === 0) {
      console.log(`[PageRank] Iteration ${iteration + 1}/${options.maxIterations}, max diff: ${maxDiff.toExponential(3)}`);
    }
  }

  if (!converged) {
    console.log(`[PageRank] Did not converge after ${options.maxIterations} iterations`);
  }

  // 結果を構築
  const results: PageRankResult[] = documentIds.map((docId, index) => ({
    documentId: docId,
    pageRankScore: newPageRank[index],
    iterations: iteration + 1,
    converged
  }));

  // スコアで降順ソート
  results.sort((a, b) => b.pageRankScore - a.pageRankScore);

  console.log('[PageRank] Top 5 documents by PageRank score:');
  results.slice(0, 5).forEach((result, index) => {
    console.log(`  ${index + 1}. Document ${result.documentId}: ${result.pageRankScore.toFixed(6)}`);
  });

  return results;
}

/**
 * PageRankスコアをデータベースに保存
 */
export async function updatePageRankScores(results: PageRankResult[]): Promise<void> {
  console.log('[PageRank] Updating PageRank scores in database...');

  const db = getDb();
  const updateStmt = db.prepare('UPDATE documents SET pagerank_score = ? WHERE id = ?');

  const transaction = db.transaction((results: PageRankResult[]) => {
    for (const result of results) {
      updateStmt.run(result.pageRankScore, result.documentId);
    }
  });

  transaction(results);

  console.log(`[PageRank] Updated PageRank scores for ${results.length} documents`);
}

/**
 * サンプルリンクデータを生成・挿入
 */
export async function generateSampleLinks(): Promise<void> {
  console.log('[PageRank] Generating sample link data...');

  const db = getDb();

  // 既存のリンクをクリア
  db.prepare('DELETE FROM links').run();

  // 文書IDを取得
  const documents = db.prepare('SELECT id, title, category FROM documents ORDER BY id').all() as {
    id: number,
    title: string,
    category: string
  }[];

  if (documents.length < 2) {
    console.log('[PageRank] Not enough documents to create links');
    return;
  }

  const insertLink = db.prepare('INSERT OR IGNORE INTO links (from_document_id, to_document_id) VALUES (?, ?)');

  // サンプルリンク構造を定義
  const linkRules = [
    // 科学・技術文書間の相互リンク
    { fromCategory: 'wikipedia', toCategory: 'tech', weight: 0.7 },
    { fromCategory: 'tech', toCategory: 'wikipedia', weight: 0.8 },

    // 文学作品から百科事典への参照
    { fromCategory: 'literature', toCategory: 'wikipedia', weight: 0.3 },

    // 技術文書間の相互参照
    { fromCategory: 'tech', toCategory: 'tech', weight: 0.6 },

    // 同一カテゴリ内のランダムリンク
    { fromCategory: '*', toCategory: '*', weight: 0.2 }
  ];

  let linkCount = 0;

  for (const fromDoc of documents) {
    for (const toDoc of documents) {
      if (fromDoc.id === toDoc.id) continue; // 自己リンクは除外

      // リンク確率を計算
      let linkProbability = 0;

      for (const rule of linkRules) {
        const matchFrom = rule.fromCategory === '*' || fromDoc.category === rule.fromCategory;
        const matchTo = rule.toCategory === '*' || toDoc.category === rule.toCategory;

        if (matchFrom && matchTo) {
          linkProbability = Math.max(linkProbability, rule.weight);
        }
      }

      // カテゴリ固有のボーナス
      if (fromDoc.category === 'tech' && toDoc.title.includes('人工知能')) {
        linkProbability += 0.3; // 技術文書からAI記事への高確率リンク
      }

      if (fromDoc.category === 'wikipedia' && toDoc.category === 'literature') {
        linkProbability += 0.2; // 百科事典から文学への参照
      }

      // ランダムにリンクを生成
      if (Math.random() < linkProbability) {
        insertLink.run(fromDoc.id, toDoc.id);
        linkCount++;
        console.log(`[PageRank] Created link: ${fromDoc.title} -> ${toDoc.title}`);
      }
    }
  }

  console.log(`[PageRank] Generated ${linkCount} sample links`);
}

/**
 * PageRank計算とデータベース更新の完全なワークフロー
 */
export async function runPageRankWorkflow(
  generateLinks: boolean = true,
  options: PageRankOptions = DEFAULT_PAGERANK_OPTIONS
): Promise<PageRankResult[]> {
  console.log('[PageRank] Starting PageRank workflow...');

  if (generateLinks) {
    await generateSampleLinks();
  }

  const results = await calculatePageRank(options);
  await updatePageRankScores(results);

  console.log('[PageRank] PageRank workflow completed successfully');
  return results;
}

/**
 * PageRank統計情報を取得
 */
export async function getPageRankStatistics(): Promise<{
  totalDocuments: number;
  totalLinks: number;
  averagePageRank: number;
  maxPageRank: number;
  minPageRank: number;
  topDocuments: { id: number; title: string; pageRankScore: number }[];
}> {
  const db = getDb();

  const totalDocuments = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
  const totalLinks = db.prepare('SELECT COUNT(*) as count FROM links').get() as { count: number };

  const stats = db.prepare(`
    SELECT
      AVG(pagerank_score) as avg_score,
      MAX(pagerank_score) as max_score,
      MIN(pagerank_score) as min_score
    FROM documents
  `).get() as { avg_score: number; max_score: number; min_score: number };

    const topDocuments = db.prepare(`
    SELECT id, title, pagerank_score
    FROM documents
    ORDER BY pagerank_score DESC
    LIMIT 5
  `).all() as { id: number; title: string; pagerank_score: number }[];

  return {
    totalDocuments: totalDocuments.count,
    totalLinks: totalLinks.count,
    averagePageRank: stats.avg_score || 0,
    maxPageRank: stats.max_score || 0,
    minPageRank: stats.min_score || 0,
    topDocuments: topDocuments.map(doc => ({
      id: doc.id,
      title: doc.title,
      pageRankScore: doc.pagerank_score
    }))
  };
}