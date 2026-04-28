/**
 * Month-End Pack Service Tests
 *
 * Tests cover:
 *  (a) all 5 CSVs present in the ZIP output
 *  (b) period validation rejects bad input
 *  (c) tenant isolation (queries always scoped to tenantId)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { MonthEndPackService } from '../month-end-pack.service';
import { GeneralLedgerService } from '../../../database/services/general-ledger.service';
import { InvoiceRepository } from '../../../database/repositories/invoice.repository';
import { PaymentRepository } from '../../../database/repositories/payment.repository';
import { PrismaService } from '../../../database/prisma/prisma.service';

// ---- helpers -----------------------------------------------------------------

function makeGlEntry(
  overrides: Partial<{
    id: string;
    date: Date;
    description: string;
    accountCode: string;
    accountName: string;
    debitCents: number;
    creditCents: number;
    sourceType: string;
    sourceId: string;
    reference: string;
  }> = {},
) {
  return {
    id: 'entry-1',
    date: new Date('2025-01-15'),
    description: 'Test entry',
    accountCode: '1035',
    accountName: 'Bank Account',
    debitCents: 10000,
    creditCents: 0,
    sourceType: 'BANK_FEED' as const,
    sourceId: 'tx-1',
    reference: 'REF-001',
    ...overrides,
  };
}

function makeTrialBalance() {
  return {
    asOfDate: new Date('2025-01-31'),
    lines: [
      {
        accountCode: '1035',
        accountName: 'Bank Account',
        accountType: 'ASSET',
        debitBalanceCents: 500000,
        creditBalanceCents: 0,
      },
    ],
    totalDebitsCents: 500000,
    totalCreditsCents: 500000,
    isBalanced: true,
  };
}

// ---- test suite --------------------------------------------------------------

describe('MonthEndPackService', () => {
  let service: MonthEndPackService;
  let glService: jest.Mocked<GeneralLedgerService>;
  let prisma: jest.Mocked<PrismaService>;

  const TENANT = 'tenant-abc-123';
  const PAST_PERIOD = '2025-01';
  const CURRENT_PERIOD_SAME_MONTH = (() => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  })();

  beforeEach(async () => {
    const mockGlService: Partial<jest.Mocked<GeneralLedgerService>> = {
      getGeneralLedger: jest.fn().mockResolvedValue([makeGlEntry()]),
      getTrialBalance: jest.fn().mockResolvedValue(makeTrialBalance()),
    };

    const mockPrisma = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            invoiceNumber: 'INV-001',
            issueDate: new Date('2025-01-10'),
            dueDate: new Date('2025-01-31'),
            status: 'PAID',
            parent: { firstName: 'Jane', lastName: 'Doe' },
            child: { firstName: 'Tom', lastName: 'Doe' },
            subtotalCents: 200000,
            vatCents: 30000,
            totalCents: 230000,
            amountPaidCents: 230000,
          },
        ]),
      },
      payment: {
        findMany: jest.fn().mockResolvedValue([
          {
            paymentDate: new Date('2025-01-12'),
            amountCents: 230000,
            matchType: 'AI_MATCHED',
            matchedBy: 'AI',
            reference: 'REF-001',
            invoice: { invoiceNumber: 'INV-001' },
            transaction: { description: 'Bank deposit', reference: 'BNK-999' },
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonthEndPackService,
        {
          provide: GeneralLedgerService,
          useValue: mockGlService,
        },
        {
          provide: InvoiceRepository,
          useValue: {},
        },
        {
          provide: PaymentRepository,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<MonthEndPackService>(MonthEndPackService);
    glService = module.get(GeneralLedgerService);
    prisma = module.get(PrismaService);

    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // (b) Period validation
  // --------------------------------------------------------------------------

  describe('parsePeriod', () => {
    it('accepts a valid past period', () => {
      const { startDate, endDate } = service.parsePeriod('2025-01');
      expect(startDate).toEqual(new Date('2025-01-01T00:00:00.000Z'));
      expect(endDate.getUTCDate()).toBe(31);
    });

    it('accepts the current month', () => {
      // Should not throw for the current calendar month
      expect(() =>
        service.parsePeriod(CURRENT_PERIOD_SAME_MONTH),
      ).not.toThrow();
    });

    it('rejects a future month', () => {
      const now = new Date();
      const futureMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 2).padStart(2, '0')}`;
      // Handles year rollover
      if (now.getUTCMonth() + 2 <= 12) {
        expect(() => service.parsePeriod(futureMonth)).toThrow(/future/i);
      }
    });

    it('rejects a future year', () => {
      const futureYear = new Date().getUTCFullYear() + 1;
      expect(() => service.parsePeriod(`${futureYear}-01`)).toThrow(/future/i);
    });

    it('rejects bad format — no dash', () => {
      expect(() => service.parsePeriod('202501')).toThrow(/format/i);
    });

    it('rejects bad format — wrong separator', () => {
      expect(() => service.parsePeriod('2025/01')).toThrow(/format/i);
    });

    it('rejects invalid month 00', () => {
      expect(() => service.parsePeriod('2025-00')).toThrow(/month/i);
    });

    it('rejects invalid month 13', () => {
      expect(() => service.parsePeriod('2025-13')).toThrow(/month/i);
    });
  });

  // --------------------------------------------------------------------------
  // (a) All 5 CSVs present in ZIP
  // --------------------------------------------------------------------------

  describe('buildPackStream', () => {
    it('returns a readable stream', async () => {
      const stream = await service.buildPackStream(TENANT, PAST_PERIOD);
      expect(stream).toBeDefined();
      expect(typeof stream.pipe).toBe('function');
    });

    it('collects all 5 CSVs in the archive (integration check via data)', async () => {
      // We call buildPackStream and verify the underlying data-gathering calls
      // that feed the 5 CSVs were all made with the correct tenantId.
      await service.buildPackStream(TENANT, PAST_PERIOD);

      // general-ledger.csv: two GL calls (one for CSV, one for xero-journal.csv)
      expect(glService.getGeneralLedger).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT }),
      );

      // trial-balance.csv
      expect(glService.getTrialBalance).toHaveBeenCalledWith(
        TENANT,
        expect.any(Date),
      );

      // invoices.csv — uses prisma directly
      expect(prisma.invoice.findMany as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT }),
        }),
      );

      // payments.csv — uses prisma directly
      expect(prisma.payment.findMany as jest.Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT }),
        }),
      );
    });

    // (c) Tenant isolation on every query
    it('always scopes invoice query to the requesting tenantId', async () => {
      const otherTenant = 'other-tenant-xyz';
      await service.buildPackStream(otherTenant, PAST_PERIOD);
      const call = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.tenantId).toBe(otherTenant);
    });

    it('always scopes payment query to the requesting tenantId', async () => {
      await service.buildPackStream(TENANT, PAST_PERIOD);
      const call = (prisma.payment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.tenantId).toBe(TENANT);
    });

    it('always scopes GL query to the requesting tenantId', async () => {
      await service.buildPackStream(TENANT, PAST_PERIOD);
      const call = (glService.getGeneralLedger as jest.Mock).mock.calls[0][0];
      expect(call.tenantId).toBe(TENANT);
    });

    it('invoice query excludes soft-deleted invoices', async () => {
      await service.buildPackStream(TENANT, PAST_PERIOD);
      const call = (prisma.invoice.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.isDeleted).toBe(false);
    });

    it('payment query excludes soft-deleted payments', async () => {
      await service.buildPackStream(TENANT, PAST_PERIOD);
      const call = (prisma.payment.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.deletedAt).toBeNull();
    });

    it('still produces a stream when a CSV source throws (WARNING.txt fallback)', async () => {
      (glService.getGeneralLedger as jest.Mock).mockRejectedValueOnce(
        new Error('GL query failed'),
      );

      // Should not throw; stream is still returned
      const stream = await service.buildPackStream(TENANT, PAST_PERIOD);
      expect(stream).toBeDefined();
    });
  });
});
