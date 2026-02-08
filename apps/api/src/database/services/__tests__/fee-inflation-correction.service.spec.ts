/**
 * Fee Inflation Correction Service Tests
 * London-school TDD: all dependencies mocked
 *
 * Tests fee detection confidence, correction flow, dry-run preview,
 * and monthly fee matching aggregation.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  FeeInflationCorrectionService,
  FeeCorrectionPreview,
  FeeCorrectionApplyResult,
} from '../fee-inflation-correction.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BankFeeService,
  TransactionType,
} from '../bank-fee.service';
import { AccruedBankChargeService } from '../accrued-bank-charge.service';
import { AuditLogService } from '../audit-log.service';
import { BankStatementMatchStatus } from '@prisma/client';

describe('FeeInflationCorrectionService', () => {
  let service: FeeInflationCorrectionService;
  let mockPrisma: any;
  let mockBankFeeService: any;
  let mockAccruedChargeService: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-test-123';
  const userId = 'user-test-456';

  beforeEach(async () => {
    mockPrisma = {
      transaction: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      bankStatementMatch: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      accruedBankCharge: {
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(mockPrisma)),
    };

    mockBankFeeService = {
      detectTransactionType: jest.fn(),
      calculateFees: jest.fn(),
    };

    mockAccruedChargeService = {};

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeInflationCorrectionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BankFeeService, useValue: mockBankFeeService },
        { provide: AccruedBankChargeService, useValue: mockAccruedChargeService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<FeeInflationCorrectionService>(
      FeeInflationCorrectionService,
    );
  });

  describe('detectAndValidateFeeMatch', () => {
    it('should detect ADT deposit fee with high confidence (R14.70)', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.ADT_DEPOSIT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'ADT_DEPOSIT_FEE',
          feeAmountCents: 1470,
          appliedRule: {},
          description: 'ADT deposit fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        1000000, // R10,000 bank (NET)
        1001470, // R10,014.70 xero (GROSS)
        'ADT Fridge Deposit',
      );

      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.actualFeeCents).toBe(1470);
      expect(result.feeType).toBe('ADT_DEPOSIT_FEE');
      expect(result.transactionType).toBe(TransactionType.ADT_DEPOSIT);
    });

    it('should detect POS fee with high confidence (R3.68)', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.CARD_PURCHASE,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'CARD_TRANSACTION_FEE',
          feeAmountCents: 368,
          appliedRule: {},
          description: 'POS fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        50000, // R500 bank
        50368, // R503.68 xero
        'POS Card Purchase',
      );

      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.actualFeeCents).toBe(368);
    });

    it('should return moderate confidence for unknown types with small fee ratio', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.UNKNOWN,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        100000, // R1,000 bank
        100500, // R1,005 xero — fee is 0.5% of amount
        'Unknown Transfer',
      );

      // Fee ratio 0.5% < 3% → 0.80 confidence (below MIN_CORRECTION_CONFIDENCE)
      expect(result.isMatch).toBe(false);
      expect(result.confidence).toBe(0.80);
      expect(result.actualFeeCents).toBe(500);
    });

    it('should reject when Xero amount is not higher than bank', async () => {
      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        100000, // R1,000
        100000, // R1,000 (same)
        'Some Transaction',
      );

      expect(result.isMatch).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.explanation).toContain('not higher');
    });

    it('should reject when Xero amount is lower than bank', async () => {
      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        100500,
        100000,
        'Some Transaction',
      );

      expect(result.isMatch).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('should give 0.90 confidence when fee is close but not exact (within R2)', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.ADT_DEPOSIT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'ADT_DEPOSIT_FEE',
          feeAmountCents: 1470,
          appliedRule: {},
          description: 'ADT fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        1000000,
        1001600, // R16.00 fee vs expected R14.70 (diff = R1.30 = 130 cents)
        'ADT Deposit',
      );

      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.90);
    });

    it('should detect RTC payment fee with high confidence (R8.00)', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.RTC_PAYMENT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'RTC_PAYMENT_FEE',
          feeAmountCents: 800,
          appliedRule: {},
          description: 'RTC fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        200000, // R2,000 bank
        200800, // R2,008 xero
        'RTC Credit Payment',
      );

      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.feeType).toBe('RTC_PAYMENT_FEE');
      expect(result.actualFeeCents).toBe(800);
    });

    it('should detect fuel card fee with high confidence (R6.25)', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.FUEL_PURCHASE,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'FUEL_CARD_FEE',
          feeAmountCents: 625,
          appliedRule: {},
          description: 'Fuel card fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        80000, // R800 bank
        80625, // R806.25 xero
        'ENGEN FUEL Centurion',
      );

      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.feeType).toBe('FUEL_CARD_FEE');
    });

    it('should give high confidence for ADT with variable fee (ratio-based)', async () => {
      // ADT with R10.95 fee instead of expected R14.70
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.ADT_DEPOSIT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'ADT_DEPOSIT_FEE',
          feeAmountCents: 1470,
          appliedRule: {},
          description: 'ADT fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        300000, // R3,000 bank
        301095, // R3,010.95 xero — fee of R10.95 (0.37% of amount)
        'ADT Deposit',
      );

      // Known type, fee within 5% of amount → 0.88
      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.88);
      expect(result.actualFeeCents).toBe(1095);
    });

    it('should give high confidence for large ADT with proportional fee (R129.70 on R10k)', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.ADT_DEPOSIT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'ADT_DEPOSIT_FEE',
          feeAmountCents: 1470,
          appliedRule: {},
          description: 'ADT fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        1000000,  // R10,000 bank
        1012970,  // R10,129.70 xero — fee of R129.70 (1.3% of amount)
        'ADT Fridge Deposit',
      );

      // Known type, fee within 5% of amount → 0.88
      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.88);
      expect(result.actualFeeCents).toBe(12970);
    });

    it('should detect EFT credit with corrected fee (R5.75)', async () => {
      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.EFT_CREDIT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'EFT_CREDIT_FEE',
          feeAmountCents: 575,
          appliedRule: {},
          description: 'EFT credit fee',
        },
      ]);

      const result = await service.detectAndValidateFeeMatch(
        tenantId,
        500000, // R5,000 bank
        500575, // R5,005.75 xero
        'EFT CR Payment Received',
      );

      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.feeType).toBe('EFT_CREDIT_FEE');
    });
  });

  describe('applyFeeCorrection', () => {
    const matchId = 'match-1';
    const transactionId = 'tx-1';

    beforeEach(() => {
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: transactionId,
        tenantId,
        amountCents: 1001470,
        xeroId: 'xero-tx-1',
      });

      mockPrisma.bankStatementMatch.findFirst.mockResolvedValue({
        id: matchId,
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'ADT Fridge Deposit',
        bankAmountCents: 1000000,
        xeroAmountCents: 1001470,
      });

      mockPrisma.transaction.update.mockResolvedValue({});
      mockPrisma.accruedBankCharge.create.mockResolvedValue({
        id: 'accrued-1',
      });
      mockPrisma.bankStatementMatch.update.mockResolvedValue({});
    });

    it('should update transaction amount to NET (bank) amount', async () => {
      await service.applyFeeCorrection(
        tenantId,
        matchId,
        transactionId,
        1000000, // bank NET
        1001470, // xero GROSS
        1470,
        'ADT_DEPOSIT_FEE',
        userId,
      );

      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: transactionId },
        data: expect.objectContaining({
          amountCents: 1000000,
        }),
      });
    });

    it('should create AccruedBankCharge with fee amount', async () => {
      await service.applyFeeCorrection(
        tenantId,
        matchId,
        transactionId,
        1000000,
        1001470,
        1470,
        'ADT_DEPOSIT_FEE',
        userId,
      );

      expect(mockPrisma.accruedBankCharge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          sourceTransactionId: transactionId,
          accruedAmountCents: 1470,
          feeType: 'ADT_DEPOSIT_FEE',
          status: 'ACCRUED',
          xeroAmountCents: 1001470,
          bankStatementMatchId: matchId,
        }),
      });
    });

    it('should update BankStatementMatch with fee metadata', async () => {
      await service.applyFeeCorrection(
        tenantId,
        matchId,
        transactionId,
        1000000,
        1001470,
        1470,
        'ADT_DEPOSIT_FEE',
        userId,
      );

      expect(mockPrisma.bankStatementMatch.update).toHaveBeenCalledWith({
        where: { id: matchId },
        data: expect.objectContaining({
          isFeeAdjustedMatch: true,
          accruedFeeAmountCents: 1470,
          feeType: 'ADT_DEPOSIT_FEE',
          status: BankStatementMatchStatus.FEE_ADJUSTED_MATCH,
        }),
      });
    });

    it('should create audit log with before/after values', async () => {
      await service.applyFeeCorrection(
        tenantId,
        matchId,
        transactionId,
        1000000,
        1001470,
        1470,
        'ADT_DEPOSIT_FEE',
        userId,
      );

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          userId,
          entityType: 'Transaction',
          entityId: transactionId,
          beforeValue: expect.objectContaining({
            amountCents: 1001470,
          }),
          afterValue: expect.objectContaining({
            amountCents: 1000000,
            feeAmountCents: 1470,
          }),
        }),
      );
    });

    it('should return correction result with all fields', async () => {
      const result = await service.applyFeeCorrection(
        tenantId,
        matchId,
        transactionId,
        1000000,
        1001470,
        1470,
        'ADT_DEPOSIT_FEE',
        userId,
      );

      expect(result).toEqual({
        matchId,
        transactionId,
        previousAmountCents: 1001470,
        correctedAmountCents: 1000000,
        feeAmountCents: 1470,
        feeType: 'ADT_DEPOSIT_FEE',
        accruedChargeId: 'accrued-1',
      });
    });

    it('should throw if transaction not found', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.applyFeeCorrection(
          tenantId,
          matchId,
          'missing-tx',
          1000000,
          1001470,
          1470,
          'ADT_DEPOSIT_FEE',
          userId,
        ),
      ).rejects.toThrow('not found');
    });

    it('should execute all updates in a single Prisma $transaction', async () => {
      await service.applyFeeCorrection(
        tenantId,
        matchId,
        transactionId,
        1000000,
        1001470,
        1470,
        'ADT_DEPOSIT_FEE',
        userId,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('correctExistingMatches (dry-run)', () => {
    it('should return preview without persisting', async () => {
      mockPrisma.bankStatementMatch.findMany.mockResolvedValue([
        {
          id: 'match-1',
          tenantId,
          transactionId: 'tx-1',
          bankAmountCents: 1000000,
          xeroAmountCents: 1001470,
          bankDescription: 'ADT Fridge Deposit',
          isFeeAdjustedMatch: false,
          status: BankStatementMatchStatus.MATCHED,
        },
      ]);

      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.ADT_DEPOSIT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'ADT_DEPOSIT_FEE',
          feeAmountCents: 1470,
          appliedRule: {},
          description: 'ADT fee',
        },
      ]);

      const result = (await service.correctExistingMatches(
        tenantId,
        userId,
        { dryRun: true },
      )) as FeeCorrectionPreview;

      expect(result.totalMatches).toBe(1);
      expect(result.correctableMatches).toBe(1);
      expect(result.totalFeesCents).toBe(1470);
      expect(result.corrections).toHaveLength(1);
      expect(result.corrections[0].feeAmountCents).toBe(1470);

      // No mutations should occur in dry-run
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.transaction.update).not.toHaveBeenCalled();
    });

    it('should skip matches with low confidence and include detail', async () => {
      mockPrisma.bankStatementMatch.findMany.mockResolvedValue([
        {
          id: 'match-1',
          tenantId,
          transactionId: 'tx-1',
          bankAmountCents: 100000,
          xeroAmountCents: 200000, // 100% difference, not a fee
          bankDescription: 'Random Transfer',
          isFeeAdjustedMatch: false,
          status: BankStatementMatchStatus.AMOUNT_MISMATCH,
        },
      ]);

      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.UNKNOWN,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([]);

      const result = (await service.correctExistingMatches(
        tenantId,
        userId,
        { dryRun: true },
      )) as FeeCorrectionPreview;

      expect(result.correctableMatches).toBe(0);
      expect(result.skipped).toHaveLength(1);
      // Verify enhanced skipped fields
      expect(result.skipped[0].bankDescription).toBe('Random Transfer');
      expect(result.skipped[0].bankAmountCents).toBe(100000);
      expect(result.skipped[0].xeroAmountCents).toBe(200000);
      expect(result.skipped[0].feeAmountCents).toBe(100000);
      expect(result.skipped[0].detectedType).toBe('UNKNOWN');
    });

    it('should skip already-corrected matches', async () => {
      mockPrisma.bankStatementMatch.findMany.mockResolvedValue([]);
      // The where clause filters isFeeAdjustedMatch: false

      const result = (await service.correctExistingMatches(
        tenantId,
        userId,
        { dryRun: true },
      )) as FeeCorrectionPreview;

      expect(result.totalMatches).toBe(0);
    });
  });

  describe('correctExistingMatches (apply)', () => {
    it('should apply corrections and return results', async () => {
      mockPrisma.bankStatementMatch.findMany.mockResolvedValue([
        {
          id: 'match-1',
          tenantId,
          transactionId: 'tx-1',
          bankAmountCents: 1000000,
          xeroAmountCents: 1001470,
          bankDescription: 'ADT Fridge Deposit',
          isFeeAdjustedMatch: false,
          status: BankStatementMatchStatus.MATCHED,
        },
      ]);

      mockBankFeeService.detectTransactionType.mockReturnValue(
        TransactionType.ADT_DEPOSIT,
      );
      mockBankFeeService.calculateFees.mockResolvedValue([
        {
          feeType: 'ADT_DEPOSIT_FEE',
          feeAmountCents: 1470,
          appliedRule: {},
          description: 'ADT fee',
        },
      ]);

      // Mock for applyFeeCorrection
      mockPrisma.transaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        tenantId,
        amountCents: 1001470,
        xeroId: 'xero-1',
      });
      mockPrisma.bankStatementMatch.findFirst.mockResolvedValue({
        id: 'match-1',
        tenantId,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'ADT Fridge Deposit',
        bankAmountCents: 1000000,
        xeroAmountCents: 1001470,
      });
      mockPrisma.accruedBankCharge.create.mockResolvedValue({
        id: 'accrued-1',
      });

      const result = (await service.correctExistingMatches(
        tenantId,
        userId,
        { dryRun: false },
      )) as FeeCorrectionApplyResult;

      expect(result.corrected).toBe(1);
      expect(result.totalFeesCents).toBe(1470);
      expect(result.corrections).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('matchMonthlyFeeTransactions', () => {
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-31');

    it('should match accrued fee totals to monthly charge transactions', async () => {
      // 3 ADT deposits with R14.70 fee each = R44.10 total
      mockPrisma.accruedBankCharge.findMany.mockResolvedValue([
        { id: 'ac-1', feeType: 'ADT_DEPOSIT_FEE', accruedAmountCents: 1470 },
        { id: 'ac-2', feeType: 'ADT_DEPOSIT_FEE', accruedAmountCents: 1470 },
        { id: 'ac-3', feeType: 'ADT_DEPOSIT_FEE', accruedAmountCents: 1470 },
      ]);

      // Monthly fee transaction of R44.10
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'fee-tx-1',
          description: '#Cash Deposit Fee',
          amountCents: 4410,
          isCredit: false,
          isDeleted: false,
          date: new Date('2025-01-28'),
        },
      ]);

      const result = await service.matchMonthlyFeeTransactions(
        tenantId,
        userId,
        startDate,
        endDate,
      );

      expect(result.matchedCount).toBe(1);
      expect(result.totalMatchedCents).toBe(4410);
      expect(result.matches[0].feeType).toBe('ADT_DEPOSIT_FEE');
      expect(result.matches[0].chargeTransactionId).toBe('fee-tx-1');

      // All 3 accrued charges should be updated
      expect(mockPrisma.accruedBankCharge.update).toHaveBeenCalledTimes(3);
    });

    it('should report unmatched when no fee transaction found', async () => {
      mockPrisma.accruedBankCharge.findMany.mockResolvedValue([
        { id: 'ac-1', feeType: 'EFT_CREDIT_FEE', accruedAmountCents: 575 },
      ]);

      // No matching fee transactions
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.matchMonthlyFeeTransactions(
        tenantId,
        userId,
        startDate,
        endDate,
      );

      expect(result.matchedCount).toBe(0);
      expect(result.unmatched).toHaveLength(1);
      expect(result.unmatched[0].feeType).toBe('EFT_CREDIT_FEE');
    });

    it('should return empty result when no accrued charges exist', async () => {
      mockPrisma.accruedBankCharge.findMany.mockResolvedValue([]);

      const result = await service.matchMonthlyFeeTransactions(
        tenantId,
        userId,
        startDate,
        endDate,
      );

      expect(result.matchedCount).toBe(0);
      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);
    });

    it('should not match fee transactions that are not fee-like', async () => {
      mockPrisma.accruedBankCharge.findMany.mockResolvedValue([
        { id: 'ac-1', feeType: 'ADT_DEPOSIT_FEE', accruedAmountCents: 1470 },
      ]);

      // Transaction exists with matching amount but non-fee description
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'non-fee-tx',
          description: 'Grocery Store Purchase',
          amountCents: 1470,
          isCredit: false,
          isDeleted: false,
          date: new Date('2025-01-20'),
        },
      ]);

      const result = await service.matchMonthlyFeeTransactions(
        tenantId,
        userId,
        startDate,
        endDate,
      );

      expect(result.matchedCount).toBe(0);
      expect(result.unmatched).toHaveLength(1);
    });

    it('should match within tolerance of R1.00', async () => {
      mockPrisma.accruedBankCharge.findMany.mockResolvedValue([
        { id: 'ac-1', feeType: 'ADT_DEPOSIT_FEE', accruedAmountCents: 4410 },
      ]);

      // Fee transaction is R44.50 vs accrued R44.10 (R0.40 diff, within R1.00 tolerance)
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'fee-tx-1',
          description: '#Cash Deposit Fee',
          amountCents: 4450,
          isCredit: false,
          isDeleted: false,
          date: new Date('2025-01-28'),
        },
      ]);

      const result = await service.matchMonthlyFeeTransactions(
        tenantId,
        userId,
        startDate,
        endDate,
      );

      expect(result.matchedCount).toBe(1);
    });
  });
});
