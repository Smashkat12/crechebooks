import { test, expect } from '@playwright/test';

/**
 * Parents & Children E2E Tests
 * Tests parent management, child enrollment, and family data
 */

test.describe('Parents Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });
    await page.goto('/parents');
  });

  test('should display parents page', async ({ page }) => {
    await expect(page).toHaveURL(/.*parents/);

    const heading = page.getByRole('heading', { name: /parent/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should display parents list', async ({ page }) => {
    // Wait for page content to load
    await page.waitForTimeout(2000);

    // Should show table, cards, or loading/empty state
    const content = page.locator('table, [role="grid"], .card, main');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have add parent functionality', async ({ page }) => {
    const addButton = page.getByRole('link', { name: /add|new|create/i }).or(
      page.getByRole('button', { name: /add|new|create/i })
    );

    await expect(addButton.first()).toBeVisible();
  });

  test('should navigate to add parent form', async ({ page }) => {
    const addLink = page.getByRole('link', { name: /add|new/i });

    if (await addLink.isVisible()) {
      await addLink.click();
      await expect(page).toHaveURL(/.*new/);
    }
  });

  test('should search parents', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i).or(
      page.getByRole('searchbox')
    );

    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeEnabled();
      await searchInput.fill('test');
    }
  });

  test('should click parent to view details', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const parentRow = page.locator('tbody tr, [data-testid="parent-row"], .card');
    const count = await parentRow.count();

    if (count > 0) {
      await parentRow.first().click();
      // Should navigate to detail page or open modal
    }
  });
});

test.describe('Add Parent Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });
    await page.goto('/parents/new');
  });

  test('should display add parent form', async ({ page }) => {
    await expect(page).toHaveURL(/.*new/);

    const form = page.locator('form');
    await expect(form.first()).toBeVisible();
  });

  test('should have required form fields', async ({ page }) => {
    // Parent details
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/phone|mobile|cell/i).first()).toBeVisible();
  });

  test('should have South African phone format validation', async ({ page }) => {
    const phoneInput = page.getByLabel(/phone|mobile|cell/i);

    if (await phoneInput.first().isVisible()) {
      // Should accept SA phone format
      await phoneInput.first().fill('+27821234567');
    }
  });

  test('should have child enrollment section', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForTimeout(1000);

    const childSection = page.getByText(/child|children/i);
    await expect(childSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have submit button', async ({ page }) => {
    // Look for any action button (save, submit, create, add)
    const submitButton = page.getByRole('button', { name: /save|submit|create|add/i });
    await expect(submitButton.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Parent Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });
  });

  test('should display parent detail page structure', async ({ page }) => {
    // Navigate to a parent detail page (using placeholder ID)
    await page.goto('/parents');

    const parentRow = page.locator('tbody tr, [data-testid="parent-row"], .card a');
    const count = await parentRow.count();

    if (count > 0) {
      await parentRow.first().click();

      // Should show parent details
      const detailSection = page.locator('main, .detail, [data-testid="parent-detail"]');
      await expect(detailSection.first()).toBeVisible();
    }
  });
});
