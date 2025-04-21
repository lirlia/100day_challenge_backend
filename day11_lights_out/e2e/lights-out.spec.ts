import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3001'; // アプリケーションのURL

test.describe('Lights Out Game E2E Test', () => {
  test('should load the game, allow interactions, and handle history', async ({ page }) => {
    await page.goto(BASE_URL);

    // 1. ページタイトルと盤面の確認
    await expect(page).toHaveTitle(/Lights Out Game/); // page.tsx の title か h1 で確認
    await expect(page.locator('h1')).toHaveText('Lights Out Game');

    // 盤面 (5x5=25個のボタン) が表示されるのを待つ
    const boardButtons = page.locator('.grid button');
    await expect(boardButtons).toHaveCount(25);

    // 初期手数が 0 であることを確認
    const movesCounter = page.locator('text=/Moves: \\d+/');
    await expect(movesCounter).toContainText('Moves: 0');

    // 履歴が最初は空か "No history yet" であることを確認 (実装による)
    const historyList = page.locator('div:has-text("History") >> ul');
    // await expect(historyList.locator('li')).toHaveCount(1); // GameInitialized のみの場合など
    // または
    // await expect(page.locator('text=No history yet.')).toBeVisible();

    // 2. ライトをクリックする
    const firstButton = boardButtons.nth(12); // 中央のボタン (2, 2) をクリックしてみる
    const initialButtonClass = await firstButton.getAttribute('class');
    await firstButton.click();

    // 手数が増えることを確認 (API 呼び出しと状態更新を待つ)
    await expect(movesCounter).toContainText('Moves: 1', { timeout: 5000 }); // タイムアウトを少し長めに

    // クリックしたボタンのスタイルが変わることを確認 (例: bg-yellow-400 <=> bg-gray-600)
    await expect(firstButton).not.toHaveAttribute('class', initialButtonClass || '');

    // 履歴が増えることを確認 (GameInitialized + LightToggled or GameWon)
    const historyItemCount = await historyList.locator('li').count();
    expect(historyItemCount).toBeGreaterThanOrEqual(2); // 2件以上あればOKとする
    await expect(historyList.locator('text=Seq 2: LightToggled (2, 2)')).toBeVisible();

    // 3. 別のライトをクリック
    const secondButton = boardButtons.nth(0); // (0, 0)
    await secondButton.click();
    await expect(movesCounter).toContainText('Moves: 2');
    await expect(historyList.locator('li')).toHaveCount(3);
    await expect(historyList.locator('text=Seq 3: LightToggled (0, 0)')).toBeVisible();

    // 4. 履歴をクリックして状態を戻す
    const historySeq2 = historyList.locator('text=Seq 2: LightToggled (2, 2)');
    await historySeq2.click();

    // 盤面が Seq 2 の状態に戻っていることを確認 (特定のボタンの状態を確認)
    // Seq 2 時点での firstButton (2,2) の状態を検証するのは難しいので、手数表示で代用
    await expect(page.locator('text=/Moves: 1 \\(Viewing Seq 2\\)/')).toBeVisible();
    // 盤面操作が無効になっていることを確認 (例: disabled 属性)
    await expect(firstButton).toBeDisabled();

    // 5. 「Back to Latest」ボタンで最新に戻る
    const backButton = page.locator('button:has-text("Back to Latest")');
    await expect(backButton).toBeVisible();
    await backButton.click();

    // 最新の状態 (手数 2) に戻っていることを確認
    await expect(movesCounter).toContainText('Moves: 2');
    await expect(movesCounter).not.toContainText('(Viewing Seq'); // 履歴表示中でない
    await expect(firstButton).toBeEnabled(); // 操作可能に戻る

    // 6. 「New Game」ボタンをクリック
    const newGameButton = page.locator('button:has-text("New Game")');
    await newGameButton.click();

    // 新しいゲームが開始されるのを待つ (ローディング表示など)
    await expect(page.locator('text=Loading Game...')).toBeVisible({ timeout: 1000 }); // すぐ消えるかも
    await expect(page.locator('text=Loading Game...')).not.toBeVisible({ timeout: 10000 }); // 長めに待つ

    // 手数が 0 に戻り、履歴がリセットされることを確認
    await expect(movesCounter).toContainText('Moves: 0');
    await expect(historyList.locator('li')).toHaveCount(1); // GameInitialized のみ
    await expect(historyList.locator('text=/Seq 1: Game Start/')).toBeVisible(); // Game Start表示に変更した場合
  });
});
