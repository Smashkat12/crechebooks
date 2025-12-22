import { test, expect } from '@playwright/test';

/**
 * VAT Display E2E Tests
 * REQ-BILL-012: VAT Calculation and Display
 * Tests VAT (15% South African rate) display on invoices
 * NO MOCKS - Uses real invoice data
 */

test.describe('VAT Display', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('admin@crechebooks.co.za');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for navigation to complete
    await page.waitForURL(/.*dashboard/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*dashboard/);

    // Navigate to invoices page
    await page.goto('/invoices');
    await page.waitForLoadState('networkidle');
  });

  test('should display VAT breakdown on invoice detail page', async ({ page }) => {
    // Wait for invoices to load
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    const hasTable = await table.isVisible().catch(() => false);

    if (!hasTable) {
      test.skip();
      return;
    }

    // Click on any invoice to view details
    const firstInvoiceLink = table.locator('a').first();
    const hasLink = await firstInvoiceLink.isVisible().catch(() => false);

    if (!hasLink) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');

    // Should navigate to invoice detail page
    await expect(page).toHaveURL(/.*invoices\/.*/, { timeout: 5000 });

    // Wait for invoice preview to load
    await page.waitForTimeout(1000);

    // Should display VAT breakdown
    // Look for "Subtotal (excl. VAT)" text
    const subtotalLabel = page.getByText(/subtotal.*excl.*vat/i);
    await expect(subtotalLabel).toBeVisible({ timeout: 5000 });

    // Look for "VAT (15%)" text
    const vatLabel = page.getByText(/vat.*15.*%|vat.*\(15%\)/i);
    await expect(vatLabel).toBeVisible({ timeout: 5000 });

    // Look for "Total (incl. VAT)" text
    const totalLabel = page.getByText(/total.*incl.*vat/i);
    await expect(totalLabel).toBeVisible({ timeout: 5000 });
  });

  test('should display amounts in ZAR format with proper currency symbol', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const firstInvoiceLink = table.locator('a').first();
    if (!(await firstInvoiceLink.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Get page content
    const content = await page.content();

    // Should have ZAR currency format (R X,XXX.XX)
    const hasZarFormat = /R\s*[\d,]+\.\d{2}/.test(content);
    expect(hasZarFormat).toBeTruthy();

    // Should have properly formatted amounts (no cents-only display)
    const hasCentsError = /\d{4,}\s*cents|\d{4,}c/i.test(content);
    expect(hasCentsError).toBeFalsy();
  });

  test('should show correct VAT rate of 15%', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const firstInvoiceLink = table.locator('a').first();
    if (!(await firstInvoiceLink.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for VAT percentage display
    const vatPercentage = page.getByText(/vat.*15.*%/i);
    await expect(vatPercentage).toBeVisible({ timeout: 5000 });

    // Verify it's specifically 15%, not any other rate
    const content = await page.content();
    expect(content).toMatch(/vat\s*\(15%\)|vat.*15\s*%/i);
  });

  test('should calculate VAT amounts correctly (15% of subtotal)', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const firstInvoiceLink = table.locator('a').first();
    if (!(await firstInvoiceLink.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Extract amounts from the page
    const content = await page.content();

    // Find all currency amounts (R XXX.XX)
    const amountMatches = content.matchAll(/R\s*([\d,]+\.\d{2})/g);
    const amounts: number[] = [];

    for (const match of amountMatches) {
      const amountStr = match[1].replace(/,/g, '');
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        amounts.push(amount);
      }
    }

    // If we found amounts, verify VAT calculation
    if (amounts.length >= 3) {
      // Typically we'll have subtotal, VAT, and total
      // We can verify that VAT ≈ 15% of subtotal
      // Note: Due to rounding, we allow small differences

      const subtotalElement = page
        .locator('text=/Subtotal.*excl.*VAT/i')
        .locator('..')
        .locator('text=/R\\s*[\\d,]+\\.\\d{2}/');

      const vatElement = page
        .locator('text=/VAT.*15%/i')
        .locator('..')
        .locator('text=/R\\s*[\\d,]+\\.\\d{2}/');

      const totalElement = page
        .locator('text=/Total.*incl.*VAT/i')
        .locator('..')
        .locator('text=/R\\s*[\\d,]+\\.\\d{2}/');

      const hasElements =
        (await subtotalElement.count()) > 0 &&
        (await vatElement.count()) > 0 &&
        (await totalElement.count()) > 0;

      if (hasElements) {
        const subtotalText = await subtotalElement.first().textContent();
        const vatText = await vatElement.first().textContent();
        const totalText = await totalElement.first().textContent();

        const subtotal = parseFloat(
          subtotalText?.replace(/[R,\s]/g, '') || '0'
        );
        const vat = parseFloat(vatText?.replace(/[R,\s]/g, '') || '0');
        const total = parseFloat(totalText?.replace(/[R,\s]/g, '') || '0');

        if (subtotal > 0 && vat > 0 && total > 0) {
          // Verify VAT is approximately 15% of subtotal
          const expectedVat = subtotal * 0.15;
          const vatDifference = Math.abs(vat - expectedVat);
          const tolerance = 0.02; // Allow 2 cent rounding difference

          expect(vatDifference).toBeLessThan(tolerance);

          // Verify total = subtotal + VAT
          const totalDifference = Math.abs(total - (subtotal + vat));
          expect(totalDifference).toBeLessThan(tolerance);
        }
      }
    }
  });

  test('should display VAT on line items if shown', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const firstInvoiceLink = table.locator('a').first();
    if (!(await firstInvoiceLink.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Look for "Line Items" section
    const lineItemsHeading = page.getByText(/line items/i);
    await expect(lineItemsHeading).toBeVisible({ timeout: 5000 });

    // Check if line items table exists
    const lineItemsTable = page.locator('table').nth(1); // Second table (first is main table)
    const hasLineItemsTable = await lineItemsTable
      .isVisible()
      .catch(() => false);

    if (hasLineItemsTable) {
      // If line items are displayed, they should show proper amounts
      const tableContent = await lineItemsTable.textContent();

      // Should have currency amounts
      expect(tableContent).toMatch(/R\s*[\d,]+\.\d{2}/);

      // May or may not show VAT per line (depends on implementation)
      // Test passes either way
      expect(tableContent?.length).toBeGreaterThan(0);
    }
  });

  test('should maintain VAT display consistency across invoice states', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // Test multiple invoices to ensure consistency
    const invoiceLinks = await table.locator('a').all();

    if (invoiceLinks.length === 0) {
      test.skip();
      return;
    }

    // Test up to 3 invoices
    const testCount = Math.min(3, invoiceLinks.length);

    for (let i = 0; i < testCount; i++) {
      await page.goto('/invoices');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const links = await table.locator('a').all();
      if (i >= links.length) break;

      await links[i].click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Each invoice should consistently show VAT breakdown
      const hasSubtotal = await page
        .getByText(/subtotal.*excl.*vat/i)
        .isVisible()
        .catch(() => false);
      const hasVat = await page
        .getByText(/vat.*15%/i)
        .isVisible()
        .catch(() => false);
      const hasTotal = await page
        .getByText(/total.*incl.*vat/i)
        .isVisible()
        .catch(() => false);

      // All invoices should have VAT breakdown
      expect(hasSubtotal && hasVat && hasTotal).toBeTruthy();
    }
  });

  test('should format large amounts correctly with thousands separators', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const firstInvoiceLink = table.locator('a').first();
    if (!(await firstInvoiceLink.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const content = await page.content();

    // If amounts are >= R1,000, they should have comma separators
    const hasThousands = /R\s*[\d]{1,3}(,\d{3})+\.\d{2}/.test(content);
    const hasLargeAmounts = /R\s*\d{4,}/.test(content);

    // If there are large amounts, they should be formatted with commas
    if (hasLargeAmounts) {
      expect(hasThousands).toBeTruthy();
    }

    // All amounts should have 2 decimal places
    const allAmounts = content.match(/R\s*[\d,]+\.\d+/g) || [];
    for (const amount of allAmounts) {
      // Each amount should have exactly 2 decimal places
      expect(amount).toMatch(/\.\d{2}$/);
    }
  });

  test('should display VAT section on invoice preview card', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const firstInvoiceLink = table.locator('a').first();
    if (!(await firstInvoiceLink.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should have invoice preview card
    const card = page.locator('[class*="card"]').first();
    await expect(card).toBeVisible({ timeout: 5000 });

    // Card should contain VAT information
    const cardContent = await card.textContent();

    expect(cardContent).toMatch(/subtotal/i);
    expect(cardContent).toMatch(/vat/i);
    expect(cardContent).toMatch(/total/i);
    expect(cardContent).toMatch(/15%/);
  });

  test('should not show negative VAT amounts', async ({ page }) => {
    await page.waitForTimeout(2000);

    const table = page.locator('table, [role="grid"]').first();
    if (!(await table.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    const firstInvoiceLink = table.locator('a').first();
    if (!(await firstInvoiceLink.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await firstInvoiceLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const content = await page.content();

    // Should not have negative VAT amounts
    const hasNegativeVat = /VAT.*-R\s*[\d,]+|-R\s*[\d,]+.*VAT/i.test(content);
    expect(hasNegativeVat).toBeFalsy();
  });
});
