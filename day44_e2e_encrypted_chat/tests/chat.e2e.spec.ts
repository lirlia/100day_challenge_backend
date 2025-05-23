import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Signed Group Chat', () => {
  const userA = { username: 'UserA_PW_Group' };
  const userB = { username: 'UserB_PW_Group' };
  const messageFromA = 'こんにちは、グループ！ from A';
  const messageFromB = 'ハロー、グループ！ from B';
  const dbPath = path.join(__dirname, '../db/dev.db');

  test.beforeEach(async ({ page }) => {
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
        console.log(`Deleted DB at ${dbPath} for a clean test run.`);
        await page.waitForTimeout(200); // DB削除後の安定待ち
      } catch (err) {
        console.error(`Failed to delete DB: ${err}`);
      }
    }
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('should allow user registration and group chat flow', async ({ page }) => {
    const registerUser = async (username: string) => {
      await page.getByLabel('ユーザー名:').fill(username);
      page.once('dialog', dialog => dialog.accept()); // 登録完了のアラートを自動で閉じる
      await page.getByRole('button', { name: '登録' }).click();
      // ユーザーがselect要素に追加されたか確認
      const userOptionLocator = page.locator(`#userSelect option[value="${username}"]`);
      await expect(userOptionLocator).toHaveCount(1, { timeout: 15000 });
      // select要素が操作可能になったか確認 (ユーザー登録後、選択肢が増えるはず)
      await expect(page.locator('#userSelect')).not.toBeDisabled({ timeout: 5000});
      await page.waitForTimeout(500); // UI安定待ち
    };

    const selectCurrentUser = async (username: string) => {
      await page.getByLabel('あなたのアカウント:').selectOption({ value: username });
      // グループチャットルームのヘッダーが表示されることを確認
      await expect(page.getByRole('heading', { name: `グループチャットルーム (参加者: ${username})` })).toBeVisible({ timeout: 10000 });
      // メッセージ入力欄と送信ボタンが表示されることを確認
      await expect(page.getByPlaceholder('メッセージを入力...')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: '送信' })).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500); // UI安定待ち
    };

    const sendMessage = async (message: string) => {
      await page.getByPlaceholder('メッセージを入力...').fill(message);
      await page.getByRole('button', { name: '送信' }).click();
      // メッセージ送信後、入力欄がクリアされることを期待 (UIの挙動による)
      await expect(page.getByPlaceholder('メッセージを入力...')).toHaveValue('', { timeout: 5000 });
      await page.waitForTimeout(1000); // メッセージがリストに反映されるのを少し待つ
    };

    const verifyMessageDisplay = async (senderUsername: string, messageText: string, isOwn: boolean) => {
      const messageLocator = page.locator('div.overflow-y-auto > div').filter({
        hasText: new RegExp(`${senderUsername}.*${messageText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      });
      await expect(messageLocator).toBeVisible({ timeout: 15000 });
      // 署名検証失敗のテキストが含まれていないことを確認
      await expect(messageLocator).not.toContainText('[署名検証失敗]');
      if (isOwn) {
        await expect(messageLocator).toHaveClass(/bg-indigo-500/);
      } else {
        await expect(messageLocator).toHaveClass(/bg-gray-200/);
      }
    };

    // 1. Register UserA
    await test.step('Register User A', async () => {
      await registerUser(userA.username);
      await expect(page.locator(`#userSelect option[value="${userA.username}"]`)).toHaveText(userA.username);
    });

    // 2. Register UserB
    await test.step('Register User B', async () => {
      await registerUser(userB.username);
      await expect(page.locator(`#userSelect option[value="${userB.username}"]`)).toHaveText(userB.username);
    });

    // 3. UserA logs in and sends a message
    await test.step('User A logs in and sends a message', async () => {
      await selectCurrentUser(userA.username);
      await sendMessage(messageFromA);
      await verifyMessageDisplay(userA.username, messageFromA, true);
    });

    // 4. UserB logs in and checks UserA's message, then sends a message
    await test.step('User B logs in, checks message, and sends a message', async () => {
      await selectCurrentUser(userB.username);
      // UserAのメッセージが見えるはず
      await verifyMessageDisplay(userA.username, messageFromA, false);
      // UserBがメッセージを送信
      await sendMessage(messageFromB);
      await verifyMessageDisplay(userB.username, messageFromB, true);
    });

    // 5. UserA checks UserB's message
    await test.step('User A checks UserBs message', async () => {
      await selectCurrentUser(userA.username);
      // UserA自身のメッセージも見えるはず
      await verifyMessageDisplay(userA.username, messageFromA, true);
      // UserBのメッセージが見えるはず
      await verifyMessageDisplay(userB.username, messageFromB, false);
    });

  });
});
