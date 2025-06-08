/**
 * 日本語分析エンジンのテストスクリプト
 */

import {
  segmentJapanese,
  normalizeText,
  filterStopWords,
  preprocessDocument,
  debugAnalysis
} from '../lib/japanese-analyzer';
import { rebuildAllIndexes, getIndexStats } from '../lib/indexing';

// テスト用テキスト
const TEST_TEXTS = [
  {
    title: '短いテキスト',
    content: '私は東京に住んでいます。とても良い街です。'
  },
  {
    title: 'カタカナ・英数字混在',
    content: 'Next.jsはReactベースのフレームワークです。TypeScriptとの相性も抜群です。'
  },
  {
    title: '長めの文章',
    content: '人工知能（AI）の発展により、様々な分野で自動化が進んでいる。機械学習やディープラーニングなどの技術が、医療診断、自動運転、自然言語処理などの領域で活用されている。これらの技術は今後も進歩を続け、私たちの生活をより豊かにしていくだろう。'
  }
];

async function testJapaneseAnalyzer() {
  console.log('=== 日本語分析エンジン テスト開始 ===\n');

  for (const test of TEST_TEXTS) {
    console.log(`📖 テスト: ${test.title}`);
    console.log(`原文: ${test.content}\n`);

    // 1. 正規化テスト
    console.log('1. 正規化結果:');
    const normalized = normalizeText(test.content);
    console.log(`   ${normalized}\n`);

    // 2. 分割テスト
    console.log('2. 分割結果:');
    const segments = segmentJapanese(normalized);
    console.log(`   [${segments.join(', ')}]\n`);

    // 3. ストップワードフィルタテスト
    console.log('3. フィルタ後:');
    const filtered = filterStopWords(segments);
    console.log(`   [${filtered.join(', ')}]\n`);

    // 4. 前処理パイプラインテスト
    console.log('4. 前処理結果:');
    const processed = preprocessDocument(test.content);
    console.log(`   総単語数: ${processed.totalWords}`);
    console.log(`   ユニーク単語数: ${processed.uniqueWords}`);
    console.log(`   重み付き単語 (上位10個):`);

    const topWords = Array.from(processed.wordWeights.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    topWords.forEach(([word, weight]) => {
      console.log(`     ${word}: ${weight.toFixed(2)}`);
    });

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

async function testIndexing() {
  console.log('=== インデックス構築テスト開始 ===\n');

  try {
    console.log('📚 全インデックスの再構築を開始...');
    await rebuildAllIndexes();

    console.log('📊 インデックス統計の取得...');
    const stats = await getIndexStats();

    console.log('✅ インデックス構築完了！');
    console.log('統計情報:');
    console.log(`  総文書数: ${stats.totalDocuments}`);
    console.log(`  総単語数: ${stats.totalWords}`);
    console.log(`  総投稿数: ${stats.totalPostings}`);
    console.log(`  文書あたり平均単語数: ${stats.averageWordsPerDocument.toFixed(1)}`);
    console.log(`  単語あたり平均文書頻度: ${stats.averageDocumentFrequency.toFixed(2)}`);

  } catch (error) {
    console.error('❌ インデックス構築失敗:', error);
  }
}

// メイン実行
async function main() {
  console.log('🚀 Day63 検索エンジン - 日本語分析テスト\n');

  // 1. 日本語分析エンジンテスト
  await testJapaneseAnalyzer();

  // 2. インデックス構築テスト
  await testIndexing();

  console.log('\n🎉 全テスト完了！');
}

// スクリプト実行
if (require.main === module) {
  main().catch(console.error);
}

export { testJapaneseAnalyzer, testIndexing };