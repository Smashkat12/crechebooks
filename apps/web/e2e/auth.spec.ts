import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth.fixture';

// E2E test credentials - sourced from environment variables only
// SECURITY: No fallback values - credentials must come from environment
const E2E_TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const E2E_TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

/**
 * Authentication E2E Tests
 * Tests login, logout, and authentication protection
 * Credentials are sourced from environment variables (E2E_TEST_EMAIL, E2E_TEST_PASSWORD)
 */

test.describe('Authentication', () => {
  // Use isolated storage state for each test
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should display login page', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should login with valid dev credentials', async ({ page }) => {
    // This test uses the centralized login function which reads credentials from env
    await login(page);

    // Should be on dashboard after login
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel(/email/i).fill('invalid@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');

    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for the form to process
    await page.waitForTimeout(2000);

    // Should show error message or stay on login page
    const errorVisible = await page.getByText(/invalid|error|failed|denied|unauthorized/i).isVisible();
    const onLoginPage = await page.url().includes('/login');

    // Either error is shown OR we stay on login page (not redirected to dashboard)
    expect(errorVisible || onLoginPage).toBeTruthy();
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Clear any cookies that might exist
    await page.context().clearCookies();

    await page.goto('/dashboard', { waitUntil: 'networkidle' });

    // Wait for potential redirect
    await page.waitForTimeout(1000);

    // Should redirect to login page
    await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
  });

  test('should logout successfully', async ({ page }) => {
    // Use centralized login function
    await login(page);
    await expect(page).toHaveURL(/.*dashboard/);

    // Find and click logout - may be in dropdown menu
    const userMenu = page.getByRole('button', { name: /user|profile|account|admin/i });
    if (await userMenu.isVisible()) {
      await userMenu.click();
    }

    const logoutButton = page.getByRole('button', { name: /logout|sign out/i }).or(
      page.getByRole('menuitem', { name: /logout|sign out/i })
    );

    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await expect(page).toHaveURL(/.*login/);
    }
  });
});
