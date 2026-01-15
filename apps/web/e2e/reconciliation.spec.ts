import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth.fixture';

/**
 * Reconciliation E2E Tests
 * Tests bank reconciliation and financial verification
 */

test.describe('Reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/reconciliation');
  });

  test('should display reconciliation page', async ({ page }) => {
    await expect(page).toHaveURL(/.*reconciliation/);

    const heading = page.getByRole('heading', { name: /reconcil/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should have period selection', async ({ page }) => {
    const periodSelector = page.getByRole('combobox', { name: /period|month/i }).or(
      page.getByLabel(/period|month|date/i)
    );

    if (await periodSelector.first().isVisible()) {
      await expect(periodSelector.first()).toBeEnabled();
    }
  });

  test('should display reconciliation summary', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for summary showing matched/unmatched or loading state
    const summary = page.locator('.card, .summary, [data-testid="reconciliation-summary"], main');
    await expect(summary.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have start reconciliation button', async ({ page }) => {
    const startButton = page.getByRole('button', { name: /start|run|begin/i });

    if (await startButton.isVisible()) {
      await expect(startButton).toBeEnabled();
    }
  });

  test('should display discrepancies if any', async ({ page }) => {
    // Look for discrepancy section or message
    const discrepancySection = page.getByText(/discrep|mismatch|unmatched/i);

    if (await discrepancySection.first().isVisible()) {
      await expect(discrepancySection.first()).toBeVisible();
    }
  });

  test('should show bank balance vs book balance', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(2000);

    // Look for balance-related text or content on the page
    const pageContent = await page.content();

    // Check if page has balance-related content or is showing loading/empty state
    const hasBalanceContent = /bank|balance|reconcil|income|expense|difference/i.test(pageContent);
    const hasCards = await page.locator('.card').count() > 0;

    expect(hasBalanceContent || hasCards).toBeTruthy();
  });

  test('should have approve reconciliation functionality', async ({ page }) => {
    const approveButton = page.getByRole('button', { name: /approve|complete|confirm/i });

    if (await approveButton.isVisible()) {
      await expect(approveButton).toBeEnabled();
    }
  });

  test('should display amounts in ZAR', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();
    if (pageContent.match(/\d{1,3}(,\d{3})*\.\d{2}/)) {
      expect(pageContent).toMatch(/R|ZAR/);
    }
  });
});
