/**
 * 検索エンジン API テストスクリプト
 * 主要なAPIエンドポイントをテスト
 */

async function testSearchEngineAPI() {
  console.log('🚀 Day63 検索エンジン - APIテスト開始\n');

  try {
    const baseUrl = 'http://localhost:3001';

    // 1. 検索APIテスト
    console.log('=== 1. 検索API テスト ===');
    const queries = [
      { query: 'AI', expectResults: true },
      { query: '東京', expectResults: true },
      { query: '技術', expectResults: true },
      { query: '銀河鉄道', expectResults: true },
      { query: 'NotFoundKeyword', expectResults: false },
      { query: '夏目漱石', expectResults: true }
    ];

    let passedTests = 0;
    for (const test of queries) {
      try {
        const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(test.query)}`);
        const data = await response.json();

        if (data.success) {
          const hasResults = data.data.totalResults > 0;
          const passed = hasResults === test.expectResults;

          if (passed) {
            console.log(`✅ "${test.query}": ${data.data.totalResults}件 (${data.data.executionTimeMs}ms)`);
            passedTests++;
          } else {
            console.log(`❌ "${test.query}": 期待値と異なる結果 (実際: ${hasResults}, 期待: ${test.expectResults})`);
          }
        } else {
          console.log(`❌ "${test.query}": APIエラー - ${data.message}`);
        }
      } catch (error) {
        console.log(`❌ "${test.query}": ネットワークエラー - ${error}`);
      }
    }
    console.log(`検索API: ${passedTests}/${queries.length} テスト通過\n`);

    // 2. 詳細検索パラメータテスト
    console.log('=== 2. 詳細検索パラメータ テスト ===');
    const paramTests = [
      { url: '/api/search?q=AI&limit=5', description: 'limit制限' },
      { url: '/api/search?q=AI&page=1', description: 'ページネーション' },
      { url: '/api/search?q=AI&category=wikipedia', description: 'カテゴリフィルタ' },
      { url: '/api/search?q=AI&sortBy=pagerank', description: 'PageRankソート' },
      { url: '/api/search?q=AI&sortBy=date', description: '日付ソート' }
    ];

    let passedParamTests = 0;
    for (const test of paramTests) {
      try {
        const response = await fetch(`${baseUrl}${test.url}`);
        const data = await response.json();

        if (data.success) {
          console.log(`✅ ${test.description}: 成功 (${data.data.executionTimeMs}ms)`);
          passedParamTests++;
        } else {
          console.log(`❌ ${test.description}: ${data.message}`);
        }
      } catch (error) {
        console.log(`❌ ${test.description}: エラー - ${error}`);
      }
    }
    console.log(`詳細検索: ${passedParamTests}/${paramTests.length} テスト通過\n`);

    // 3. PageRank APIテスト
    console.log('=== 3. PageRank API テスト ===');

    // 統計情報取得
    try {
      const response = await fetch(`${baseUrl}/api/pagerank`);
      const data = await response.json();

      if (data.success) {
        console.log(`✅ PageRank統計取得成功:`);
        console.log(`  - 総文書数: ${data.data.totalDocuments}`);
        console.log(`  - 総リンク数: ${data.data.totalLinks}`);
        console.log(`  - 平均PageRank: ${data.data.averagePageRank.toFixed(4)}`);
        console.log(`  - 最大PageRank: ${data.data.maxPageRank.toFixed(4)}`);
        console.log(`  - トップ文書: ${data.data.topDocuments[0]?.title || 'なし'}`);
      } else {
        console.log(`❌ PageRank統計取得エラー: ${data.message}`);
      }
    } catch (error) {
      console.log(`❌ PageRank統計取得ネットワークエラー: ${error}`);
    }
    console.log();

    // 4. インデックス管理APIテスト
    console.log('=== 4. インデックス管理API テスト ===');

    try {
      const response = await fetch(`${baseUrl}/api/index/rebuild`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        console.log(`✅ インデックス再構築成功:`);
        console.log(`  - 処理文書数: ${data.data.stats.totalDocuments}`);
        console.log(`  - インデックス単語数: ${data.data.stats.totalWords}`);
        console.log(`  - 実行時間: ${data.data.executionTimeMs}ms`);
      } else {
        console.log(`❌ インデックス再構築エラー: ${data.message}`);
      }
    } catch (error) {
      console.log(`❌ インデックス再構築ネットワークエラー: ${error}`);
    }
    console.log();

    // 5. パフォーマンステスト
    console.log('=== 5. パフォーマンステスト ===');

    const perfQueries = ['AI', '東京', '夏目漱石', 'データベース', '技術'];
    const times: number[] = [];

    for (const query of perfQueries) {
      const startTime = Date.now();

      try {
        const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        times.push(responseTime);

        console.log(`  "${query}": ${responseTime}ms (${data.data?.totalResults || 0}件)`);
      } catch (error) {
        console.log(`  "${query}": エラー - ${error}`);
      }
    }

    if (times.length > 0) {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      console.log(`\n📊 パフォーマンス統計:`);
      console.log(`  - 平均応答時間: ${avgTime.toFixed(1)}ms`);
      console.log(`  - 最大応答時間: ${maxTime}ms`);
      console.log(`  - 最小応答時間: ${minTime}ms`);

      if (avgTime < 100) {
        console.log(`✅ パフォーマンス: 優秀 (平均100ms未満)`);
      } else if (avgTime < 500) {
        console.log(`✅ パフォーマンス: 良好 (平均500ms未満)`);
      } else {
        console.log(`⚠️ パフォーマンス: 改善が必要 (平均500ms以上)`);
      }
    }
    console.log();

    // 6. 検索精度テスト
    console.log('=== 6. 検索精度テスト ===');

    const precisionTests = [
      {
        query: 'AI',
        expectedKeywords: ['人工知能', 'AI', 'Artificial', 'Intelligence'],
        description: 'AI関連検索'
      },
      {
        query: '東京',
        expectedKeywords: ['東京', '首都', '都市', '関東'],
        description: '地理関連検索'
      },
      {
        query: 'Next.js',
        expectedKeywords: ['Next.js', 'Next', 'React', 'Router', 'App'],
        description: '技術関連検索'
      }
    ];

    for (const test of precisionTests) {
      try {
        const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(test.query)}`);
        const data = await response.json();

        if (data.success && data.data.documents.length > 0) {
          const firstDoc = data.data.documents[0];
          const content = (firstDoc.title + ' ' + firstDoc.snippet).toLowerCase();

          const matchedKeywords = test.expectedKeywords.filter(keyword =>
            content.includes(keyword.toLowerCase())
          );

          const precision = matchedKeywords.length / test.expectedKeywords.length;
          const status = precision >= 0.5 ? '✅' : '⚠️';

          console.log(`${status} ${test.description}: 精度 ${(precision * 100).toFixed(1)}% (${matchedKeywords.length}/${test.expectedKeywords.length})`);
          console.log(`    マッチしたキーワード: [${matchedKeywords.join(', ')}]`);
        } else {
          console.log(`❌ ${test.description}: 検索結果なし`);
        }
      } catch (error) {
        console.log(`❌ ${test.description}: エラー - ${error}`);
      }
    }
    console.log();

    console.log('🎉 APIテスト完了！検索エンジンの主要機能をテストしました');

  } catch (error) {
    console.error('❌ APIテストでエラーが発生しました:', error);
    process.exit(1);
  }
}

// メイン実行
if (require.main === module) {
  testSearchEngineAPI().catch(console.error);
}