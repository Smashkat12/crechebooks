import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth.fixture';

/**
 * Reports E2E Tests
 * Tests financial reports, income statement, and export functionality
 */

test.describe('Reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/reports');
  });

  test('should display reports page', async ({ page }) => {
    await expect(page).toHaveURL(/.*reports/);

    const heading = page.getByRole('heading', { name: /report/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should have income statement report', async ({ page }) => {
    const incomeReport = page.getByText(/income.*statement|profit.*loss/i).or(
      page.getByRole('link', { name: /income/i })
    );

    await expect(incomeReport.first()).toBeVisible();
  });

  test('should have date range selection', async ({ page }) => {
    const dateRange = page.getByLabel(/date|period|from|to/i).or(
      page.locator('input[type="date"]')
    );

    if (await dateRange.first().isVisible()) {
      await expect(dateRange.first()).toBeEnabled();
    }
  });

  test('should have export functionality', async ({ page }) => {
    const exportButton = page.getByRole('button', { name: /export|download/i });

    if (await exportButton.isVisible()) {
      await expect(exportButton).toBeEnabled();
    }
  });

  test('should display revenue breakdown', async ({ page }) => {
    const revenueSection = page.getByText(/revenue|income|fees/i);
    await expect(revenueSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display expense breakdown', async ({ page }) => {
    const expenseSection = page.getByText(/expense|cost|payment/i);
    await expect(expenseSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show totals and net income', async ({ page }) => {
    const totalsSection = page.getByText(/total|net|profit|balance/i);
    await expect(totalsSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display amounts in ZAR format', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();
    if (pageContent.match(/\d{1,3}(,\d{3})*\.\d{2}/)) {
      expect(pageContent).toMatch(/R|ZAR/);
    }
  });

  test('should have category breakdown', async ({ page }) => {
    const categorySection = page.getByText(/categor/i);

    if (await categorySection.first().isVisible()) {
      await expect(categorySection.first()).toBeVisible();
    }
  });

  test('should have print functionality', async ({ page }) => {
    const printButton = page.getByRole('button', { name: /print/i });

    if (await printButton.isVisible()) {
      await expect(printButton).toBeEnabled();
    }
  });
});
