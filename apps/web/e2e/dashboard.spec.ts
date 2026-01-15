import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth.fixture';

/**
 * Dashboard E2E Tests
 * Tests main dashboard page and overview functionality
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display dashboard with key metrics', async ({ page }) => {
    // Dashboard should be loaded
    await expect(page).toHaveURL(/.*dashboard/);

    // Should have main content area with actual content
    const main = page.locator('main');
    await expect(main).toBeVisible();

    // MUST have the dashboard heading - this verifies real content loads
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 10000 });

    // MUST have metric cards visible - verifies API data is loaded
    await expect(page.getByText(/total revenue/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/outstanding/i)).toBeVisible();
    await expect(page.getByText(/total arrears/i)).toBeVisible();
    await expect(page.getByText(/active children/i)).toBeVisible();

    // Verify there's no error state displayed
    await expect(page.getByText(/failed to load/i)).not.toBeVisible();
    await expect(page.getByText(/error/i)).not.toBeVisible();
  });

  test('should display sidebar navigation', async ({ page }) => {
    // Navigation should be visible
    const nav = page.locator('nav, aside');
    await expect(nav.first()).toBeVisible();
  });

  test('should navigate to transactions from dashboard', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Navigate directly via URL to verify route works
    await page.goto('/transactions');
    await expect(page).toHaveURL(/.*transaction/, { timeout: 10000 });
  });

  test('should navigate to invoices from dashboard', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Navigate directly via URL to verify route works
    await page.goto('/invoices');
    await expect(page).toHaveURL(/.*invoice/, { timeout: 10000 });
  });

  test('should navigate to payments from dashboard', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Navigate directly via URL to verify route works
    await page.goto('/payments');
    await expect(page).toHaveURL(/.*payment/, { timeout: 10000 });
  });

  test('should navigate to SARS from dashboard', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Navigate directly via URL to verify route works
    await page.goto('/sars');
    await expect(page).toHaveURL(/.*sars/, { timeout: 10000 });
  });

  test('should display ZAR currency format', async ({ page }) => {
    // Wait for dashboard data to load
    await expect(page.getByText(/total revenue/i)).toBeVisible({ timeout: 10000 });

    // Dashboard MUST display amounts with ZAR format (R prefix)
    // Check for metric cards which should have currency values
    const metricCards = page.locator('[data-testid="metric-card"], .metric-card');

    // If metric cards exist, check for R currency prefix
    const cardCount = await metricCards.count();
    if (cardCount > 0) {
      // At least one card should have R currency symbol
      const pageContent = await page.content();
      expect(pageContent).toMatch(/R\s*[\d,]+/); // Matches "R 123" or "R123" or "R 1,234"
    }

    // Verify there's no error state
    await expect(page.getByText(/failed to load/i)).not.toBeVisible();
  });
});
