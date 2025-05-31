import { test, expect } from '@playwright/test';

const PLAYER_NAME = 'テストプレイヤー1';
const CHAT_MESSAGE = 'テストメッセージこんにちは';

test.describe('タイニーレルム冒険譚 E2Eテスト', () => {
  test.beforeEach(async ({ page }) => {
    // 各テストの前にトップページにアクセスし、プレイヤーとして参加する共通処理
    await page.goto('/');
    // ページの主要な要素が表示されるのを待つ
    await expect(page.locator('h1')).toContainText('タイニーレルム冒険譚', { timeout: 10000 });

    await page.getByPlaceholder('プレイヤー名を入力').fill(PLAYER_NAME);
    await page.getByRole('button', { name: 'ゲーム開始' }).click();
    await page.waitForURL('/game');
    // ゲームページにプレイヤー名が表示されることを確認
    await expect(page.locator('body')).toContainText(PLAYER_NAME, { timeout: 10000 }); // ポーリング待機も考慮
  });

  test('1. プレイヤーがゲームに参加できること', async ({ page }) => {
    // beforeEachで参加処理は完了しているので、ここではURLとプレイヤー名の表示を再確認
    expect(page.url()).toContain('/game');
    await expect(page.locator('header')).toContainText(`ようこそ、${PLAYER_NAME} さん！`);
    // PlayerHUDにも名前があるか
    await expect(page.locator('aside')).toContainText(PLAYER_NAME);
  });

  test('2. プレイヤーがキーボードで移動できること', async ({ page }) => {
    const getPlayerPositionFromHUD = async () => {
      const hudText = await page.locator('aside').textContent();
      const match = hudText?.match(/位置: \((\d+), (\d+)\)/);
      if (!match) throw new Error('PlayerHUDから座標を読み取れませんでした。');
      return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
    };

    const initialPos = await getPlayerPositionFromHUD();
    const initialHudText = await page.locator('aside').textContent(); // 初期HUDテキスト

    // 右に移動
    await page.keyboard.press('ArrowRight');
    // HUDのテキストが変化するのを待つ
    await expect(page.locator('aside')).not.toHaveText(initialHudText!, { timeout: POLLING_INTERVAL_MS + 2000 }); // タイムアウトは少し長めに
    // API反映とUI更新を少し待つ (念のため)
    await page.waitForTimeout(500);

    let currentPos = await getPlayerPositionFromHUD();
    expect(currentPos.x).toBeGreaterThan(initialPos.x);
    expect(currentPos.y).toBe(initialPos.y);

    const posAfterRightMove = currentPos;
    const hudTextAfterRightMove = await page.locator('aside').textContent(); // 右移動後のHUDテキスト

    // 下に移動
    await page.keyboard.press('ArrowDown');
    // HUDのテキストが変化するのを待つ
    await expect(page.locator('aside')).not.toHaveText(hudTextAfterRightMove!, { timeout: POLLING_INTERVAL_MS + 2000 });
    await page.waitForTimeout(500);

    currentPos = await getPlayerPositionFromHUD();
    expect(currentPos.y).toBeGreaterThan(posAfterRightMove.y);
    expect(currentPos.x).toBe(posAfterRightMove.x);
  });

  test('3. チャットメッセージを送信できること', async ({ page }) => {
    await page.getByPlaceholder('メッセージを入力...').fill(CHAT_MESSAGE);
    await page.getByRole('button', { name: '送信' }).click();

    // チャットウィンドウに送信したメッセージが表示されるのを待つ
    // メッセージはプレイヤー名を含むので、それも込みで確認
    const chatWindow = page.locator('main > div:last-child'); // ChatWindowコンテナを特定
    await expect(chatWindow).toContainText(CHAT_MESSAGE, { timeout: 5000 });
    await expect(chatWindow).toContainText(PLAYER_NAME, { timeout: 5000 }); // 自分の名前も出ているはず
  });

});

const POLLING_INTERVAL_MS = 3000; // game/page.tsx と合わせる
