/**
 * TASK-BILL-004: Credit Balance VAT Recalculation Tests
 *
 * Tests for proportional VAT recalculation when credits are applied to invoices.
 * Ensures accurate VAT reporting after credit application.
 *
 * Test Coverage:
 * - TC-001: Single VAT rate proportional recalculation
 * - TC-002: Mixed VAT rates (exempt + standard)
 * - TC-003: 100% VAT exempt invoices
 * - TC-004: Rounding precision handling
 * - TC-005: Multiple sequential credits
 * - TC-006: Full credit (100% of invoice)
 * - TC-007: Small credit amounts
 * - TC-008: VAT breakdown generation
 */

import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import {
  CreditNoteService,
  CreditAllocation,
  LineItemForCredit,
  VatBreakdownEntry,
} from '../../../src/database/services/credit-note.service';
import { LineType } from '../../../src/database/entities/invoice-line.entity';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../../src/database/repositories/invoice-line.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { ProRataService } from '../../../src/database/services/pro-rata.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BusinessException } from '../../../src/shared/exceptions';

// Configure Decimal.js for tests
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('Credit VAT Recalculation (TASK-BILL-004)', () => {
  let service: CreditNoteService;

  // Mocks
  const mockInvoiceRepo = {
    findById: jest.fn(),
    findLastByPrefix: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockInvoiceLineRepo = {
    create: jest.fn(),
  };

  const mockChildRepo = {
    findById: jest.fn(),
  };

  const mockFeeStructureRepo = {
    findById: jest.fn(),
  };

  const mockProRataService = {
    calculateProRata: jest.fn(),
  };

  const mockAuditLogService = {
    logCreate: jest.fn(),
    logUpdate: jest.fn(),
    logAction: jest.fn(),
  };

  const mockPrisma = {
    invoiceLine: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNoteService,
        { provide: InvoiceRepository, useValue: mockInvoiceRepo },
        { provide: InvoiceLineRepository, useValue: mockInvoiceLineRepo },
        { provide: ChildRepository, useValue: mockChildRepo },
        { provide: FeeStructureRepository, useValue: mockFeeStructureRepo },
        { provide: ProRataService, useValue: mockProRataService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CreditNoteService>(CreditNoteService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('calculateProportionalCredit', () => {
    describe('TC-001: Single VAT rate proportional recalculation', () => {
      it('should recalculate VAT proportionally for single rate (20% credit)', () => {
        // Invoice: 10000 net, 1500 VAT (15%), total 11500
        // Apply 2300 credit (20%)
        // Expected: 8000 net, 1200 VAT, 9200 total
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: 10000, // R100.00
            vatAmountCents: 1500, // R15.00 (15%)
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          2300, // R23.00 credit (20% of R115.00)
          11500, // R115.00 total
        );

        expect(allocations).toHaveLength(1);
        const alloc = allocations[0];

        // Check original values preserved
        expect(alloc.originalNetCents).toBe(10000);
        expect(alloc.originalVatCents).toBe(1500);

        // Check credit applied
        expect(alloc.creditAmountCents).toBe(2300);

        // Check adjusted values (80% of original)
        // Adjusted gross = 11500 - 2300 = 9200
        // Adjusted net = 9200 / 1.15 = 8000
        // Adjusted VAT = 9200 - 8000 = 1200
        expect(alloc.adjustedNetCents).toBe(8000);
        expect(alloc.adjustedVatCents).toBe(1200);

        // Verify totals balance
        expect(alloc.adjustedNetCents + alloc.adjustedVatCents).toBe(
          11500 - 2300,
        );
      });

      it('should handle 50% credit correctly', () => {
        // Invoice: 8696 net, 1304 VAT (15%), total 10000
        // Apply 5000 credit (50%)
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.STATIONERY,
            netAmountCents: 8696,
            vatAmountCents: 1304,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          5000,
          10000,
        );

        const alloc = allocations[0];
        expect(alloc.creditAmountCents).toBe(5000);

        // Adjusted gross = 5000
        // Adjusted net = 5000 / 1.15 = 4348 (rounded)
        // Adjusted VAT = 5000 - 4348 = 652
        expect(alloc.adjustedNetCents).toBe(4348);
        expect(alloc.adjustedVatCents).toBe(652);
        expect(alloc.adjustedNetCents + alloc.adjustedVatCents).toBe(5000);
      });
    });

    describe('TC-002: Mixed VAT rates', () => {
      it('should handle mixed VAT rates (exempt + standard)', () => {
        // Line 1: Monthly fee - 10000 net, 0 VAT (exempt), gross 10000
        // Line 2: Books - 4348 net, 652 VAT (15%), gross 5000
        // Total: 15000
        // Apply 3000 credit (20%)
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.MONTHLY_FEE,
            netAmountCents: 10000,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
          {
            id: 'line-2',
            lineType: LineType.BOOKS,
            netAmountCents: 4348,
            vatAmountCents: 652,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          3000, // 20% of 15000
          15000,
        );

        expect(allocations).toHaveLength(2);

        // Line 1 (exempt): 20% credit = 2000
        // Adjusted net = 10000 - 2000 = 8000, VAT = 0
        const alloc1 = allocations[0];
        expect(alloc1.creditAmountCents).toBe(2000);
        expect(alloc1.adjustedNetCents).toBe(8000);
        expect(alloc1.adjustedVatCents).toBe(0);

        // Line 2 (15%): 20% credit = 1000
        // Adjusted gross = 5000 - 1000 = 4000
        // Adjusted net = 4000 / 1.15 = 3478
        // Adjusted VAT = 4000 - 3478 = 522
        const alloc2 = allocations[1];
        expect(alloc2.creditAmountCents).toBe(1000);
        expect(alloc2.adjustedNetCents).toBe(3478);
        expect(alloc2.adjustedVatCents).toBe(522);

        // Verify total credit applied
        expect(alloc1.creditAmountCents + alloc2.creditAmountCents).toBe(3000);

        // Verify totals balance
        const totalAdjusted =
          alloc1.adjustedNetCents +
          alloc1.adjustedVatCents +
          alloc2.adjustedNetCents +
          alloc2.adjustedVatCents;
        expect(totalAdjusted).toBe(15000 - 3000);
      });

      it('should distribute credit proportionally by line gross amount', () => {
        // Line 1: 6000 gross (40% of total)
        // Line 2: 9000 gross (60% of total)
        // Total: 15000
        // Credit: 1500 (10%)
        // Expected: Line 1 gets 600, Line 2 gets 900
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.MONTHLY_FEE,
            netAmountCents: 6000,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
          {
            id: 'line-2',
            lineType: LineType.MEALS,
            netAmountCents: 7826,
            vatAmountCents: 1174, // 15% of 7826
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          1500,
          15000,
        );

        // Line 1: 6000/15000 * 1500 = 600
        expect(allocations[0].creditAmountCents).toBe(600);
        // Line 2: 1500 - 600 = 900 (last item gets remainder)
        expect(allocations[1].creditAmountCents).toBe(900);
      });
    });

    describe('TC-003: VAT exempt invoices', () => {
      it('should handle 100% VAT exempt invoices', () => {
        // All lines exempt, apply credit
        // VAT should remain 0
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.MONTHLY_FEE,
            netAmountCents: 5000,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
          {
            id: 'line-2',
            lineType: LineType.REGISTRATION,
            netAmountCents: 3000,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          2000, // 25% credit
          8000,
        );

        // Verify all VAT remains 0
        for (const alloc of allocations) {
          expect(alloc.adjustedVatCents).toBe(0);
          expect(alloc.isVatExempt).toBe(true);
        }

        // Total credit should be exactly 2000
        const totalCredit = allocations.reduce(
          (sum, a) => sum + a.creditAmountCents,
          0,
        );
        expect(totalCredit).toBe(2000);

        // Total adjusted should be 6000
        const totalAdjusted = allocations.reduce(
          (sum, a) => sum + a.adjustedNetCents + a.adjustedVatCents,
          0,
        );
        expect(totalAdjusted).toBe(6000);
      });
    });

    describe('TC-004: Rounding precision handling', () => {
      it('should handle rounding correctly with no penny differences', () => {
        // Credit creates non-whole penny amounts
        // Totals should balance with no penny differences
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: 3333,
            vatAmountCents: 500,
            vatRate: 15,
            isVatExempt: false,
          },
          {
            id: 'line-2',
            lineType: LineType.STATIONERY,
            netAmountCents: 3334,
            vatAmountCents: 500,
            vatRate: 15,
            isVatExempt: false,
          },
          {
            id: 'line-3',
            lineType: LineType.UNIFORM,
            netAmountCents: 3333,
            vatAmountCents: 500,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        // Total: (3333+500) + (3334+500) + (3333+500) = 11500
        // Credit: 1234 (arbitrary amount to test rounding)
        const allocations = service.calculateProportionalCredit(
          lineItems,
          1234,
          11500,
        );

        // Verify total credit equals exactly 1234 (no penny difference)
        const totalCredit = allocations.reduce(
          (sum, a) => sum + a.creditAmountCents,
          0,
        );
        expect(totalCredit).toBe(1234);

        // Verify adjusted totals + credit = original total
        const totalAdjustedGross = allocations.reduce(
          (sum, a) => sum + a.adjustedNetCents + a.adjustedVatCents,
          0,
        );
        expect(totalAdjustedGross + totalCredit).toBe(11500);

        // Each line's adjusted amounts should balance
        for (const alloc of allocations) {
          const adjustedGross = alloc.adjustedNetCents + alloc.adjustedVatCents;
          const originalGross = alloc.originalNetCents + alloc.originalVatCents;
          expect(adjustedGross).toBe(originalGross - alloc.creditAmountCents);
        }
      });

      it('should give rounding remainder to last item', () => {
        // 3 equal lines, credit that doesn't divide evenly
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.MONTHLY_FEE,
            netAmountCents: 1000,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
          {
            id: 'line-2',
            lineType: LineType.MONTHLY_FEE,
            netAmountCents: 1000,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
          {
            id: 'line-3',
            lineType: LineType.MONTHLY_FEE,
            netAmountCents: 1000,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
        ];

        // 100 credit across 3 lines = 33.33... each
        // First two get 33, last gets 34
        const allocations = service.calculateProportionalCredit(
          lineItems,
          100,
          3000,
        );

        // Verify total is exactly 100
        const totalCredit = allocations.reduce(
          (sum, a) => sum + a.creditAmountCents,
          0,
        );
        expect(totalCredit).toBe(100);

        // First two lines get equal amounts, last gets remainder
        expect(allocations[0].creditAmountCents).toBe(33);
        expect(allocations[1].creditAmountCents).toBe(33);
        expect(allocations[2].creditAmountCents).toBe(34); // Gets the extra cent
      });
    });

    describe('TC-005: Multiple sequential credits', () => {
      it('should handle applying a second credit after first', () => {
        // Simulate applying credits sequentially
        // First credit: 2000 on 10000 total
        // Then use resulting values for second credit: 1000 on 8000 remaining

        // First credit
        const originalItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: 8696,
            vatAmountCents: 1304,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const firstAllocations = service.calculateProportionalCredit(
          originalItems,
          2000,
          10000,
        );

        // After first credit: adjusted values
        const afterFirst = firstAllocations[0];
        expect(afterFirst.adjustedNetCents + afterFirst.adjustedVatCents).toBe(
          8000,
        );

        // Second credit on remaining
        const afterFirstItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: afterFirst.adjustedNetCents,
            vatAmountCents: afterFirst.adjustedVatCents,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const secondAllocations = service.calculateProportionalCredit(
          afterFirstItems,
          1600, // 20% of 8000
          8000,
        );

        const afterSecond = secondAllocations[0];
        // Should be 6400 total (8000 - 1600)
        expect(
          afterSecond.adjustedNetCents + afterSecond.adjustedVatCents,
        ).toBe(6400);

        // VAT should still be proportional
        // 6400 / 1.15 = 5565 net, 835 VAT
        expect(afterSecond.adjustedNetCents).toBe(5565);
        expect(afterSecond.adjustedVatCents).toBe(835);
      });
    });

    describe('TC-006: Full credit (100%)', () => {
      it('should handle full credit reducing invoice to zero', () => {
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: 8696,
            vatAmountCents: 1304,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          10000, // 100% credit
          10000,
        );

        expect(allocations[0].creditAmountCents).toBe(10000);
        expect(allocations[0].adjustedNetCents).toBe(0);
        expect(allocations[0].adjustedVatCents).toBe(0);
      });
    });

    describe('TC-007: Small credit amounts', () => {
      it('should handle very small credits (1 cent)', () => {
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: 8696,
            vatAmountCents: 1304,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          1,
          10000,
        );

        expect(allocations[0].creditAmountCents).toBe(1);
        // Adjusted gross = 9999
        expect(
          allocations[0].adjustedNetCents + allocations[0].adjustedVatCents,
        ).toBe(9999);
      });

      it('should return empty allocations for zero credit', () => {
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: 8696,
            vatAmountCents: 1304,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          0,
          10000,
        );

        expect(allocations).toHaveLength(0);
      });
    });

    describe('Edge cases and validation', () => {
      it('should throw error if credit exceeds invoice total', () => {
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.BOOKS,
            netAmountCents: 8696,
            vatAmountCents: 1304,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        expect(() =>
          service.calculateProportionalCredit(lineItems, 15000, 10000),
        ).toThrow(BusinessException);
      });

      it('should throw error if invoice total is zero', () => {
        const lineItems: LineItemForCredit[] = [];

        expect(() =>
          service.calculateProportionalCredit(lineItems, 1000, 0),
        ).toThrow(BusinessException);
      });

      it('should skip lines with zero or negative amounts', () => {
        const lineItems: LineItemForCredit[] = [
          {
            id: 'line-1',
            lineType: LineType.DISCOUNT,
            netAmountCents: -500,
            vatAmountCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
          {
            id: 'line-2',
            lineType: LineType.BOOKS,
            netAmountCents: 8696,
            vatAmountCents: 1304,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const allocations = service.calculateProportionalCredit(
          lineItems,
          2000,
          9500, // 10000 - 500 discount
        );

        // Discount line should not get credit allocation
        expect(allocations[0].creditAmountCents).toBe(0);
        expect(allocations[0].adjustedNetCents).toBe(-500);

        // Full credit goes to positive line
        expect(allocations[1].creditAmountCents).toBe(2000);
      });
    });
  });

  describe('buildVatBreakdown', () => {
    describe('TC-008: VAT breakdown generation', () => {
      it('should group allocations by VAT rate', () => {
        const allocations: CreditAllocation[] = [
          {
            lineItemId: 'line-1',
            lineType: LineType.MONTHLY_FEE,
            originalNetCents: 10000,
            originalVatCents: 0,
            creditAmountCents: 1000,
            adjustedNetCents: 9000,
            adjustedVatCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
          {
            lineItemId: 'line-2',
            lineType: LineType.BOOKS,
            originalNetCents: 4348,
            originalVatCents: 652,
            creditAmountCents: 500,
            adjustedNetCents: 3913,
            adjustedVatCents: 587,
            vatRate: 15,
            isVatExempt: false,
          },
          {
            lineItemId: 'line-3',
            lineType: LineType.STATIONERY,
            originalNetCents: 2174,
            originalVatCents: 326,
            creditAmountCents: 250,
            adjustedNetCents: 1957,
            adjustedVatCents: 293,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const breakdown = service.buildVatBreakdown(allocations);

        expect(breakdown).toHaveLength(2);

        // Exempt rate (0%)
        const exemptEntry = breakdown.find((b) => b.rate === 0);
        expect(exemptEntry).toBeDefined();
        expect(exemptEntry!.netAmountCents).toBe(9000);
        expect(exemptEntry!.vatAmountCents).toBe(0);
        expect(exemptEntry!.grossAmountCents).toBe(9000);

        // Standard rate (15%)
        const standardEntry = breakdown.find((b) => b.rate === 15);
        expect(standardEntry).toBeDefined();
        expect(standardEntry!.netAmountCents).toBe(3913 + 1957);
        expect(standardEntry!.vatAmountCents).toBe(587 + 293);
        expect(standardEntry!.grossAmountCents).toBe(3913 + 587 + 1957 + 293);
      });

      it('should sort breakdown by rate ascending', () => {
        const allocations: CreditAllocation[] = [
          {
            lineItemId: 'line-1',
            lineType: LineType.BOOKS,
            originalNetCents: 1000,
            originalVatCents: 150,
            creditAmountCents: 100,
            adjustedNetCents: 900,
            adjustedVatCents: 135,
            vatRate: 15,
            isVatExempt: false,
          },
          {
            lineItemId: 'line-2',
            lineType: LineType.MONTHLY_FEE,
            originalNetCents: 1000,
            originalVatCents: 0,
            creditAmountCents: 100,
            adjustedNetCents: 900,
            adjustedVatCents: 0,
            vatRate: 0,
            isVatExempt: true,
          },
        ];

        const breakdown = service.buildVatBreakdown(allocations);

        expect(breakdown[0].rate).toBe(0);
        expect(breakdown[1].rate).toBe(15);
      });

      it('should handle single rate correctly', () => {
        const allocations: CreditAllocation[] = [
          {
            lineItemId: 'line-1',
            lineType: LineType.BOOKS,
            originalNetCents: 5000,
            originalVatCents: 750,
            creditAmountCents: 1000,
            adjustedNetCents: 4348,
            adjustedVatCents: 652,
            vatRate: 15,
            isVatExempt: false,
          },
        ];

        const breakdown = service.buildVatBreakdown(allocations);

        expect(breakdown).toHaveLength(1);
        expect(breakdown[0].rate).toBe(15);
        expect(breakdown[0].netAmountCents).toBe(4348);
        expect(breakdown[0].vatAmountCents).toBe(652);
        expect(breakdown[0].grossAmountCents).toBe(5000);
      });
    });
  });

  describe('calculateVatAdjustmentPreview', () => {
    it('should calculate proportional VAT reduction preview', () => {
      // Invoice: 10000 total, 1304 VAT
      // Credit: 2000 (20%)
      // Expected VAT reduction: 1304 * 0.20 = 261
      const vatReduction = service.calculateVatAdjustmentPreview(
        10000,
        1304,
        2000,
      );
      expect(vatReduction).toBe(261);
    });

    it('should return 0 for zero credit', () => {
      const vatReduction = service.calculateVatAdjustmentPreview(
        10000,
        1304,
        0,
      );
      expect(vatReduction).toBe(0);
    });

    it('should return 0 for zero invoice total', () => {
      const vatReduction = service.calculateVatAdjustmentPreview(0, 0, 1000);
      expect(vatReduction).toBe(0);
    });

    it('should handle exact division', () => {
      // 50% credit
      const vatReduction = service.calculateVatAdjustmentPreview(
        10000,
        1500,
        5000,
      );
      expect(vatReduction).toBe(750);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical creche invoice with mixed items', () => {
      // Realistic South African creche invoice:
      // - Monthly fee: R3000 (VAT exempt - educational service)
      // - Lunch meals: R500 + R75 VAT (15%)
      // - School trip: R200 + R30 VAT (15%)
      // Total: R3805
      // Apply R500 credit

      const lineItems: LineItemForCredit[] = [
        {
          id: 'monthly-fee',
          lineType: LineType.MONTHLY_FEE,
          netAmountCents: 300000,
          vatAmountCents: 0,
          vatRate: 0,
          isVatExempt: true,
        },
        {
          id: 'meals',
          lineType: LineType.MEALS,
          netAmountCents: 50000,
          vatAmountCents: 7500,
          vatRate: 15,
          isVatExempt: false,
        },
        {
          id: 'trip',
          lineType: LineType.SCHOOL_TRIP,
          netAmountCents: 20000,
          vatAmountCents: 3000,
          vatRate: 15,
          isVatExempt: false,
        },
      ];

      const totalGross = 300000 + 50000 + 7500 + 20000 + 3000; // 380500
      const allocations = service.calculateProportionalCredit(
        lineItems,
        50000, // R500 credit
        totalGross,
      );

      // Verify total credit applied
      const totalCredit = allocations.reduce(
        (sum, a) => sum + a.creditAmountCents,
        0,
      );
      expect(totalCredit).toBe(50000);

      // Verify adjusted total
      const totalAdjusted = allocations.reduce(
        (sum, a) => sum + a.adjustedNetCents + a.adjustedVatCents,
        0,
      );
      expect(totalAdjusted).toBe(totalGross - 50000);

      // Build VAT breakdown and verify
      const breakdown = service.buildVatBreakdown(allocations);

      // Should have exempt and 15% rates
      expect(breakdown).toHaveLength(2);

      // Total VAT should be reduced proportionally
      const originalVat = 7500 + 3000;
      const adjustedVat = breakdown.reduce(
        (sum, b) => sum + b.vatAmountCents,
        0,
      );
      expect(adjustedVat).toBeLessThan(originalVat);
    });
  });
});
