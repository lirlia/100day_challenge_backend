# Test info

- Name: Lights Out Game E2E Test >> should load the game, allow interactions, and handle history
- Location: /Users/noname/Cording/100day_challenge_backend/day11_lights_out/e2e/lights-out.spec.ts:6:7

# Error details

```
Error: expect(locator).toHaveCount(expected)

Locator: locator('.grid button')
Expected: 25
Received: 0
Call log:
  - expect.toHaveCount with timeout 5000ms
  - waiting for locator('.grid button')
    5 × locator resolved to 0 elements
      - unexpected value "0"

    at /Users/noname/Cording/100day_challenge_backend/day11_lights_out/e2e/lights-out.spec.ts:15:32
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | const BASE_URL = 'http://localhost:3001'; // アプリケーションのURL
   4 |
   5 | test.describe('Lights Out Game E2E Test', () => {
   6 |   test('should load the game, allow interactions, and handle history', async ({ page }) => {
   7 |     await page.goto(BASE_URL);
   8 |
   9 |     // 1. ページタイトルと盤面の確認
  10 |     await expect(page).toHaveTitle(/Lights Out Game/); // page.tsx の title か h1 で確認
  11 |     await expect(page.locator('h1')).toHaveText('Lights Out Game');
  12 |
  13 |     // 盤面 (5x5=25個のボタン) が表示されるのを待つ
  14 |     const boardButtons = page.locator('.grid button');
> 15 |     await expect(boardButtons).toHaveCount(25);
     |                                ^ Error: expect(locator).toHaveCount(expected)
  16 |
  17 |     // 初期手数が 0 であることを確認
  18 |     const movesCounter = page.locator('text=/Moves: \\d+/');
  19 |     await expect(movesCounter).toContainText('Moves: 0');
  20 |
  21 |     // 履歴が最初は空か "No history yet" であることを確認 (実装による)
  22 |     const historyList = page.locator('div:has-text("History") >> ul');
  23 |     // await expect(historyList.locator('li')).toHaveCount(1); // GameInitialized のみの場合など
  24 |     // または
  25 |     // await expect(page.locator('text=No history yet.')).toBeVisible();
  26 |
  27 |     // 2. ライトをクリックする
  28 |     const firstButton = boardButtons.nth(12); // 中央のボタン (2, 2) をクリックしてみる
  29 |     const initialButtonClass = await firstButton.getAttribute('class');
  30 |     await firstButton.click();
  31 |
  32 |     // 手数が増えることを確認 (API 呼び出しと状態更新を待つ)
  33 |     await expect(movesCounter).toContainText('Moves: 1', { timeout: 5000 }); // タイムアウトを少し長めに
  34 |
  35 |     // クリックしたボタンのスタイルが変わることを確認 (例: bg-yellow-400 <=> bg-gray-600)
  36 |     await expect(firstButton).not.toHaveAttribute('class', initialButtonClass || '');
  37 |
  38 |     // 履歴が増えることを確認 (GameInitialized + LightToggled or GameWon)
  39 |     const historyItemCount = await historyList.locator('li').count();
  40 |     expect(historyItemCount).toBeGreaterThanOrEqual(2); // 2件以上あればOKとする
  41 |     await expect(historyList.locator('text=Seq 2: LightToggled (2, 2)')).toBeVisible();
  42 |
  43 |     // 3. 別のライトをクリック
  44 |     const secondButton = boardButtons.nth(0); // (0, 0)
  45 |     await secondButton.click();
  46 |     await expect(movesCounter).toContainText('Moves: 2');
  47 |     await expect(historyList.locator('li')).toHaveCount(3);
  48 |     await expect(historyList.locator('text=Seq 3: LightToggled (0, 0)')).toBeVisible();
  49 |
  50 |     // 4. 履歴をクリックして状態を戻す
  51 |     const historySeq2 = historyList.locator('text=Seq 2: LightToggled (2, 2)');
  52 |     await historySeq2.click();
  53 |
  54 |     // 盤面が Seq 2 の状態に戻っていることを確認 (特定のボタンの状態を確認)
  55 |     // Seq 2 時点での firstButton (2,2) の状態を検証するのは難しいので、手数表示で代用
  56 |     await expect(page.locator('text=/Moves: 1 \\(Viewing Seq 2\\)/')).toBeVisible();
  57 |     // 盤面操作が無効になっていることを確認 (例: disabled 属性)
  58 |     await expect(firstButton).toBeDisabled();
  59 |
  60 |     // 5. 「Back to Latest」ボタンで最新に戻る
  61 |     const backButton = page.locator('button:has-text("Back to Latest")');
  62 |     await expect(backButton).toBeVisible();
  63 |     await backButton.click();
  64 |
  65 |     // 最新の状態 (手数 2) に戻っていることを確認
  66 |     await expect(movesCounter).toContainText('Moves: 2');
  67 |     await expect(movesCounter).not.toContainText('(Viewing Seq'); // 履歴表示中でない
  68 |     await expect(firstButton).toBeEnabled(); // 操作可能に戻る
  69 |
  70 |     // 6. 「New Game」ボタンをクリック
  71 |     const newGameButton = page.locator('button:has-text("New Game")');
  72 |     await newGameButton.click();
  73 |
  74 |     // 新しいゲームが開始されるのを待つ (ローディング表示など)
  75 |     await expect(page.locator('text=Loading Game...')).toBeVisible({ timeout: 1000 }); // すぐ消えるかも
  76 |     await expect(page.locator('text=Loading Game...')).not.toBeVisible({ timeout: 10000 }); // 長めに待つ
  77 |
  78 |     // 手数が 0 に戻り、履歴がリセットされることを確認
  79 |     await expect(movesCounter).toContainText('Moves: 0');
  80 |     await expect(historyList.locator('li')).toHaveCount(1); // GameInitialized のみ
  81 |     await expect(historyList.locator('text=/Seq 1: Game Start/')).toBeVisible(); // Game Start表示に変更した場合
  82 |   });
  83 | });
  84 |
```