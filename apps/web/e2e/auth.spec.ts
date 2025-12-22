import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests login, logout, and authentication protection
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

  test('should show dev mode hint in development', async ({ page }) => {
    await page.goto('/login');

    // Dev mode should show test credentials hint
    await expect(page.getByText(/admin@crechebooks.co.za/)).toBeVisible();
  });

  test('should login with valid dev credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in credentials
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');

    // Submit form
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for navigation to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });

    // Should be on dashboard
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
    // First login
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for navigation to dashboard
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });
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
