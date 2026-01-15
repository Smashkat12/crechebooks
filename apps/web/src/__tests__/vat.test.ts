/**
 * VAT Calculation Tests
 * TASK-BILL-001: Fix Frontend VAT Calculation Mismatch
 *
 * Tests for centralized VAT calculation utility ensuring correct handling of:
 * - Standard VAT calculations
 * - Item-level exemptions
 * - Organization-level exemptions
 * - Line type-based exemptions (SA VAT Act Section 12(h))
 * - Mixed basket calculations
 * - Edge cases (null values, missing flags, negative amounts)
 */

import {
  calculateVAT,
  calculateLineItemVAT,
  calculateInvoiceVAT,
  isItemVATExempt,
  isLineTypeExempt,
  getVATStatusDisplay,
  roundCurrency,
  DEFAULT_VAT_RATE,
  type VATCalculationInput,
  type LineItemInput,
  type OrganizationConfig,
} from '../lib/vat';

describe('VAT Calculation Utility', () => {
  // Default organization config for tests
  const defaultOrgConfig: OrganizationConfig = {
    defaultVatRate: 15,
    vatStatus: 'standard',
  };

  describe('roundCurrency', () => {
    it('should round to 2 decimal places', () => {
      expect(roundCurrency(10.125)).toBe(10.13);
      expect(roundCurrency(10.124)).toBe(10.12);
      expect(roundCurrency(10.1)).toBe(10.1);
      expect(roundCurrency(10)).toBe(10);
    });

    it('should handle negative values', () => {
      expect(roundCurrency(-10.125)).toBe(-10.12);
      expect(roundCurrency(-10.126)).toBe(-10.13);
    });
  });

  describe('isLineTypeExempt', () => {
    it('should return true for educational/childcare line types', () => {
      expect(isLineTypeExempt('MONTHLY_FEE')).toBe(true);
      expect(isLineTypeExempt('REGISTRATION')).toBe(true);
      expect(isLineTypeExempt('RE_REGISTRATION')).toBe(true);
      expect(isLineTypeExempt('EXTRA_MURAL')).toBe(true);
    });

    it('should return true for adjustment line types', () => {
      expect(isLineTypeExempt('DISCOUNT')).toBe(true);
      expect(isLineTypeExempt('CREDIT')).toBe(true);
    });

    it('should return false for goods/services line types', () => {
      expect(isLineTypeExempt('BOOKS')).toBe(false);
      expect(isLineTypeExempt('STATIONERY')).toBe(false);
      expect(isLineTypeExempt('UNIFORM')).toBe(false);
      expect(isLineTypeExempt('MEALS')).toBe(false);
      expect(isLineTypeExempt('TRANSPORT')).toBe(false);
      expect(isLineTypeExempt('LATE_PICKUP')).toBe(false);
      expect(isLineTypeExempt('AD_HOC')).toBe(false);
    });

    it('should return false for undefined line type', () => {
      expect(isLineTypeExempt(undefined)).toBe(false);
    });
  });

  describe('calculateVAT', () => {
    it('should calculate standard VAT at 15%', () => {
      expect(calculateVAT({ amount: 100, vatRate: 15 })).toBe(15);
      expect(calculateVAT({ amount: 200, vatRate: 15 })).toBe(30);
      expect(calculateVAT({ amount: 950, vatRate: 15 })).toBe(142.5);
    });

    it('should handle different VAT rates', () => {
      expect(calculateVAT({ amount: 100, vatRate: 10 })).toBe(10);
      expect(calculateVAT({ amount: 100, vatRate: 20 })).toBe(20);
      expect(calculateVAT({ amount: 100, vatRate: 0 })).toBe(0);
    });

    it('should return 0 for explicitly exempt items', () => {
      expect(calculateVAT({ amount: 100, vatRate: 15, isExempt: true })).toBe(0);
      expect(calculateVAT({ amount: 500, vatRate: 15, isExempt: true })).toBe(0);
    });

    it('should return 0 for exempt organization', () => {
      expect(calculateVAT({
        amount: 100,
        vatRate: 15,
        organizationVatStatus: 'exempt',
      })).toBe(0);
    });

    it('should return 0 for reverse charge organization', () => {
      expect(calculateVAT({
        amount: 100,
        vatRate: 15,
        organizationVatStatus: 'reverse_charge',
      })).toBe(0);
    });

    it('should return 0 for exempt line types', () => {
      expect(calculateVAT({
        amount: 950,
        vatRate: 15,
        lineType: 'MONTHLY_FEE',
      })).toBe(0);

      expect(calculateVAT({
        amount: 500,
        vatRate: 15,
        lineType: 'REGISTRATION',
      })).toBe(0);

      expect(calculateVAT({
        amount: 200,
        vatRate: 15,
        lineType: 'EXTRA_MURAL',
      })).toBe(0);
    });

    it('should apply VAT for taxable line types', () => {
      expect(calculateVAT({
        amount: 100,
        vatRate: 15,
        lineType: 'MEALS',
      })).toBe(15);

      expect(calculateVAT({
        amount: 50,
        vatRate: 15,
        lineType: 'TRANSPORT',
      })).toBe(7.5);

      expect(calculateVAT({
        amount: 200,
        vatRate: 15,
        lineType: 'BOOKS',
      })).toBe(30);
    });

    it('should return 0 for zero or negative amounts', () => {
      expect(calculateVAT({ amount: 0, vatRate: 15 })).toBe(0);
      expect(calculateVAT({ amount: -100, vatRate: 15 })).toBe(0);
      expect(calculateVAT({ amount: -50, vatRate: 15 })).toBe(0);
    });

    it('should round VAT amounts to 2 decimal places', () => {
      // 33.33 * 0.15 = 4.9995, should round to 5.00
      expect(calculateVAT({ amount: 33.33, vatRate: 15 })).toBe(5);

      // 22.22 * 0.15 = 3.333, should round to 3.33
      expect(calculateVAT({ amount: 22.22, vatRate: 15 })).toBe(3.33);
    });

    it('should prioritize explicit exemption over line type', () => {
      // Even if line type would normally be taxable, explicit exemption wins
      expect(calculateVAT({
        amount: 100,
        vatRate: 15,
        isExempt: true,
        lineType: 'MEALS', // Normally taxable
      })).toBe(0);
    });

    it('should prioritize organization status over line type', () => {
      expect(calculateVAT({
        amount: 100,
        vatRate: 15,
        organizationVatStatus: 'exempt',
        lineType: 'MEALS', // Normally taxable
      })).toBe(0);
    });
  });

  describe('calculateLineItemVAT', () => {
    it('should use backend-provided VAT amount if available', () => {
      const lineItem: LineItemInput = {
        amount: 100,
        vatAmount: 12, // Backend provided this
      };

      expect(calculateLineItemVAT(lineItem, defaultOrgConfig)).toBe(12);
    });

    it('should calculate VAT when backend amount not provided', () => {
      const lineItem: LineItemInput = {
        amount: 100,
        lineType: 'MEALS',
      };

      expect(calculateLineItemVAT(lineItem, defaultOrgConfig)).toBe(15);
    });

    it('should respect item-level VAT rate override', () => {
      const lineItem: LineItemInput = {
        amount: 100,
        vatRate: 10, // Override default 15%
        lineType: 'MEALS',
      };

      expect(calculateLineItemVAT(lineItem, defaultOrgConfig)).toBe(10);
    });

    it('should return 0 for exempt items', () => {
      const lineItem: LineItemInput = {
        amount: 950,
        isVatExempt: true,
      };

      expect(calculateLineItemVAT(lineItem, defaultOrgConfig)).toBe(0);
    });

    it('should return 0 for exempt line types', () => {
      const lineItem: LineItemInput = {
        amount: 950,
        lineType: 'MONTHLY_FEE',
      };

      expect(calculateLineItemVAT(lineItem, defaultOrgConfig)).toBe(0);
    });
  });

  describe('calculateInvoiceVAT', () => {
    it('should calculate VAT for single taxable item', () => {
      const lineItems: LineItemInput[] = [
        { amount: 100 },
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(100);
      expect(result.vatAmount).toBe(15);
      expect(result.total).toBe(115);
    });

    it('should calculate VAT for multiple taxable items', () => {
      const lineItems: LineItemInput[] = [
        { amount: 100 },
        { amount: 200 },
        { amount: 50 },
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(350);
      expect(result.vatAmount).toBe(52.5);
      expect(result.total).toBe(402.5);
    });

    it('should return 0 VAT for all exempt items', () => {
      const lineItems: LineItemInput[] = [
        { amount: 950, lineType: 'MONTHLY_FEE' },
        { amount: 500, lineType: 'REGISTRATION' },
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(1450);
      expect(result.vatAmount).toBe(0);
      expect(result.total).toBe(1450);
    });

    it('should handle mixed basket correctly', () => {
      const lineItems: LineItemInput[] = [
        { amount: 950, lineType: 'MONTHLY_FEE' },  // Exempt
        { amount: 100, lineType: 'MEALS' },        // Taxable: 15 VAT
        { amount: 50, isVatExempt: true },         // Exempt (explicit)
        { amount: 200, lineType: 'BOOKS' },        // Taxable: 30 VAT
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(1300);
      expect(result.vatAmount).toBe(45); // 15 + 30
      expect(result.total).toBe(1345);
    });

    it('should handle empty line items array', () => {
      const result = calculateInvoiceVAT([], defaultOrgConfig);

      expect(result.subtotal).toBe(0);
      expect(result.vatAmount).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should use backend-provided VAT amounts when available', () => {
      const lineItems: LineItemInput[] = [
        { amount: 100, vatAmount: 12 }, // Backend provided VAT
        { amount: 200, vatAmount: 25 }, // Backend provided VAT
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(300);
      expect(result.vatAmount).toBe(37); // 12 + 25
      expect(result.total).toBe(337);
    });

    it('should handle exempt organization', () => {
      const exemptOrg: OrganizationConfig = {
        defaultVatRate: 15,
        vatStatus: 'exempt',
      };

      const lineItems: LineItemInput[] = [
        { amount: 100, lineType: 'MEALS' }, // Would normally be taxable
        { amount: 200, lineType: 'BOOKS' }, // Would normally be taxable
      ];

      const result = calculateInvoiceVAT(lineItems, exemptOrg);

      expect(result.subtotal).toBe(300);
      expect(result.vatAmount).toBe(0); // All exempt due to org status
      expect(result.total).toBe(300);
    });

    it('should round totals correctly', () => {
      const lineItems: LineItemInput[] = [
        { amount: 33.33 },
        { amount: 22.22 },
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      // 33.33 + 22.22 = 55.55
      expect(result.subtotal).toBe(55.55);
      // 33.33 * 0.15 = 5.00 (rounded), 22.22 * 0.15 = 3.33
      expect(result.vatAmount).toBe(8.33);
      expect(result.total).toBe(63.88);
    });
  });

  describe('isItemVATExempt', () => {
    it('should return true for explicitly exempt items', () => {
      expect(isItemVATExempt({ isVatExempt: true })).toBe(true);
    });

    it('should return true for exempt line types', () => {
      expect(isItemVATExempt({ lineType: 'MONTHLY_FEE' })).toBe(true);
      expect(isItemVATExempt({ lineType: 'REGISTRATION' })).toBe(true);
      expect(isItemVATExempt({ lineType: 'DISCOUNT' })).toBe(true);
    });

    it('should return false for taxable line types', () => {
      expect(isItemVATExempt({ lineType: 'MEALS' })).toBe(false);
      expect(isItemVATExempt({ lineType: 'BOOKS' })).toBe(false);
      expect(isItemVATExempt({ lineType: 'TRANSPORT' })).toBe(false);
    });

    it('should return false for items without exemption indicators', () => {
      expect(isItemVATExempt({})).toBe(false);
      expect(isItemVATExempt({ vatAmount: 15 })).toBe(false);
    });
  });

  describe('getVATStatusDisplay', () => {
    it('should return "Exempt" for exempt items', () => {
      expect(getVATStatusDisplay({ isVatExempt: true })).toBe('Exempt');
      expect(getVATStatusDisplay({ lineType: 'MONTHLY_FEE' })).toBe('Exempt');
    });

    it('should return VAT rate for taxable items with VAT amount', () => {
      expect(getVATStatusDisplay({ vatAmount: 15 })).toBe('15%');
      expect(getVATStatusDisplay({ vatAmount: 15 }, 15)).toBe('15%');
    });

    it('should return null for items without clear status', () => {
      expect(getVATStatusDisplay({})).toBe(null);
      expect(getVATStatusDisplay({ vatAmount: 0 })).toBe(null);
    });

    it('should prioritize exemption over VAT amount', () => {
      expect(getVATStatusDisplay({
        isVatExempt: true,
        vatAmount: 15,
      })).toBe('Exempt');
    });
  });

  describe('DEFAULT_VAT_RATE', () => {
    it('should be 15 (South African standard rate)', () => {
      expect(DEFAULT_VAT_RATE).toBe(15);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined exemption flags gracefully', () => {
      const input: VATCalculationInput = {
        amount: 100,
        vatRate: 15,
        isExempt: undefined,
      };

      expect(calculateVAT(input)).toBe(15);
    });

    it('should handle missing vatRate by using default', () => {
      const lineItem: LineItemInput = {
        amount: 100,
        vatRate: undefined,
      };

      const result = calculateLineItemVAT(lineItem, defaultOrgConfig);
      expect(result).toBe(15); // Uses org default rate
    });

    it('should handle very large amounts', () => {
      const result = calculateVAT({ amount: 1000000, vatRate: 15 });
      expect(result).toBe(150000);
    });

    it('should handle very small amounts', () => {
      const result = calculateVAT({ amount: 0.01, vatRate: 15 });
      expect(result).toBe(0); // 0.0015 rounds to 0.00
    });

    it('should handle decimal vatRate', () => {
      const result = calculateVAT({ amount: 100, vatRate: 15.5 });
      expect(result).toBe(15.5);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should calculate typical creche monthly invoice correctly', () => {
      const lineItems: LineItemInput[] = [
        { amount: 5500, lineType: 'MONTHLY_FEE' },      // Exempt
        { amount: 200, lineType: 'EXTRA_MURAL' },       // Exempt
        { amount: 150, lineType: 'MEALS' },             // Taxable
        { amount: 300, lineType: 'TRANSPORT' },         // Taxable
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(6150);
      // Only MEALS (150) and TRANSPORT (300) are taxable
      // VAT = (150 + 300) * 0.15 = 67.50
      expect(result.vatAmount).toBe(67.5);
      expect(result.total).toBe(6217.5);
    });

    it('should calculate invoice with registration fee correctly', () => {
      const lineItems: LineItemInput[] = [
        { amount: 750, lineType: 'REGISTRATION' },      // Exempt
        { amount: 5500, lineType: 'MONTHLY_FEE' },      // Exempt
        { amount: 350, lineType: 'UNIFORM' },           // Taxable
        { amount: 200, lineType: 'BOOKS' },             // Taxable
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(6800);
      // Only UNIFORM (350) and BOOKS (200) are taxable
      // VAT = (350 + 200) * 0.15 = 82.50
      expect(result.vatAmount).toBe(82.5);
      expect(result.total).toBe(6882.5);
    });

    it('should handle invoice with discount correctly', () => {
      const lineItems: LineItemInput[] = [
        { amount: 5500, lineType: 'MONTHLY_FEE' },      // Exempt
        { amount: -500, lineType: 'DISCOUNT' },         // No VAT on discount
        { amount: 150, lineType: 'MEALS' },             // Taxable
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(5150);
      // Only MEALS (150) is taxable, discount has 0 VAT
      expect(result.vatAmount).toBe(22.5);
      expect(result.total).toBe(5172.5);
    });

    it('should handle late pickup fee correctly', () => {
      const lineItems: LineItemInput[] = [
        { amount: 5500, lineType: 'MONTHLY_FEE' },      // Exempt
        { amount: 50, lineType: 'LATE_PICKUP' },        // Taxable
      ];

      const result = calculateInvoiceVAT(lineItems, defaultOrgConfig);

      expect(result.subtotal).toBe(5550);
      expect(result.vatAmount).toBe(7.5);
      expect(result.total).toBe(5557.5);
    });
  });
});
