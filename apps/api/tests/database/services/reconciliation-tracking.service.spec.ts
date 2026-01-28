/**
 * Reconciliation Tracking Tests
 * TASK-RECON-004: Duplicate Detection
 * TASK-RECON-005: Manual Match Override with tracking and undo
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BankStatementMatchRepository } from '../../../src/database/repositories/bank-statement-match.repository';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import { LLMWhispererParser } from '../../../src/database/parsers/llmwhisperer-parser';
import { ToleranceConfigService } from '../../../src/database/services/tolerance-config.service';
import {
  BankStatementReconciliationService,
  ManualMatchOptions,
} from '../../../src/database/services/bank-statement-reconciliation.service';
import {
  BankStatementMatchStatus,
  DuplicateResolutionStatus,
  BankMatchType,
  ParsedBankTransaction,
} from '../../../src/database/entities/bank-statement-match.entity';
import { AccruedBankChargeService } from '../../../src/database/services/accrued-bank-charge.service';
import { BankFeeService } from '../../../src/database/services/bank-fee.service';
import { BusinessException } from '../../../src/shared/exceptions';

describe('BankStatementReconciliationService - RECON-004 & RECON-005', () => {
  let service: BankStatementReconciliationService;
  let prismaService: jest.Mocked<PrismaService>;
  let matchRepo: jest.Mocked<BankStatementMatchRepository>;
  let toleranceConfig: jest.Mocked<ToleranceConfigService>;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockMatchId = 'match-789';
  const mockTransactionId = 'tx-abc';

  beforeEach(async () => {
    const mockPrismaService = {
      bankStatementMatch: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      duplicateResolution: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      manualMatchHistory: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      transaction: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      reconciliation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockMatchRepo = {
      findById: jest.fn(),
      findByReconciliationId: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };

    const mockToleranceConfig = {
      isWithinTolerance: jest.fn().mockReturnValue(true),
      isBalanceWithinTolerance: jest.fn().mockReturnValue(true),
      isDateWithinTolerance: jest.fn().mockReturnValue(true),
      isDescriptionMatch: jest.fn().mockReturnValue(true),
      getEffectiveTolerance: jest.fn().mockReturnValue(100),
      descriptionSimilarityThreshold: 0.7,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankStatementReconciliationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BankStatementMatchRepository, useValue: mockMatchRepo },
        { provide: ReconciliationRepository, useValue: {} },
        { provide: LLMWhispererParser, useValue: {} },
        { provide: ToleranceConfigService, useValue: mockToleranceConfig },
        { provide: AccruedBankChargeService, useValue: { getAccruedCharges: jest.fn().mockResolvedValue([]), createAccruedCharge: jest.fn().mockResolvedValue({}) } },
        { provide: BankFeeService, useValue: { detectBankFees: jest.fn().mockResolvedValue([]), categorizeBankFee: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get<BankStatementReconciliationService>(
      BankStatementReconciliationService,
    );
    prismaService = module.get(PrismaService);
    matchRepo = module.get(BankStatementMatchRepository);
    toleranceConfig = module.get(ToleranceConfigService);
  });

  // =====================================================
  // TASK-RECON-004: Duplicate Detection Tests
  // =====================================================

  describe('Duplicate Detection (RECON-004)', () => {
    describe('detectDuplicates', () => {
      it('should detect exact duplicate entries', async () => {
        const entries: ParsedBankTransaction[] = [
          {
            date: new Date('2026-01-15'),
            description: 'Payment from Client ABC',
            amountCents: 100000,
            isCredit: true,
          },
        ];

        const existingMatch = {
          id: 'existing-match-1',
          tenantId: mockTenantId,
          reconciliationId: 'recon-1',
          bankDate: new Date('2026-01-15'),
          bankDescription: 'Payment from Client ABC',
          bankAmountCents: 100000,
          bankIsCredit: true,
          createdAt: new Date(),
        };

        (
          prismaService.bankStatementMatch.findFirst as jest.Mock
        ).mockResolvedValue(existingMatch);

        const duplicates = await service.detectDuplicates(
          mockTenantId,
          entries,
        );

        expect(duplicates).toHaveLength(1);
        expect(duplicates[0].confidence).toBeGreaterThanOrEqual(0.8);
        expect(duplicates[0].existingEntry.id).toBe('existing-match-1');
      });

      it('should not flag entries with different amounts as duplicates', async () => {
        const entries: ParsedBankTransaction[] = [
          {
            date: new Date('2026-01-15'),
            description: 'Payment from Client ABC',
            amountCents: 200000, // Different amount
            isCredit: true,
          },
        ];

        (
          prismaService.bankStatementMatch.findFirst as jest.Mock
        ).mockResolvedValue(null);

        const duplicates = await service.detectDuplicates(
          mockTenantId,
          entries,
        );

        expect(duplicates).toHaveLength(0);
      });

      it('should generate correct composite key', async () => {
        const entries: ParsedBankTransaction[] = [
          {
            date: new Date('2026-01-15'),
            description: 'REF:12345 Payment for Services',
            amountCents: 50000,
            isCredit: false,
          },
        ];

        (
          prismaService.bankStatementMatch.findFirst as jest.Mock
        ).mockResolvedValue(null);

        await service.detectDuplicates(mockTenantId, entries);

        expect(prismaService.bankStatementMatch.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              tenantId: mockTenantId,
              bankDate: entries[0].date,
              bankAmountCents: 50000,
              bankIsCredit: false,
            }),
          }),
        );
      });

      it('should return empty array for no duplicates', async () => {
        const entries: ParsedBankTransaction[] = [
          {
            date: new Date('2026-01-15'),
            description: 'Unique Transaction',
            amountCents: 12345,
            isCredit: true,
          },
        ];

        (
          prismaService.bankStatementMatch.findFirst as jest.Mock
        ).mockResolvedValue(null);

        const duplicates = await service.detectDuplicates(
          mockTenantId,
          entries,
        );

        expect(duplicates).toHaveLength(0);
      });
    });

    describe('markDuplicateAsFalsePositive', () => {
      it('should create false positive resolution', async () => {
        const compositeKey = '2026-01-15|100000|payment from client';

        (
          prismaService.duplicateResolution.upsert as jest.Mock
        ).mockResolvedValue({
          id: 'resolution-1',
          tenantId: mockTenantId,
          compositeKey,
          status: DuplicateResolutionStatus.FALSE_POSITIVE,
          resolvedBy: mockUserId,
          resolvedAt: new Date(),
          notes: 'Different transaction, same details',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await service.markDuplicateAsFalsePositive(
          mockTenantId,
          compositeKey,
          mockUserId,
          'Different transaction, same details',
        );

        expect(prismaService.duplicateResolution.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              tenantId_compositeKey: { tenantId: mockTenantId, compositeKey },
            },
            create: expect.objectContaining({
              tenantId: mockTenantId,
              compositeKey,
              status: DuplicateResolutionStatus.FALSE_POSITIVE,
              resolvedBy: mockUserId,
            }),
          }),
        );
      });
    });

    describe('confirmDuplicate', () => {
      it('should create confirmed duplicate resolution', async () => {
        const compositeKey = '2026-01-15|100000|payment from client';

        (
          prismaService.duplicateResolution.upsert as jest.Mock
        ).mockResolvedValue({
          id: 'resolution-1',
          tenantId: mockTenantId,
          compositeKey,
          status: DuplicateResolutionStatus.CONFIRMED_DUPLICATE,
          resolvedBy: mockUserId,
          resolvedAt: new Date(),
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await service.confirmDuplicate(mockTenantId, compositeKey, mockUserId);

        expect(prismaService.duplicateResolution.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              status: DuplicateResolutionStatus.CONFIRMED_DUPLICATE,
            }),
          }),
        );
      });
    });

    describe('getDuplicateResolution', () => {
      it('should return resolution if exists', async () => {
        const compositeKey = '2026-01-15|100000|payment';

        (
          prismaService.duplicateResolution.findUnique as jest.Mock
        ).mockResolvedValue({
          id: 'resolution-1',
          tenantId: mockTenantId,
          compositeKey,
          status: DuplicateResolutionStatus.FALSE_POSITIVE,
          resolvedBy: mockUserId,
          resolvedAt: new Date('2026-01-15'),
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const result = await service.getDuplicateResolution(
          mockTenantId,
          compositeKey,
        );

        expect(result).not.toBeNull();
        expect(result?.status).toBe(DuplicateResolutionStatus.FALSE_POSITIVE);
        expect(result?.resolvedBy).toBe(mockUserId);
      });

      it('should return null if no resolution exists', async () => {
        (
          prismaService.duplicateResolution.findUnique as jest.Mock
        ).mockResolvedValue(null);

        const result = await service.getDuplicateResolution(
          mockTenantId,
          'nonexistent',
        );

        expect(result).toBeNull();
      });
    });

    describe('getDuplicateResolutionHistory', () => {
      it('should return paginated history', async () => {
        (
          prismaService.duplicateResolution.findMany as jest.Mock
        ).mockResolvedValue([
          {
            id: '1',
            tenantId: mockTenantId,
            compositeKey: 'key-1',
            status: DuplicateResolutionStatus.CONFIRMED_DUPLICATE,
            resolvedBy: mockUserId,
            resolvedAt: new Date(),
            notes: 'Test',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);

        const result = await service.getDuplicateResolutionHistory(
          mockTenantId,
          {
            limit: 10,
            offset: 0,
          },
        );

        expect(result).toHaveLength(1);
        expect(prismaService.duplicateResolution.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 10,
            skip: 0,
          }),
        );
      });

      it('should filter by status', async () => {
        (
          prismaService.duplicateResolution.findMany as jest.Mock
        ).mockResolvedValue([]);

        await service.getDuplicateResolutionHistory(mockTenantId, {
          status: DuplicateResolutionStatus.FALSE_POSITIVE,
        });

        expect(prismaService.duplicateResolution.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              status: DuplicateResolutionStatus.FALSE_POSITIVE,
            }),
          }),
        );
      });
    });
  });

  // =====================================================
  // TASK-RECON-005: Manual Match Override Tests
  // =====================================================

  describe('Manual Match Override (RECON-005)', () => {
    const mockMatch = {
      id: mockMatchId,
      tenantId: mockTenantId,
      reconciliationId: 'recon-1',
      bankDate: new Date('2026-01-15'),
      bankDescription: 'Bank Payment',
      bankAmountCents: 100000,
      bankIsCredit: true,
      transactionId: null,
      status: BankStatementMatchStatus.IN_BANK_ONLY,
      // Xero/CrecheBooks side (nullable fields)
      xeroDate: null as Date | null,
      xeroDescription: null as string | null,
      xeroAmountCents: null as number | null,
      xeroIsCredit: null as boolean | null,
      // Match result fields
      matchConfidence: null,
      discrepancyReason: null as string | null,
      // Fee tracking fields (TASK-RECON-036)
      isFeeAdjustedMatch: false,
      feeType: null as string | null,
      accruedFeeAmountCents: null as number | null,
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockTransaction = {
      id: mockTransactionId,
      tenantId: mockTenantId,
      date: new Date('2026-01-15'),
      description: 'System Payment',
      amountCents: 100000,
      isCredit: true,
    };

    describe('manualMatchWithTracking', () => {
      it('should create manual match with history', async () => {
        matchRepo.findById.mockResolvedValue(mockMatch);
        (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue(
          mockTransaction,
        );
        matchRepo.update.mockResolvedValue({
          ...mockMatch,
          transactionId: mockTransactionId,
          status: BankStatementMatchStatus.MATCHED,
        });
        (
          prismaService.manualMatchHistory.create as jest.Mock
        ).mockResolvedValue({} as any);
        matchRepo.findByReconciliationId.mockResolvedValue([]);
        (
          prismaService.reconciliation.findUnique as jest.Mock
        ).mockResolvedValue({
          id: 'recon-1',
          discrepancyCents: 0,
          status: 'IN_PROGRESS',
        } as any);

        const options: ManualMatchOptions = {
          userId: mockUserId,
          reason: 'Confirmed by customer statement',
        };

        const result = await service.manualMatchWithTracking(
          mockTenantId,
          mockMatchId,
          mockTransactionId,
          options,
        );

        expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
        expect(result.matchType).toBe(BankMatchType.MANUAL);
        expect(result.matchConfidence).toBe(1.0);
        expect(prismaService.manualMatchHistory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tenantId: mockTenantId,
              matchId: mockMatchId,
              newTransactionId: mockTransactionId,
              performedBy: mockUserId,
              action: 'MATCH',
              reason: 'Confirmed by customer statement',
            }),
          }),
        );
      });

      it('should reject if amounts are incompatible', async () => {
        const incompatibleMatch = {
          ...mockMatch,
          bankAmountCents: 100000,
        };
        const incompatibleTransaction = {
          ...mockTransaction,
          amountCents: 200000, // 100% difference > 10% tolerance
        };

        matchRepo.findById.mockResolvedValue(incompatibleMatch);
        (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue(
          incompatibleTransaction,
        );

        await expect(
          service.manualMatchWithTracking(
            mockTenantId,
            mockMatchId,
            mockTransactionId,
            { userId: mockUserId },
          ),
        ).rejects.toThrow(BusinessException);
      });

      it('should throw if match not found', async () => {
        matchRepo.findById.mockResolvedValue(null);

        await expect(
          service.manualMatchWithTracking(
            mockTenantId,
            'nonexistent',
            mockTransactionId,
            { userId: mockUserId },
          ),
        ).rejects.toThrow(BusinessException);
      });

      it('should throw if transaction not found', async () => {
        matchRepo.findById.mockResolvedValue(mockMatch);
        (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue(
          null,
        );

        await expect(
          service.manualMatchWithTracking(
            mockTenantId,
            mockMatchId,
            'nonexistent',
            { userId: mockUserId },
          ),
        ).rejects.toThrow(BusinessException);
      });

      it('should throw if transaction belongs to different tenant', async () => {
        matchRepo.findById.mockResolvedValue(mockMatch);
        (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue({
          ...mockTransaction,
          tenantId: 'different-tenant',
        });

        await expect(
          service.manualMatchWithTracking(
            mockTenantId,
            mockMatchId,
            mockTransactionId,
            { userId: mockUserId },
          ),
        ).rejects.toThrow(BusinessException);
      });
    });

    describe('unmatchWithTracking', () => {
      it('should unmatch and record history', async () => {
        const matchedRecord = {
          ...mockMatch,
          transactionId: mockTransactionId,
          status: BankStatementMatchStatus.MATCHED,
        };

        matchRepo.findById.mockResolvedValue(matchedRecord);
        matchRepo.update.mockResolvedValue({
          ...matchedRecord,
          transactionId: null,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
        });
        (
          prismaService.manualMatchHistory.create as jest.Mock
        ).mockResolvedValue({} as any);
        (prismaService.transaction.update as jest.Mock).mockResolvedValue(
          mockTransaction,
        );
        matchRepo.findByReconciliationId.mockResolvedValue([]);
        (
          prismaService.reconciliation.findUnique as jest.Mock
        ).mockResolvedValue({
          id: 'recon-1',
          discrepancyCents: 0,
          status: 'IN_PROGRESS',
        } as any);

        const result = await service.unmatchWithTracking(
          mockTenantId,
          mockMatchId,
          { userId: mockUserId, reason: 'Incorrect match' },
        );

        expect(result.status).toBe(BankStatementMatchStatus.IN_BANK_ONLY);
        expect(result.previousTransactionId).toBe(mockTransactionId);
        expect(prismaService.manualMatchHistory.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              action: 'UNMATCH',
              previousTransactionId: mockTransactionId,
              newTransactionId: null,
            }),
          }),
        );
      });

      it('should throw if match is not currently matched', async () => {
        matchRepo.findById.mockResolvedValue(mockMatch); // transactionId is null

        await expect(
          service.unmatchWithTracking(mockTenantId, mockMatchId, {
            userId: mockUserId,
          }),
        ).rejects.toThrow(BusinessException);
      });

      it('should reset transaction is_reconciled flag', async () => {
        const matchedRecord = {
          ...mockMatch,
          transactionId: mockTransactionId,
          status: BankStatementMatchStatus.MATCHED,
        };

        matchRepo.findById.mockResolvedValue(matchedRecord);
        matchRepo.update.mockResolvedValue({
          ...matchedRecord,
          transactionId: null,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
        });
        (
          prismaService.manualMatchHistory.create as jest.Mock
        ).mockResolvedValue({} as any);
        (prismaService.transaction.update as jest.Mock).mockResolvedValue(
          mockTransaction,
        );
        matchRepo.findByReconciliationId.mockResolvedValue([]);
        (
          prismaService.reconciliation.findUnique as jest.Mock
        ).mockResolvedValue({
          id: 'recon-1',
          discrepancyCents: 0,
          status: 'IN_PROGRESS',
        } as any);

        await service.unmatchWithTracking(mockTenantId, mockMatchId, {
          userId: mockUserId,
        });

        expect(prismaService.transaction.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: mockTransactionId },
            data: expect.objectContaining({ isReconciled: false }),
          }),
        );
      });
    });

    describe('undoLastManualMatch', () => {
      it('should undo a MATCH action by unmatching', async () => {
        const matchHistory = {
          id: 'history-1',
          tenantId: mockTenantId,
          matchId: mockMatchId,
          previousTransactionId: null,
          newTransactionId: mockTransactionId,
          performedBy: mockUserId,
          performedAt: new Date(),
          action: 'MATCH',
          reason: null,
        };

        const currentMatch = {
          ...mockMatch,
          transactionId: mockTransactionId,
          status: BankStatementMatchStatus.MATCHED,
        };

        (
          prismaService.manualMatchHistory.findFirst as jest.Mock
        ).mockResolvedValue(matchHistory);
        matchRepo.findById.mockResolvedValue(currentMatch);
        matchRepo.update.mockResolvedValue({
          ...currentMatch,
          transactionId: null,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
        });
        (
          prismaService.manualMatchHistory.create as jest.Mock
        ).mockResolvedValue({} as any);
        (prismaService.transaction.update as jest.Mock).mockResolvedValue(
          mockTransaction,
        );
        matchRepo.findByReconciliationId.mockResolvedValue([]);
        (
          prismaService.reconciliation.findUnique as jest.Mock
        ).mockResolvedValue({
          id: 'recon-1',
          discrepancyCents: 0,
          status: 'IN_PROGRESS',
        } as any);

        const result = await service.undoLastManualMatch(
          mockTenantId,
          mockMatchId,
          mockUserId,
        );

        expect(result.status).toBe(BankStatementMatchStatus.IN_BANK_ONLY);
      });

      it('should undo an UNMATCH action by re-matching', async () => {
        const matchHistory = {
          id: 'history-1',
          tenantId: mockTenantId,
          matchId: mockMatchId,
          previousTransactionId: mockTransactionId,
          newTransactionId: null,
          performedBy: mockUserId,
          performedAt: new Date(),
          action: 'UNMATCH',
          reason: null,
        };

        (
          prismaService.manualMatchHistory.findFirst as jest.Mock
        ).mockResolvedValue(matchHistory);
        matchRepo.findById.mockResolvedValue(mockMatch);
        (prismaService.transaction.findUnique as jest.Mock).mockResolvedValue(
          mockTransaction,
        );
        matchRepo.update.mockResolvedValue({
          ...mockMatch,
          transactionId: mockTransactionId,
          status: BankStatementMatchStatus.MATCHED,
        });
        (
          prismaService.manualMatchHistory.create as jest.Mock
        ).mockResolvedValue({} as any);
        matchRepo.findByReconciliationId.mockResolvedValue([]);
        (
          prismaService.reconciliation.findUnique as jest.Mock
        ).mockResolvedValue({
          id: 'recon-1',
          discrepancyCents: 0,
          status: 'IN_PROGRESS',
        } as any);

        const result = await service.undoLastManualMatch(
          mockTenantId,
          mockMatchId,
          mockUserId,
        );

        expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
      });

      it('should throw if no history exists', async () => {
        (
          prismaService.manualMatchHistory.findFirst as jest.Mock
        ).mockResolvedValue(null);

        await expect(
          service.undoLastManualMatch(mockTenantId, mockMatchId, mockUserId),
        ).rejects.toThrow(BusinessException);
      });

      it('should throw if cannot restore previous state', async () => {
        const matchHistory = {
          id: 'history-1',
          tenantId: mockTenantId,
          matchId: mockMatchId,
          previousTransactionId: null, // No previous transaction
          newTransactionId: null,
          performedBy: mockUserId,
          performedAt: new Date(),
          action: 'UNMATCH',
          reason: null,
        };

        (
          prismaService.manualMatchHistory.findFirst as jest.Mock
        ).mockResolvedValue(matchHistory);
        matchRepo.findById.mockResolvedValue(mockMatch);

        await expect(
          service.undoLastManualMatch(mockTenantId, mockMatchId, mockUserId),
        ).rejects.toThrow(BusinessException);
      });
    });

    describe('getManualMatchHistory', () => {
      it('should return history for specific match', async () => {
        const history = [
          {
            id: 'h1',
            tenantId: mockTenantId,
            matchId: mockMatchId,
            previousTransactionId: null,
            newTransactionId: mockTransactionId,
            performedBy: mockUserId,
            performedAt: new Date(),
            action: 'MATCH',
            reason: 'Initial match',
          },
          {
            id: 'h2',
            tenantId: mockTenantId,
            matchId: mockMatchId,
            previousTransactionId: mockTransactionId,
            newTransactionId: null,
            performedBy: mockUserId,
            performedAt: new Date(),
            action: 'UNMATCH',
            reason: 'Correction',
          },
        ];

        (
          prismaService.manualMatchHistory.findMany as jest.Mock
        ).mockResolvedValue(history);

        const result = await service.getManualMatchHistory(
          mockTenantId,
          mockMatchId,
        );

        expect(result).toHaveLength(2);
        expect(result[0].action).toBe('MATCH');
        expect(result[1].action).toBe('UNMATCH');
      });
    });

    describe('getReconciliationManualMatchHistory', () => {
      it('should return history for all matches in reconciliation', async () => {
        const matches = [{ id: 'match-1' }, { id: 'match-2' }];

        matchRepo.findByReconciliationId.mockResolvedValue(matches as any);
        (
          prismaService.manualMatchHistory.findMany as jest.Mock
        ).mockResolvedValue([
          {
            id: 'h1',
            tenantId: mockTenantId,
            matchId: 'match-1',
            previousTransactionId: null,
            newTransactionId: 'tx-1',
            performedBy: mockUserId,
            performedAt: new Date(),
            action: 'MATCH',
            reason: null,
          },
        ]);

        const result = await service.getReconciliationManualMatchHistory(
          mockTenantId,
          'recon-1',
        );

        expect(result).toHaveLength(1);
        expect(prismaService.manualMatchHistory.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              matchId: { in: ['match-1', 'match-2'] },
            }),
          }),
        );
      });

      it('should return empty array if no matches exist', async () => {
        matchRepo.findByReconciliationId.mockResolvedValue([]);

        const result = await service.getReconciliationManualMatchHistory(
          mockTenantId,
          'recon-1',
        );

        expect(result).toHaveLength(0);
      });
    });
  });
});
