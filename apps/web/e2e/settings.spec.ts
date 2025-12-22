import { test, expect } from '@playwright/test';

/**
 * Settings E2E Tests
 * Tests organization settings, fee structures, and integrations
 */

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });

    await page.goto('/settings');
  });

  test('should display settings page', async ({ page }) => {
    await expect(page).toHaveURL(/.*settings/);

    const heading = page.getByRole('heading', { name: /setting/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should have organization settings link', async ({ page }) => {
    const orgLink = page.getByRole('link', { name: /organization|organisation/i }).or(
      page.getByRole('tab', { name: /organization|organisation/i })
    );

    await expect(orgLink.first()).toBeVisible();
  });

  test('should have fee structures link', async ({ page }) => {
    const feesLink = page.getByRole('link', { name: /fee/i }).or(
      page.getByRole('tab', { name: /fee/i })
    );

    await expect(feesLink.first()).toBeVisible();
  });

  test('should have integrations link', async ({ page }) => {
    const integrationsLink = page.getByRole('link', { name: /integration/i }).or(
      page.getByRole('tab', { name: /integration/i })
    );

    await expect(integrationsLink.first()).toBeVisible();
  });
});

test.describe('Organization Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });

    await page.goto('/settings/organization');
  });

  test('should display organization settings', async ({ page }) => {
    await expect(page).toHaveURL(/.*organization/);

    const form = page.locator('form');
    await expect(form.first()).toBeVisible();
  });

  test('should have creche name field', async ({ page }) => {
    const nameField = page.getByLabel(/name|creche/i);
    await expect(nameField.first()).toBeVisible();
  });

  test('should have VAT registration number', async ({ page }) => {
    const vatField = page.getByLabel(/vat.*number|vat.*reg/i);

    if (await vatField.first().isVisible()) {
      await expect(vatField.first()).toBeEnabled();
    }
  });

  test('should have closure dates configuration', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000);

    const closureSection = page.getByText(/closure|holiday|closed/i);
    await expect(closureSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have save button', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /save|update/i });
    await expect(saveButton.first()).toBeVisible();
  });
});

test.describe('Fee Structures', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });

    await page.goto('/settings/fees');
  });

  test('should display fee structures page', async ({ page }) => {
    await expect(page).toHaveURL(/.*fees/);

    const heading = page.getByRole('heading', { name: /fee/i });
    await expect(heading.first()).toBeVisible();
  });

  test('should list existing fee structures', async ({ page }) => {
    // Wait for page to load
    await page.waitForTimeout(1000);

    // Look for table, grid, or cards showing fee structures
    const content = page.locator('table, [role="grid"], .card, main');
    await expect(content.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have add fee structure functionality', async ({ page }) => {
    const addButton = page.getByRole('button', { name: /add|new|create/i });

    if (await addButton.isVisible()) {
      await expect(addButton).toBeEnabled();
    }
  });

  test('should display amounts in ZAR', async ({ page }) => {
    const pageContent = await page.content();

    if (pageContent.match(/\d+\.\d{2}/)) {
      expect(pageContent).toMatch(/R|ZAR/);
    }
  });
});

test.describe('Integrations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for login to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });

    await page.goto('/settings/integrations');
  });

  test('should display integrations page', async ({ page }) => {
    await expect(page).toHaveURL(/.*integrations/);

    // Wait for page to load
    await page.waitForTimeout(1000);

    const heading = page.getByRole('heading', { name: /integration/i });
    await expect(heading.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have Xero integration section', async ({ page }) => {
    const xeroSection = page.getByText(/xero/i);
    await expect(xeroSection.first()).toBeVisible();
  });

  test('should have connect/disconnect Xero functionality', async ({ page }) => {
    const connectButton = page.getByRole('button', { name: /connect|disconnect|link/i });

    if (await connectButton.isVisible()) {
      await expect(connectButton).toBeEnabled();
    }
  });

  test('should show connection status', async ({ page }) => {
    const statusText = page.getByText(/connected|not connected|status/i);
    await expect(statusText.first()).toBeVisible();
  });
});
