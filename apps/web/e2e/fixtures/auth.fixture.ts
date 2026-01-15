import { test as base, expect } from '@playwright/test';

// E2E test credentials - sourced from environment variables only
// Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in your .env.test file
// SECURITY: No fallback values - credentials must come from environment
const E2E_TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

if (!E2E_TEST_EMAIL || !E2E_TEST_PASSWORD) {
  console.warn(
    'WARNING: E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set in .env.test or tests will fail.',
  );
}

/**
 * Auth fixture that provides a properly authenticated page
 * Reusable login helper for all E2E tests
 * Credentials are sourced from environment variables (E2E_TEST_EMAIL, E2E_TEST_PASSWORD)
 */
export async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(E2E_TEST_EMAIL);
  await page.getByLabel(/password/i).fill(E2E_TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for login to complete - dashboard should be loaded
  await page.waitForURL(/.*dashboard/, { timeout: 15000 });
  await expect(page).toHaveURL(/.*dashboard/);
}

/**
 * Extended test with auth helpers
 */
export const test = base.extend<{ authenticatedPage: void }>({
  authenticatedPage: async ({ page }, use) => {
    await login(page);
    await use();
  },
});

export { expect };
