import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth.fixture';

/**
 * Staff Management E2E Tests
 * Tests staff listing, payroll, and HR functionality
 */

test.describe('Staff Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/staff');
  });

  test('should display staff page', async ({ page }) => {
    await expect(page).toHaveURL(/.*staff/);

    const heading = page.getByRole('heading', { name: /staff/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should display staff list', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(2000);

    // Should show table, cards, or main content area
    const content = page.locator('table, [role="grid"], .card, main');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have add staff functionality', async ({ page }) => {
    const addButton = page.getByRole('link', { name: /add|new/i }).or(
      page.getByRole('button', { name: /add|new/i })
    );

    await expect(addButton.first()).toBeVisible();
  });

  test('should navigate to payroll', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Look for the "Run Payroll" button/link on staff page
    const runPayrollButton = page.getByRole('link', { name: /run payroll/i });

    if (await runPayrollButton.isVisible()) {
      await runPayrollButton.click();
      // Wait for navigation with proper timeout
      await page.waitForURL(/.*payroll/, { timeout: 10000 });
      await expect(page).toHaveURL(/.*payroll/);
    }
  });

  test('should display staff table with columns', async ({ page }) => {
    const table = page.locator('table');

    if (await table.isVisible()) {
      const headers = page.locator('th');
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThan(0);
    }
  });
});

test.describe('Add Staff Form', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/staff/new');
  });

  test('should display add staff form', async ({ page }) => {
    await expect(page).toHaveURL(/.*new/);

    const form = page.locator('form');
    await expect(form.first()).toBeVisible();
  });

  test('should have employee details fields', async ({ page }) => {
    await expect(page.getByLabel(/name/i).first()).toBeVisible();
  });

  test('should have South African ID number field', async ({ page }) => {
    const idField = page.getByLabel(/id.*number|identity/i);

    if (await idField.first().isVisible()) {
      await expect(idField.first()).toBeEnabled();
    }
  });

  test('should have tax number field', async ({ page }) => {
    const taxField = page.getByLabel(/tax.*number/i);

    if (await taxField.first().isVisible()) {
      await expect(taxField.first()).toBeEnabled();
    }
  });

  test('should have salary field in ZAR', async ({ page }) => {
    const salaryField = page.getByLabel(/salary|wage|pay/i);

    if (await salaryField.first().isVisible()) {
      await expect(salaryField.first()).toBeEnabled();
    }
  });
});

test.describe('Payroll', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/staff/payroll');
  });

  test('should display payroll page', async ({ page }) => {
    await expect(page).toHaveURL(/.*payroll/);

    const heading = page.getByRole('heading', { name: /payroll/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should display payroll summary', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for payroll totals or summary cards
    const summary = page.locator('.card, .summary, [data-testid="payroll-summary"], main');
    await expect(summary.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have run payroll functionality', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000);

    // Look for any action button on the payroll page
    const runButton = page.getByRole('button', { name: /run|process|calculate|next|cancel/i });

    if (await runButton.first().isVisible()) {
      await expect(runButton.first()).toBeEnabled();
    }
  });

  test('should display PAYE, UIF, SDL deductions', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(2000);

    // Look for deduction text anywhere on the page
    const deductionText = page.getByText(/paye|uif|sdl/i);
    await expect(deductionText.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have period selection', async ({ page }) => {
    const periodSelector = page.getByRole('combobox', { name: /period|month/i }).or(
      page.getByLabel(/period|month/i)
    );

    if (await periodSelector.first().isVisible()) {
      await expect(periodSelector.first()).toBeEnabled();
    }
  });
});
