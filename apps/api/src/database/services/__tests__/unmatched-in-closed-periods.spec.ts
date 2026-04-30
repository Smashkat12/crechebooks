/**
 * AUDIT-BANK-03: getUnmatchedInClosedPeriods unit tests
 *
 * Verifies that IN_BANK_ONLY rows in RECONCILED periods are returned with
 * correct grouping, total amounts, and row-level detail.
 */

import { BankStatementReconciliationService } from '../bank-statement-reconciliation.service';
import { ReconciliationStatus } from '@prisma/client';
import { BankStatementMatchStatus } from '../../../database/entities/bank-statement-match.entity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDate(iso: string): Date {
  return new Date(iso);
}

function buildMatch(overrides: {
  id: string;
  reconciliationId: string;
  periodStart: string;
  periodEnd: string;
  bankAccount?: string;
  bankAmountCents: number;
  bankIsCredit?: boolean;
}) {
  return {
    id: overrides.id,
    tenantId: 'tenant-1',
    bankDate: makeDate('2025-04-15'),
    bankDescription: `Desc-${overrides.id}`,
    bankAmountCents: overrides.bankAmountCents,
    bankIsCredit: overrides.bankIsCredit ?? false,
    status: BankStatementMatchStatus.IN_BANK_ONLY,
    reconciliation: {
      id: overrides.reconciliationId,
      periodStart: makeDate(overrides.periodStart),
      periodEnd: makeDate(overrides.periodEnd),
      bankAccount: overrides.bankAccount ?? 'Business Account',
      status: ReconciliationStatus.RECONCILED,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock PrismaService — only bankStatementMatch.findMany is needed
// ---------------------------------------------------------------------------

function makePrisma(rows: ReturnType<typeof buildMatch>[]) {
  return {
    bankStatementMatch: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
): BankStatementReconciliationService {
  const mockToleranceConfig = {
    descriptionSimilarityThreshold: 0.7,
    getEffectiveTolerance: jest.fn((amount: number) =>
      Math.max(1, amount * 0.005),
    ),
    isWithinTolerance: jest.fn(
      (diff: number, amount: number) => diff <= Math.max(1, amount * 0.005),
    ),
    isDateWithinTolerance: jest.fn((days: number) => days <= 3),
    isDescriptionMatch: jest.fn((score: number) => score >= 0.7),
  };

  return new BankStatementReconciliationService(
    prisma as any,
    {} as any, // LLMWhispererParser
    {} as any, // BankStatementMatchRepository
    {} as any, // ReconciliationRepository
    mockToleranceConfig as any,
    {} as any, // AccruedBankChargeService
    {} as any, // BankFeeService
    {} as any, // FeeInflationCorrectionService
    {} as any, // EventEmitter2
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BankStatementReconciliationService.getUnmatchedInClosedPeriods', () => {
  it('returns empty array when no IN_BANK_ONLY rows exist in RECONCILED periods', async () => {
    const prisma = makePrisma([]);
    const service = makeService(prisma);

    const result = await service.getUnmatchedInClosedPeriods('tenant-1');

    expect(result).toEqual([]);
    expect(prisma.bankStatementMatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          status: BankStatementMatchStatus.IN_BANK_ONLY,
        }),
      }),
    );
  });

  it('groups rows by reconciliation and sums amounts correctly', async () => {
    const rows = [
      buildMatch({
        id: 'match-1',
        reconciliationId: 'recon-A',
        periodStart: '2025-04-01',
        periodEnd: '2025-04-30',
        bankAmountCents: 318,
      }),
      buildMatch({
        id: 'match-2',
        reconciliationId: 'recon-A',
        periodStart: '2025-04-01',
        periodEnd: '2025-04-30',
        bankAmountCents: 600,
      }),
      buildMatch({
        id: 'match-3',
        reconciliationId: 'recon-B',
        periodStart: '2025-09-01',
        periodEnd: '2025-09-30',
        bankAmountCents: 60000,
      }),
    ];
    const prisma = makePrisma(rows);
    const service = makeService(prisma);

    const result = await service.getUnmatchedInClosedPeriods('tenant-1');

    expect(result).toHaveLength(2);

    const reconA = result.find((r) => r.reconciliationId === 'recon-A')!;
    expect(reconA.count).toBe(2);
    expect(reconA.totalAmountCents).toBe(918); // 318 + 600
    expect(reconA.items).toHaveLength(2);
    expect(reconA.bankAccount).toBe('Business Account');

    const reconB = result.find((r) => r.reconciliationId === 'recon-B')!;
    expect(reconB.count).toBe(1);
    expect(reconB.totalAmountCents).toBe(60000);
    expect(reconB.items[0].id).toBe('match-3');
  });

  it('uses Math.abs for negative bank amounts when summing', async () => {
    // Debit rows are stored as positive values in bank_statement_matches;
    // but guard against any negative values arriving via future code paths.
    const rows = [
      buildMatch({
        id: 'match-neg',
        reconciliationId: 'recon-C',
        periodStart: '2025-12-01',
        periodEnd: '2025-12-31',
        bankAmountCents: -25000, // hypothetical negative
      }),
    ];
    const prisma = makePrisma(rows);
    const service = makeService(prisma);

    const result = await service.getUnmatchedInClosedPeriods('tenant-1');

    expect(result).toHaveLength(1);
    expect(result[0].totalAmountCents).toBe(25000); // abs
  });

  it('surfaces item-level detail (id, bankDate, bankDescription, bankAmountCents, bankIsCredit)', async () => {
    const rows = [
      {
        ...buildMatch({
          id: 'match-detail',
          reconciliationId: 'recon-D',
          periodStart: '2025-10-01',
          periodEnd: '2025-10-31',
          bankAmountCents: 1234,
          bankIsCredit: true,
        }),
        bankDate: makeDate('2025-10-15'),
        bankDescription: 'Card Cashback Boxer',
      },
    ];
    const prisma = makePrisma(rows);
    const service = makeService(prisma);

    const result = await service.getUnmatchedInClosedPeriods('tenant-1');

    const item = result[0].items[0];
    expect(item.id).toBe('match-detail');
    expect(item.bankDate).toEqual(makeDate('2025-10-15'));
    expect(item.bankDescription).toBe('Card Cashback Boxer');
    expect(item.bankAmountCents).toBe(1234);
    expect(item.bankIsCredit).toBe(true);
  });
});
