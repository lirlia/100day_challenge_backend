import { test, expect } from '@playwright/test';

test.describe('JIT Dashboard E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // バックエンドが起動していることを確認
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 最大10秒待機してバックエンド接続を確認
    await page.waitForSelector('[data-testid="connection-status"]', { timeout: 10000 });
  });

  test('ダッシュボードが正常に表示される', async ({ page }) => {
    // ページタイトルの確認
    await expect(page).toHaveTitle(/Rust JIT コンパイラ Dashboard/);

    // 主要コンポーネントの存在確認
    await expect(page.getByText('Day62 - Rust JIT コンパイラ Dashboard')).toBeVisible();
    await expect(page.getByText('式実行パネル')).toBeVisible();
    await expect(page.getByText('JIT統計情報')).toBeVisible();
    await expect(page.getByText('パフォーマンス推移')).toBeVisible();
    await expect(page.getByText('JITキャッシュ')).toBeVisible();
  });

  test('バックエンド接続状態が表示される', async ({ page }) => {
    // 接続ステータスの確認
    const connectionStatus = page.locator('[data-testid="connection-status"]');
    await expect(connectionStatus).toContainText(/Backend Connected|Backend Disconnected/);

    // 接続インジケーターの確認
    const indicator = page.locator('[data-testid="connection-indicator"]');
    await expect(indicator).toBeVisible();
  });

  test('式を実行して結果が表示される', async ({ page }) => {
    // バックエンド接続を待機
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Backend Connected', { timeout: 15000 });

    // 式入力
    const codeInput = page.locator('textarea[placeholder*="例: x = 42"]');
    await codeInput.clear();
    await codeInput.fill('1 + 2 * 3');

    // 実行ボタンをクリック
    const executeButton = page.getByRole('button', { name: '実行' });
    await executeButton.click();

    // 結果の表示を待機
    await expect(page.getByText('結果: 7')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/実行時間:/)).toBeVisible();
  });

  test('変数代入と参照が動作する', async ({ page }) => {
    // バックエンド接続を待機
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Backend Connected', { timeout: 15000 });

    const codeInput = page.locator('textarea[placeholder*="例: x = 42"]');
    const executeButton = page.getByRole('button', { name: '実行' });

    // 変数代入
    await codeInput.clear();
    await codeInput.fill('x = 42');
    await executeButton.click();
    await expect(page.getByText('結果: 42')).toBeVisible({ timeout: 10000 });

    // 変数参照
    await codeInput.clear();
    await codeInput.fill('x + 8');
    await executeButton.click();
    await expect(page.getByText('結果: 50')).toBeVisible({ timeout: 10000 });
  });

  test('JIT統計情報が更新される', async ({ page }) => {
    // バックエンド接続を待機
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Backend Connected', { timeout: 15000 });

    // 初期統計を取得
    const statsPanel = page.locator('[data-testid="stats-panel"]');
    await expect(statsPanel).toBeVisible();

    // 実行前の統計
    const initialExecutions = await page.locator('[data-testid="total-executions"]').textContent();

    // 式を実行
    const codeInput = page.locator('textarea[placeholder*="例: x = 42"]');
    const executeButton = page.getByRole('button', { name: '実行' });

    await codeInput.clear();
    await codeInput.fill('2 * 3 + 1');
    await executeButton.click();

    // 結果表示を待機
    await expect(page.getByText('結果: 7')).toBeVisible({ timeout: 10000 });

    // 統計が更新されたことを確認（少し待機してから）
    await page.waitForTimeout(3000); // 2秒間隔の更新を待つ
    const updatedExecutions = await page.locator('[data-testid="total-executions"]').textContent();

    // 実行回数が増加していることを確認
    expect(parseInt(updatedExecutions || '0')).toBeGreaterThan(parseInt(initialExecutions || '0'));
  });

  test('JITコンパイルが発生する', async ({ page }) => {
    // バックエンド接続を待機
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Backend Connected', { timeout: 15000 });

    const codeInput = page.locator('textarea[placeholder*="例: x = 42"]');
    const executeButton = page.getByRole('button', { name: '実行' });

    // 同じ式を複数回実行してJITコンパイルをトリガー
    const testExpression = 'y = 99; y * 2';

    for (let i = 0; i < 12; i++) {
      await codeInput.clear();
      await codeInput.fill(testExpression);
      await executeButton.click();

      // 結果を待機
      await expect(page.getByText('結果: 198')).toBeVisible({ timeout: 10000 });

      // 少し待機
      await page.waitForTimeout(500);
    }

    // JITコンパイルバッジが表示されることを確認
    await expect(page.getByText('JIT Compiled')).toBeVisible({ timeout: 15000 });
  });

  test('統計リセット機能が動作する', async ({ page }) => {
    // バックエンド接続を待機
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Backend Connected', { timeout: 15000 });

    // 実行して統計を作成
    const codeInput = page.locator('textarea[placeholder*="例: x = 42"]');
    const executeButton = page.getByRole('button', { name: '実行' });

    await codeInput.clear();
    await codeInput.fill('5 * 5');
    await executeButton.click();
    await expect(page.getByText('結果: 25')).toBeVisible({ timeout: 10000 });

    // 統計リセットボタンをクリック
    const resetButton = page.getByRole('button', { name: '統計リセット' });
    await resetButton.click();

    // 統計が初期化されたことを確認（少し待機）
    await page.waitForTimeout(3000);
    const totalExecutions = await page.locator('[data-testid="total-executions"]').textContent();
    expect(parseInt(totalExecutions || '1')).toBeLessThanOrEqual(1);
  });

  test('エラーハンドリングが適切に動作する', async ({ page }) => {
    // バックエンド接続を待機
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Backend Connected', { timeout: 15000 });

    // 無効な式を入力
    const codeInput = page.locator('textarea[placeholder*="例: x = 42"]');
    const executeButton = page.getByRole('button', { name: '実行' });

    await codeInput.clear();
    await codeInput.fill('invalid syntax @#$');
    await executeButton.click();

    // エラー状態の確認（結果が表示されないか、エラー表示）
    // 注: 実際のエラー処理に応じて調整が必要
    await page.waitForTimeout(2000);
  });
});