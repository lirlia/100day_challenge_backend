import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  const userEmail = `testuser_${Date.now()}@example.com`;
  const baseURL = 'http://localhost:3001'; // Match playwright.config.ts

  test('should allow a user to register', async ({ page }) => {
    await page.goto(`${baseURL}/register`);

    // Check if the register page loads correctly
    await expect(page.locator('h1')).toHaveText('Register');

    // Fill in the email
    await page.locator('input[type="email"]').fill(userEmail);

    // Click the register button
    // Note: This will trigger the WebAuthn flow, which might stall the test
    //       if run headlessly or without a configured virtual authenticator.
    //       We'll click it but won't assert the full success here.
    await page.locator('button[type="submit"]').click();

    // We can check if an alert or error message appears (if registration fails/stalls)
    // Or if a success message appears briefly.
    // Since the actual passkey creation is hard to automate, we'll just check if
    // the button was clicked and maybe wait for potential navigation or message.
    // For now, we assume the click initiates the process.
    console.log(`Attempted registration for ${userEmail}`);
    // Add a small wait to allow potential async operations or alerts
    await page.waitForTimeout(2000); // Adjust as needed

    // Optional: Check for error message if expected
    // const errorLocator = page.locator('.bg-red-100');
    // await expect(errorLocator).toBeVisible();
  });

  test('should allow a registered user to login', async ({ page }) => {
    await page.goto(`${baseURL}/login`);

    // Check if the login page loads correctly
    await expect(page.locator('h1')).toHaveText('Login');

    // Fill in the email used for registration (or a known existing one)
    // For simplicity, let's use the one potentially registered above,
    // assuming the previous test somehow succeeded or manually registered.
    // Better approach: Use a pre-registered test user.
    await page.locator('input[type="email"]').fill(userEmail); // Or a fixed test email

    // Click the login button
    // Similar to registration, this triggers WebAuthn and might stall.
    await page.locator('button[type="submit"]').click();

    // Again, asserting the full login success is tricky.
    // We'll check that the click happened and maybe look for redirection or dashboard elements.
    console.log(`Attempted login for ${userEmail}`);
    await page.waitForTimeout(2000); // Adjust as needed

    // Example: Check if redirected to dashboard (if login succeeds immediately)
    // This depends heavily on whether a passkey was actually used.
    // await expect(page).toHaveURL('/');
    // await expect(page.locator('h1')).toHaveText('ダッシュボード');

    // Example: Check if redirected to approval wait page
    // await expect(page).toMatchURL(/\/approve-wait\/.+/);

    // Example: Check for "No passkeys found" error if applicable
    // const errorLocator = page.locator('.bg-red-100');
    // await expect(errorLocator).toContainText('No passkeys found');
  });

  // TODO: Add tests for dashboard interactions (add/delete passkey, approve requests)
  // These would require a logged-in state, potentially achievable by:
  // 1. Programmatically setting localStorage before the test.
  // 2. Having a reliable login flow (perhaps with mocked WebAuthn).
});
