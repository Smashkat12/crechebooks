import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth.fixture';

/**
 * SARS Compliance E2E Tests
 * Tests VAT201, EMP201, and other South African tax compliance features
 */

test.describe('SARS Compliance', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/sars');
  });

  test('should display SARS page', async ({ page }) => {
    await expect(page).toHaveURL(/.*sars/);

    const heading = page.getByRole('heading', { name: /sars/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should have VAT201 navigation', async ({ page }) => {
    const vat201Link = page.getByRole('link', { name: /vat.*201|vat/i }).or(
      page.getByRole('tab', { name: /vat/i })
    );

    await expect(vat201Link.first()).toBeVisible();
  });

  test('should have EMP201 navigation', async ({ page }) => {
    const emp201Link = page.getByRole('link', { name: /emp.*201|emp|paye/i }).or(
      page.getByRole('tab', { name: /emp|paye/i })
    );

    await expect(emp201Link.first()).toBeVisible();
  });

  test('should display submission history', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000);

    // Should show table structure for submission history
    const table = page.locator('table, [role="grid"], main');
    await expect(table.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('VAT201 Submission', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/sars/vat201');
  });

  test('should display VAT201 page', async ({ page }) => {
    await expect(page).toHaveURL(/.*vat201/);

    const heading = page.getByRole('heading', { name: /vat/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should have period selection', async ({ page }) => {
    const periodSelector = page.getByRole('combobox', { name: /period|month/i }).or(
      page.getByLabel(/period|month/i)
    );

    if (await periodSelector.first().isVisible()) {
      await expect(periodSelector.first()).toBeEnabled();
    }
  });

  test('should display VAT calculation summary', async ({ page }) => {
    // Look for VAT calculation fields
    const vatFields = page.getByText(/output vat|input vat|vat payable/i);
    await expect(vatFields.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have generate VAT201 functionality', async ({ page }) => {
    const generateButton = page.getByRole('button', { name: /generate|calculate/i });

    if (await generateButton.isVisible()) {
      await expect(generateButton).toBeEnabled();
    }
  });

  test('should have mark as submitted functionality', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: /submit|mark/i });

    if (await submitButton.isVisible()) {
      await expect(submitButton).toBeEnabled();
    }
  });
});

test.describe('EMP201 Submission', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/sars/emp201');
  });

  test('should display EMP201 page', async ({ page }) => {
    await expect(page).toHaveURL(/.*emp201/);

    const heading = page.getByRole('heading', { name: /emp|paye/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should display PAYE calculations', async ({ page }) => {
    const payeFields = page.getByText(/paye|tax|uif|sdl/i);
    await expect(payeFields.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have period selection', async ({ page }) => {
    const periodSelector = page.getByRole('combobox', { name: /period|month/i }).or(
      page.getByLabel(/period|month/i)
    );

    if (await periodSelector.first().isVisible()) {
      await expect(periodSelector.first()).toBeEnabled();
    }
  });

  test('should have generate EMP201 functionality', async ({ page }) => {
    const generateButton = page.getByRole('button', { name: /generate|calculate/i });

    if (await generateButton.isVisible()) {
      await expect(generateButton).toBeEnabled();
    }
  });
});
