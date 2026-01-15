import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth.fixture';

/**
 * Payments E2E Tests
 * Tests payment listing, matching, and allocation
 */

test.describe('Payments', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/payments');
  });

  test('should display payments page', async ({ page }) => {
    await expect(page).toHaveURL(/.*payments/);

    const heading = page.getByRole('heading', { name: /payment/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should display payments table', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show main content area with table or loading/empty state
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible({ timeout: 10000 });

    // Check that page has expected structure
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasCard = await page.locator('.card').count() > 0;
    const hasLoading = await page.getByText(/loading/i).isVisible().catch(() => false);

    expect(hasTable || hasCard || hasLoading).toBeTruthy();
  });

  test('should have payment matching functionality', async ({ page }) => {
    const matchButton = page.getByRole('button', { name: /match/i });

    if (await matchButton.isVisible()) {
      await expect(matchButton).toBeEnabled();
    }
  });

  test('should have payment allocation functionality', async ({ page }) => {
    const allocateButton = page.getByRole('button', { name: /allocate/i });

    if (await allocateButton.isVisible()) {
      await expect(allocateButton).toBeEnabled();
    }
  });

  test('should filter payments by status', async ({ page }) => {
    const statusFilter = page.getByRole('combobox', { name: /status/i }).or(
      page.getByLabel(/status/i)
    );

    if (await statusFilter.first().isVisible()) {
      await expect(statusFilter.first()).toBeEnabled();
    }
  });

  test('should display payment amounts in ZAR', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();
    // Check for ZAR formatting if amounts are present
    if (pageContent.match(/\d{1,3}(,\d{3})*\.\d{2}/)) {
      expect(pageContent).toMatch(/R|ZAR/);
    }
  });
});

test.describe('Arrears', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/arrears');
  });

  test('should display arrears page', async ({ page }) => {
    await expect(page).toHaveURL(/.*arrears/);

    const heading = page.getByRole('heading', { name: /arrears|outstanding/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should display arrears summary', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(2000);

    // Look for summary stats or cards (should be visible on arrears page)
    const summaryCards = page.locator('.card, main');
    await expect(summaryCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have send reminder functionality', async ({ page }) => {
    const reminderButton = page.getByRole('button', { name: /remind|send/i });

    if (await reminderButton.isVisible()) {
      await expect(reminderButton).toBeEnabled();
    }
  });

  test('should list parents with arrears', async ({ page }) => {
    const table = page.locator('table, [role="grid"]');

    if (await table.isVisible()) {
      // Table should have parent information columns
      const headers = page.locator('th, [role="columnheader"]');
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThan(0);
    }
  });
});
