import { test as base, expect } from '@playwright/test';

/**
 * Auth fixture that provides a properly authenticated page
 * Reusable login helper for all E2E tests
 */
export async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
  await page.getByLabel(/password/i).fill('admin123');
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
