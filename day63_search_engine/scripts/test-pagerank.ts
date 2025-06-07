/**
 * PageRankアルゴリズムテストスクリプト
 */

import { runPageRankWorkflow, getPageRankStatistics, generateSampleLinks } from '../lib/pagerank';
import { initializeSchema } from '../lib/db';

async function testPageRank() {
  console.log('🚀 Day63 検索エンジン - PageRankアルゴリズムテスト\n');

  try {
    // データベース初期化
    console.log('🔧 Initializing database...');
    initializeSchema();
    console.log('✅ Database initialized\n');

    // 1. 統計情報の取得（計算前）
    console.log('=== 1. PageRank統計（計算前）===');
    let stats = await getPageRankStatistics();
    console.log(`📊 統計情報:`);
    console.log(`  総文書数: ${stats.totalDocuments}`);
    console.log(`  総リンク数: ${stats.totalLinks}`);
    console.log(`  平均PageRank: ${stats.averagePageRank.toFixed(6)}`);
    console.log(`  最大PageRank: ${stats.maxPageRank.toFixed(6)}`);
    console.log(`  最小PageRank: ${stats.minPageRank.toFixed(6)}\n`);

    if (stats.topDocuments.length > 0) {
      console.log('🏆 トップ文書（計算前）:');
      stats.topDocuments.forEach((doc, index) => {
        console.log(`  ${index + 1}. ${doc.title}: ${doc.pageRankScore.toFixed(6)}`);
      });
      console.log();
    }

    // 2. サンプルリンクの生成
    console.log('=== 2. サンプルリンクの生成 ===');
    await generateSampleLinks();
    console.log();

    // 3. PageRank計算の実行
    console.log('=== 3. PageRank計算の実行 ===');
    const startTime = Date.now();
    const results = await runPageRankWorkflow(false); // リンクは既に生成済み
    const executionTime = Date.now() - startTime;
    console.log(`⏱️ 実行時間: ${executionTime}ms\n`);

    // 4. 結果の分析
    console.log('=== 4. PageRank結果分析 ===');
    console.log(`📈 計算結果:`);
    console.log(`  反復回数: ${results[0]?.iterations || 0}`);
    console.log(`  収束状態: ${results[0]?.converged ? '収束' : '未収束'}\n`);

    console.log('🏆 PageRankランキング（トップ10）:');
    results.slice(0, 10).forEach((result, index) => {
      console.log(`  ${index + 1}. Document ${result.documentId}: ${result.pageRankScore.toFixed(6)}`);
    });
    console.log();

    // 5. 統計情報の取得（計算後）
    console.log('=== 5. PageRank統計（計算後）===');
    stats = await getPageRankStatistics();
    console.log(`📊 統計情報:`);
    console.log(`  総文書数: ${stats.totalDocuments}`);
    console.log(`  総リンク数: ${stats.totalLinks}`);
    console.log(`  平均PageRank: ${stats.averagePageRank.toFixed(6)}`);
    console.log(`  最大PageRank: ${stats.maxPageRank.toFixed(6)}`);
    console.log(`  最小PageRank: ${stats.minPageRank.toFixed(6)}\n`);

    console.log('🏆 トップ文書（計算後）:');
    stats.topDocuments.forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc.title}: ${doc.pageRankScore.toFixed(6)}`);
    });
    console.log();

    // 6. PageRankスコアの分布分析
    console.log('=== 6. PageRankスコア分布分析 ===');
    const scoreRanges = [
      { label: '高スコア (>平均×2)', min: stats.averagePageRank * 2, max: Infinity },
      { label: '中スコア (平均〜平均×2)', min: stats.averagePageRank, max: stats.averagePageRank * 2 },
      { label: '低スコア (<平均)', min: 0, max: stats.averagePageRank }
    ];

    for (const range of scoreRanges) {
      const count = results.filter(r => r.pageRankScore >= range.min && r.pageRankScore < range.max).length;
      console.log(`  ${range.label}: ${count}文書`);
    }
    console.log();

    console.log('🎉 PageRankテスト完了！');

  } catch (error) {
    console.error('❌ PageRankテストでエラーが発生しました:', error);
    process.exit(1);
  }
}

// メイン実行
if (require.main === module) {
  testPageRank().catch(console.error);
}