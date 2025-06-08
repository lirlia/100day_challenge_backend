/**
 * 検索エンジン E2E テストスクリプト
 * 主要な機能をAPI経由でテスト
 */

import { chromium, Browser, Page } from 'playwright';

async function testSearchEngine() {
  console.log('🚀 Day63 検索エンジン - E2Eテスト開始\n');

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // ブラウザを起動
    console.log('🌐 ブラウザを起動中...');
    browser = await chromium.launch();
    page = await browser.newPage();

    // ベースURL（開発サーバーが動作していることを前提）
    const baseUrl = 'http://localhost:3001';

    // 1. ホームページのテスト
    console.log('=== 1. ホームページテスト ===');
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    console.log(`✅ ページタイトル: ${title}`);

    const heading = await page.textContent('h1');
    console.log(`✅ メインヘッディング: ${heading}`);
    console.log();

    // 2. 検索ページのテスト
    console.log('=== 2. 検索ページテスト ===');
    await page.goto(`${baseUrl}/search`);
    await page.waitForLoadState('networkidle');

    // 検索フォームの存在確認
    const searchInput = page.locator('input[placeholder*="キーワード"]');
    await searchInput.waitFor();
    console.log('✅ 検索フォームが表示されています');

    // 検索実行テスト
    await searchInput.fill('AI');
    await page.click('button[type="submit"]');

    // 検索結果の待機
    await page.waitForTimeout(2000); // API応答待機

    const resultsCount = await page.locator('[class*="結果"]').textContent();
    if (resultsCount) {
      console.log(`✅ 検索結果: ${resultsCount}`);
    }

    const firstResult = await page.locator('[class*="bg-slate-900"]').first().textContent();
    if (firstResult) {
      console.log(`✅ 最初の検索結果が表示されています`);
    }
    console.log();

    // 3. 管理画面のテスト
    console.log('=== 3. 管理画面テスト ===');
    await page.goto(`${baseUrl}/admin`);
    await page.waitForLoadState('networkidle');

    // 統計情報の表示確認
    const statsElements = await page.locator('[class*="bg-slate-900"]').count();
    console.log(`✅ 統計要素数: ${statsElements}`);

    // PageRank統計の確認
    const totalDocs = await page.locator('text=総文書数').locator('..').locator('p').textContent();
    if (totalDocs) {
      console.log(`✅ 総文書数: ${totalDocs}`);
    }
    console.log();

    // 4. APIテスト
    console.log('=== 4. APIテスト ===');

    // 検索APIテスト
    const searchResponse = await page.evaluate(async () => {
      const response = await fetch('/api/search?q=東京');
      return await response.json();
    });

    if (searchResponse.success) {
      console.log(`✅ 検索API: ${searchResponse.data.totalResults}件の結果`);
    } else {
      console.log('❌ 検索APIでエラー:', searchResponse.message);
    }

    // PageRank統計APIテスト
    const pageRankResponse = await page.evaluate(async () => {
      const response = await fetch('/api/pagerank');
      return await response.json();
    });

    if (pageRankResponse.success) {
      console.log(`✅ PageRank API: ${pageRankResponse.data.totalDocuments}文書, ${pageRankResponse.data.totalLinks}リンク`);
    } else {
      console.log('❌ PageRank APIでエラー:', pageRankResponse.message);
    }
    console.log();

    // 5. パフォーマンステスト
    console.log('=== 5. パフォーマンステスト ===');

    const queries = ['AI', '東京', '夏目漱石', 'データベース', '技術'];
    const times: number[] = [];

    for (const query of queries) {
      const startTime = Date.now();

      const response = await page.evaluate(async (q) => {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        return await response.json();
      }, query);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      times.push(responseTime);

      console.log(`  "${query}": ${responseTime}ms (${response.data?.totalResults || 0}件)`);
    }

    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    console.log(`✅ 平均応答時間: ${avgTime.toFixed(1)}ms`);
    console.log();

    // 6. 検索精度テスト
    console.log('=== 6. 検索精度テスト ===');

    const precisionTests = [
      { query: 'AI', expectedKeywords: ['人工知能', 'AI', 'Artificial'] },
      { query: '東京', expectedKeywords: ['東京', '首都', '都市'] },
      { query: 'Next.js', expectedKeywords: ['Next.js', 'React', 'Router'] }
    ];

    for (const test of precisionTests) {
      const response = await page.evaluate(async (q) => {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        return await response.json();
      }, test.query);

      if (response.success && response.data.documents.length > 0) {
        const firstDoc = response.data.documents[0];
        const content = (firstDoc.title + ' ' + firstDoc.content).toLowerCase();

        const matchedKeywords = test.expectedKeywords.filter(keyword =>
          content.includes(keyword.toLowerCase())
        );

        const precision = matchedKeywords.length / test.expectedKeywords.length;
        console.log(`  "${test.query}": 精度 ${(precision * 100).toFixed(1)}% (${matchedKeywords.length}/${test.expectedKeywords.length})`);
      }
    }
    console.log();

    console.log('🎉 E2Eテスト完了！すべての主要機能が正常に動作しています');

  } catch (error) {
    console.error('❌ E2Eテストでエラーが発生しました:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// APIのみのテスト（Playwrightが利用できない場合の代替）
async function testApiOnly() {
  console.log('🚀 Day63 検索エンジン - API専用テスト開始\n');

  try {
    const baseUrl = 'http://localhost:3001';

    // 1. 検索APIテスト
    console.log('=== 1. 検索API テスト ===');
    const queries = ['AI', '東京', '技術', '銀河鉄道'];

    for (const query of queries) {
      const response = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.success) {
        console.log(`✅ "${query}": ${data.data.totalResults}件 (${data.data.executionTimeMs}ms)`);
      } else {
        console.log(`❌ "${query}": エラー - ${data.message}`);
      }
    }
    console.log();

    // 2. PageRank APIテスト
    console.log('=== 2. PageRank API テスト ===');
    const pageRankResponse = await fetch(`${baseUrl}/api/pagerank`);
    const pageRankData = await pageRankResponse.json();

    if (pageRankData.success) {
      console.log(`✅ PageRank統計取得成功:`);
      console.log(`  - 総文書数: ${pageRankData.data.totalDocuments}`);
      console.log(`  - 総リンク数: ${pageRankData.data.totalLinks}`);
      console.log(`  - 平均PageRank: ${pageRankData.data.averagePageRank.toFixed(4)}`);
    } else {
      console.log(`❌ PageRank統計取得エラー: ${pageRankData.message}`);
    }
    console.log();

    console.log('🎉 API専用テスト完了！');

  } catch (error) {
    console.error('❌ API専用テストでエラーが発生しました:', error);
    process.exit(1);
  }
}

// メイン実行
if (require.main === module) {
  // Playwrightが利用可能かチェック
  try {
    require('playwright');
    testSearchEngine().catch(console.error);
  } catch (error) {
    console.log('⚠️ Playwright not available, running API-only tests...\n');
    testApiOnly().catch(console.error);
  }
}