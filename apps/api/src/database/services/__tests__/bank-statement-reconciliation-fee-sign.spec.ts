/**
 * AUDIT-RECON-SIGN: Fee sign convention regression tests
 *
 * Bank-statement parser stores fees as POSITIVE amounts with isCredit=false.
 * Transactions table stores fees as NEGATIVE amounts with isCredit=false
 * (Xero/bank-feed normalisation in bank-feed.service.ts lines 672-674).
 *
 * Without sign normalisation, evaluateMatch computes:
 *   Math.abs(+4400 - (-4400)) = 8800  →  AMOUNT_MISMATCH  ← BUG
 *
 * With normalisation:
 *   Math.abs(|+4400| - |-4400|) = Math.abs(4400 - 4400) = 0  →  MATCHED  ← CORRECT
 *
 * Prod residuals that will clear after this fix lands and `:rematch` is run:
 *   Jan 17 R44 fee, Feb 17 R46.28 fee, Dec 23 R250 fee.
 */

import { BankStatementReconciliationService } from '../bank-statement-reconciliation.service';
import { BankStatementMatchStatus } from '../../../database/entities/bank-statement-match.entity';

// ---------------------------------------------------------------------------
// Minimal mocks — only the methods exercised by evaluateMatch
// ---------------------------------------------------------------------------

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

function makeService(): BankStatementReconciliationService {
  return new BankStatementReconciliationService(
    {} as any, // PrismaService
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

// Helper: call private evaluateMatch
function evaluateMatch(
  service: BankStatementReconciliationService,
  bankTx: {
    date: Date;
    description: string;
    amountCents: number;
    isCredit: boolean;
  },
  xeroTx: {
    date: Date;
    description: string;
    amountCents: number;
    isCredit: boolean;
  },
) {
  return (service as any).evaluateMatch(bankTx, xeroTx);
}

const TODAY = new Date('2026-01-17T00:00:00.000Z');

describe('BankStatementReconciliationService — fee sign normalisation (AUDIT-RECON-SIGN)', () => {
  let service: BankStatementReconciliationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = makeService();
  });

  describe('evaluateMatch', () => {
    it('matches a fee row where bank=+4400 (positive) and xero=-4400 (negative), same direction', () => {
      // Bank statement parser: POSITIVE, isCredit=false (debit)
      const bankTx = {
        date: TODAY,
        description: 'Monthly service fee',
        amountCents: 4400, // POSITIVE — parser convention
        isCredit: false,
      };
      // Transactions table: NEGATIVE, isCredit=false (Xero correction)
      const xeroTx = {
        date: TODAY,
        description: 'Monthly service fee',
        amountCents: -4400, // NEGATIVE — Xero bank-feed convention
        isCredit: false,
      };

      const result = evaluateMatch(service, bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
    });

    it('regression: Jan 17 R44 fee — bank=+4400, xero=-4400 should not produce AMOUNT_MISMATCH', () => {
      const bankTx = {
        date: new Date('2026-01-17T00:00:00.000Z'),
        description: 'Cash Deposit Fee',
        amountCents: 4400,
        isCredit: false,
      };
      const xeroTx = {
        date: new Date('2026-01-17T00:00:00.000Z'),
        description: 'Cash Deposit Fee',
        amountCents: -4400,
        isCredit: false,
      };

      const result = evaluateMatch(service, bankTx, xeroTx);

      expect(result.status).not.toBe(BankStatementMatchStatus.AMOUNT_MISMATCH);
      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
    });

    it('regression: Feb 17 R46.28 fee — bank=+4628, xero=-4628 should MATCH', () => {
      const bankTx = {
        date: new Date('2026-02-17T00:00:00.000Z'),
        description: 'Monthly account fee',
        amountCents: 4628,
        isCredit: false,
      };
      const xeroTx = {
        date: new Date('2026-02-17T00:00:00.000Z'),
        description: 'Monthly account fee',
        amountCents: -4628,
        isCredit: false,
      };

      const result = evaluateMatch(service, bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
    });

    it('still produces AMOUNT_MISMATCH when amounts genuinely differ after normalisation', () => {
      const bankTx = {
        date: TODAY,
        description: 'Bank charge',
        amountCents: 4400, // R44
        isCredit: false,
      };
      const xeroTx = {
        date: TODAY,
        description: 'Bank charge',
        amountCents: -5000, // R50 — real mismatch
        isCredit: false,
      };

      const result = evaluateMatch(service, bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.AMOUNT_MISMATCH);
    });

    it('preserves AMOUNT_MISMATCH when directions differ (credit vs debit)', () => {
      const bankTx = {
        date: TODAY,
        description: 'Service fee',
        amountCents: 4400,
        isCredit: false, // debit
      };
      const xeroTx = {
        date: TODAY,
        description: 'Service fee',
        amountCents: -4400,
        isCredit: true, // credit — wrong direction
      };

      const result = evaluateMatch(service, bankTx, xeroTx);

      // Direction mismatch → not a valid match regardless of amount equality
      expect(result.status).not.toBe(BankStatementMatchStatus.MATCHED);
    });

    it('handles normal positive-positive fee row (both same sign) correctly', () => {
      // Both sides positive, same direction — should still match
      const bankTx = {
        date: TODAY,
        description: 'ATM withdrawal fee',
        amountCents: 2500,
        isCredit: false,
      };
      const xeroTx = {
        date: TODAY,
        description: 'ATM withdrawal fee',
        amountCents: 2500,
        isCredit: false,
      };

      const result = evaluateMatch(service, bankTx, xeroTx);

      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
    });
  });
});
