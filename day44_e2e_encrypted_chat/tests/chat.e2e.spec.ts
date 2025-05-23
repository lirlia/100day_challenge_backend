import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('E2E Encrypted Chat with Dynamic Keys', () => {
  const userAUsername = 'TestUserA';
  const userBUsername = 'TestUserB';
  const messageFromAToB = 'こんにちは UserB、これは UserA からの秘密のメッセージです。';
  const messageFromBToA = 'やあ UserA、UserB からの返信だよ！';
  const dbPath = path.join(__dirname, '../db/dev.db');

  test.beforeEach(async ({ page }) => {
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
        console.log(`Deleted DB at ${dbPath} for a clean test run.`);
        await page.waitForTimeout(1000); // DB削除とサーバー再起動/初期化の安定待ち
      } catch (err) {
        console.error(`Failed to delete DB: ${err}`);
      }
    }
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'アカウント管理' })).toBeVisible({timeout: 15000});
  });

  const registerUserAndVerify = async (page: Page, username: string) => {
    await page.getByPlaceholder('新しいユーザー名を入力').fill(username);
    await page.getByRole('button', { name: '登録 & 鍵生成' }).click();

    await expect(page.getByText(/^エラー:/)).not.toBeVisible({ timeout: 20000 });

    // ユーザーがドロップダウンに追加されるのをカスタム待機
    const userOptionLocator = page.locator(`#userSelect option[value="${username}"]`);
    try {
      // タイムアウトを30秒に延長
      await expect(userOptionLocator).toHaveCount(1, { timeout: 30000 });
      console.log(`User ${username} appeared in select list normally.`);
    } catch (e) {
      console.warn(`User ${username} not in select list after initial wait, starting poll...`);
      // ポーリング回数を40回 (20秒) に増やす
      for (let i = 0; i < 40; i++) {
        if (await userOptionLocator.count() === 1) {
          console.log(`User ${username} found in select list after polling (attempt ${i + 1}).`);
          break;
        }
        await page.waitForTimeout(500);
        if (i === 39) { // ループ回数に合わせて調整
          throw new Error(`User ${username} still not found in select list after extended polling.`);
        }
      }
    }

    await page.waitForTimeout(500);

    await page.getByLabel('あなたのアカウント:').selectOption({ value: username });
    await expect(page.getByText('あなたの秘密鍵がlocalStorageに見つかりません', { exact: false })).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('暗号化メッセージを入力...')).toBeVisible({ timeout: 10000 });
    console.log(`User ${username} registered, keys generated, and selected.`);
  };

  const selectCurrentUserAndVerifyKeys = async (page: Page, username: string) => {
    await page.getByLabel('あなたのアカウント:').selectOption({ value: username });
    await expect(page.locator('#recipientSelect')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('あなたの秘密鍵がlocalStorageに見つかりません', { exact: false })).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder('暗号化メッセージを入力...')).toBeVisible({ timeout: 10000 });
    console.log(`Current user selected: ${username}. Keys appear loaded.`);
  };

  const selectRecipientAndVerifyUI = async (page: Page, recipientUsername: string) => {
    await page.getByLabel('会話する相手:').selectOption({ value: recipientUsername });
    const currentUsername = await page.locator('#userSelect').inputValue();
    await expect(page.getByRole('heading', { name: `Chat with ${recipientUsername}` })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`(自分: ${currentUsername})`)).toBeVisible({timeout: 5000});
    await expect(page.getByPlaceholder('暗号化メッセージを入力...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '送信' })).toBeVisible({ timeout: 5000 });
    // 相手の公開鍵がない場合のエラーが表示されていないこと
    await expect(page.getByText(`相手 (${recipientUsername}) の公開鍵が未設定のためメッセージを送信できません。`)).not.toBeVisible({timeout: 2000});
    console.log(`Recipient selected: ${recipientUsername}. Chat UI ready.`);
  };

  const sendMessageAndVerify = async (page: Page, message: string) => {
    await page.getByPlaceholder('暗号化メッセージを入力...').fill(message);
    await page.getByRole('button', { name: '送信' }).click();
    // 送信後、入力欄がクリアされること、エラーがないことを確認
    await expect(page.getByPlaceholder('暗号化メッセージを入力...')).toHaveValue('', { timeout: 10000 });
    await expect(page.getByText(/^エラー:/)).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2500); // メッセージリスト反映とポーリングのための十分な待ち時間
    console.log(`Message sent: "${message}"`);
  };

  const verifyMessageDisplay = async (page: Page, senderUsername: string, messageText: string, isOwn: boolean, isEncryptedPlaceholder: boolean = false) => {
    let expectedTextPatternString;
    if (isEncryptedPlaceholder && isOwn) {
      // 自分が送信したメッセージのプレースホルダー（平文も見えている状態）
      expectedTextPatternString = `\\[暗号化済\\] ${messageText.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`;
    } else {
      // 他のユーザーからのメッセージ(復号済み) または 自分の送信済みメッセージの最終表示(復号後)
      expectedTextPatternString = `^${messageText.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`;
    }
    const expectedTextPattern = new RegExp(expectedTextPatternString);

    const messageLocator = page.locator('div.overflow-y-auto > div')
      .filter({ has: page.locator('p').filter({ hasText: expectedTextPattern }) })
      .filter({ has: page.locator(`p:has-text("${senderUsername}")`) });

    await expect(messageLocator).toBeVisible({ timeout: 30000 });

    if (!isOwn) {
      await expect(messageLocator.locator('span:has-text("(署名OK)")')).toBeVisible({ timeout: 10000 });
      await expect(messageLocator.locator('span:has-text("(署名検証失敗!)")')).not.toBeVisible({ timeout: 1000 });
    }

    if (isOwn) {
      await expect(messageLocator).toHaveClass(/bg-indigo-500/, { timeout: 5000 });
    } else {
      await expect(messageLocator).toHaveClass(/bg-gray-200/, { timeout: 5000 });
    }
    await page.waitForTimeout(200); // 確認後の安定待ち
  };

  test('should allow E2E encrypted 1-on-1 chat between UserA and UserB', async ({ page }) => {
    await test.step('User A registers, selects User B', async () => {
      await registerUserAndVerify(page, userAUsername);
      await selectRecipientAndVerifyUI(page, userBUsername);
    });

    await test.step('User B registers, selects User A', async () => {
      await registerUserAndVerify(page, userBUsername);
      // User B が User A を選択する前に、User A がドロップダウンに存在することを確認
      await expect(page.locator(`#recipientSelect option[value="${userAUsername}"]`)).toHaveCount(1, { timeout: 5000 });
      await selectRecipientAndVerifyUI(page, userAUsername);
    });

    await test.step('User A sends message to User B', async () => {
      // User A に切り替え
      await selectCurrentUserAndVerifyKeys(page, userAUsername);
      await selectRecipientAndVerifyUI(page, userBUsername);
      await sendMessageAndVerify(page, messageFromAToB);
      // User A の画面で送信メッセージが暗号化プレースホルダーとして表示されることを確認
      await verifyMessageDisplay(page, userAUsername, messageFromAToB, true, true);
    });

    await test.step('User B receives message from User A', async () => {
      // User B に切り替え
      await selectCurrentUserAndVerifyKeys(page, userBUsername);
      await selectRecipientAndVerifyUI(page, userAUsername);
      // User B の画面で User A からのメッセージが復号されて表示されることを確認
      await verifyMessageDisplay(page, userAUsername, messageFromAToB, false);
    });

    await test.step('User B sends reply to User A', async () => {
      // User B は選択済みのはず
      await sendMessageAndVerify(page, messageFromBToA);
      // User B の画面で送信メッセージが暗号化プレースホルダーとして表示されることを確認
      await verifyMessageDisplay(page, userBUsername, messageFromBToA, true, true);
    });

    await test.step('User A receives reply from User B', async () => {
      // User A に切り替え
      await selectCurrentUserAndVerifyKeys(page, userAUsername);
      await selectRecipientAndVerifyUI(page, userBUsername);
      // User A の画面で User B からのメッセージが復号されて表示されることを確認
      await verifyMessageDisplay(page, userBUsername, messageFromBToA, false);
      // User A が以前送信したメッセージも復号された状態で表示されているはず (ポーリングによる更新後)
      await verifyMessageDisplay(page, userAUsername, messageFromAToB, true, false);
    });
  });
});
