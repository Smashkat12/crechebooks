<task_spec id="TASK-RECON-011" version="3.0">

<metadata>
  <title>Bank Reconciliation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>34</sequence>
  <implements>
    <requirement_ref>REQ-RECON-001</requirement_ref>
    <requirement_ref>REQ-RECON-002</requirement_ref>
    <requirement_ref>REQ-RECON-004</requirement_ref>
    <requirement_ref>REQ-RECON-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-RECON-001</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
ReconciliationService handles bank reconciliation for the creche.

**What it does:**
- Match bank statement transactions against Xero records
- Validate accounting equation: opening + deposits - withdrawals = closing
- Mark matched transactions as reconciled (protected from future edits)
- Detect discrepancies when balances don't match
- Generate reconciliation summaries for accountants

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers) - never rands as floats
- Use Decimal.js ONLY for calculations, return integers
- Banker's rounding (ROUND_HALF_EVEN) for all rounding
- Discrepancy tolerance: 1 cent (|discrepancy| <= 1 = RECONCILED)
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries
- Reconciled transactions are IMMUTABLE - cannot be modified
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/ - it doesn't exist):

```
src/database/
├── services/
│   └── reconciliation.service.ts   # ReconciliationService class
├── dto/
│   └── reconciliation-service.dto.ts  # Service-specific DTOs
│   └── reconciliation.dto.ts       # ALREADY EXISTS - entity DTOs
├── repositories/
│   └── reconciliation.repository.ts  # ALREADY EXISTS
│   └── transaction.repository.ts     # ALREADY EXISTS - needs methods added
├── entities/
│   └── reconciliation.entity.ts    # ALREADY EXISTS - has ReconciliationStatus enum
└── database.module.ts              # Add to providers and exports

tests/database/services/
└── reconciliation.service.spec.ts  # Integration tests with real DB
```
</project_structure>

<existing_infrastructure>
ALREADY EXISTS - DO NOT RECREATE:

**ReconciliationRepository (src/database/repositories/reconciliation.repository.ts):**
- create(), findById(), findByTenantAndAccount(), findByTenantId()
- update(), complete(), delete(), calculateDiscrepancy()
- findWithDiscrepancies(), findInProgress(), findByBankAccount()

**ReconciliationStatus enum (src/database/entities/reconciliation.entity.ts):**
```typescript
export enum ReconciliationStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  RECONCILED = 'RECONCILED',
  DISCREPANCY = 'DISCREPANCY',
}
```

**TransactionRepository (src/database/repositories/transaction.repository.ts):**
- create(), createMany(), findById(), findByTenant()
- findByIds(), markReconciled(), update(), softDelete()

**NEEDS ADDING to TransactionRepository:**
```typescript
// Add these methods to existing repository
async findByPeriodAndAccount(
  tenantId: string,
  bankAccount: string,
  periodStart: Date,
  periodEnd: Date,
  filter?: { isReconciled?: boolean }
): Promise<Transaction[]>

async markManyReconciled(tenantId: string, ids: string[]): Promise<number>
```

**Existing DTOs (src/database/dto/reconciliation.dto.ts):**
- CreateReconciliationDto, UpdateReconciliationDto
- CompleteReconciliationDto, ReconciliationFilterDto
</existing_infrastructure>

<files_to_create>
1. src/database/services/reconciliation.service.ts
2. src/database/dto/reconciliation-service.dto.ts  # Service-specific DTOs
3. tests/database/services/reconciliation.service.spec.ts
</files_to_create>

<files_to_modify>
1. src/database/repositories/transaction.repository.ts - Add findByPeriodAndAccount, markManyReconciled
2. src/database/services/index.ts - Add `export * from './reconciliation.service';`
3. src/database/dto/index.ts - Add `export * from './reconciliation-service.dto';`
4. src/database/database.module.ts - Add ReconciliationService to providers and exports
</files_to_modify>

<implementation_reference>

## Service DTOs (src/database/dto/reconciliation-service.dto.ts)
```typescript
import { IsString, IsDateString, IsInt, IsUUID, MinLength } from 'class-validator';

export class ReconcileDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  bankAccount!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsInt()
  openingBalanceCents!: number;

  @IsInt()
  closingBalanceCents!: number;
}

export interface BalanceCalculation {
  openingBalanceCents: number;
  totalCreditsCents: number;
  totalDebitsCents: number;
  calculatedBalanceCents: number;
  transactionCount: number;
}

export interface ReconcileResult {
  id: string;
  status: 'IN_PROGRESS' | 'RECONCILED' | 'DISCREPANCY';
  openingBalanceCents: number;
  closingBalanceCents: number;
  calculatedBalanceCents: number;
  discrepancyCents: number;
  matchedCount: number;
  unmatchedCount: number;
}

export interface MatchResult {
  matchedCount: number;
  unmatchedCount: number;
  matchedTransactionIds: string[];
}
```

## Service (src/database/services/reconciliation.service.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ReconciliationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import { TransactionRepository } from '../repositories/transaction.repository';
import {
  ReconcileDto,
  ReconcileResult,
  BalanceCalculation,
  MatchResult,
} from '../dto/reconciliation-service.dto';
import { ConflictException, NotFoundException, BusinessException } from '../../shared/exceptions';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationRepo: ReconciliationRepository,
    private readonly transactionRepo: TransactionRepository,
  ) {}

  /**
   * Reconcile a bank account for a period
   * Formula: opening + credits - debits = calculated closing
   * Status = RECONCILED if |discrepancy| <= 1 cent, else DISCREPANCY
   */
  async reconcile(dto: ReconcileDto, userId: string): Promise<ReconcileResult> {
    // Validate inputs
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodStart > periodEnd) {
      throw new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        { periodStart: dto.periodStart, periodEnd: dto.periodEnd }
      );
    }

    // Check existing reconciliation
    const existing = await this.reconciliationRepo.findByTenantAndAccount(
      dto.tenantId,
      dto.bankAccount,
      periodStart
    );
    if (existing?.status === ReconciliationStatus.RECONCILED) {
      throw new ConflictException(
        `Period already reconciled for bank account ${dto.bankAccount}`,
        { periodStart: dto.periodStart, status: existing.status }
      );
    }

    // Calculate balance from transactions
    const calculation = await this.calculateBalance(
      dto.tenantId,
      dto.bankAccount,
      periodStart,
      periodEnd,
      dto.openingBalanceCents
    );

    // Determine discrepancy and status
    const discrepancyCents = dto.closingBalanceCents - calculation.calculatedBalanceCents;
    const status = Math.abs(discrepancyCents) <= 1
      ? ReconciliationStatus.RECONCILED
      : ReconciliationStatus.DISCREPANCY;

    // Transactional: create record and mark transactions
    return await this.prisma.$transaction(async (tx) => {
      // Create or update reconciliation record
      let reconciliation;
      if (existing) {
        reconciliation = await tx.reconciliation.update({
          where: { id: existing.id },
          data: {
            closingBalanceCents: dto.closingBalanceCents,
            calculatedBalanceCents: calculation.calculatedBalanceCents,
            discrepancyCents,
            status,
            reconciledBy: status === ReconciliationStatus.RECONCILED ? userId : null,
            reconciledAt: status === ReconciliationStatus.RECONCILED ? new Date() : null,
          },
        });
      } else {
        reconciliation = await tx.reconciliation.create({
          data: {
            tenantId: dto.tenantId,
            bankAccount: dto.bankAccount,
            periodStart,
            periodEnd,
            openingBalanceCents: dto.openingBalanceCents,
            closingBalanceCents: dto.closingBalanceCents,
            calculatedBalanceCents: calculation.calculatedBalanceCents,
            discrepancyCents,
            status,
            reconciledBy: status === ReconciliationStatus.RECONCILED ? userId : null,
            reconciledAt: status === ReconciliationStatus.RECONCILED ? new Date() : null,
          },
        });
      }

      // If reconciled, mark all transactions in period as reconciled
      let matchedCount = 0;
      if (status === ReconciliationStatus.RECONCILED) {
        const result = await tx.transaction.updateMany({
          where: {
            tenantId: dto.tenantId,
            bankAccount: dto.bankAccount,
            date: { gte: periodStart, lte: periodEnd },
            isReconciled: false,
            isDeleted: false,
          },
          data: {
            isReconciled: true,
            reconciledAt: new Date(),
          },
        });
        matchedCount = result.count;
      }

      this.logger.log(
        `Reconciliation ${reconciliation.id}: status=${status}, discrepancy=${discrepancyCents}c, matched=${matchedCount}`
      );

      return {
        id: reconciliation.id,
        status: reconciliation.status,
        openingBalanceCents: reconciliation.openingBalanceCents,
        closingBalanceCents: reconciliation.closingBalanceCents,
        calculatedBalanceCents: calculation.calculatedBalanceCents,
        discrepancyCents,
        matchedCount,
        unmatchedCount: calculation.transactionCount - matchedCount,
      };
    });
  }

  /**
   * Calculate balance from transactions in period
   * opening + credits - debits = calculated
   */
  async calculateBalance(
    tenantId: string,
    bankAccount: string,
    periodStart: Date,
    periodEnd: Date,
    openingBalanceCents: number
  ): Promise<BalanceCalculation> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount,
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
      },
    });

    let totalCredits = new Decimal(0);
    let totalDebits = new Decimal(0);

    for (const tx of transactions) {
      if (tx.isCredit) {
        totalCredits = totalCredits.plus(tx.amountCents);
      } else {
        totalDebits = totalDebits.plus(tx.amountCents);
      }
    }

    const calculatedBalance = new Decimal(openingBalanceCents)
      .plus(totalCredits)
      .minus(totalDebits);

    return {
      openingBalanceCents,
      totalCreditsCents: totalCredits.toNumber(),
      totalDebitsCents: totalDebits.toNumber(),
      calculatedBalanceCents: calculatedBalance.round().toNumber(),
      transactionCount: transactions.length,
    };
  }

  /**
   * Get unreconciled transactions for a period
   */
  async getUnmatched(
    tenantId: string,
    bankAccount: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Transaction[]> {
    return await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount,
        date: { gte: periodStart, lte: periodEnd },
        isReconciled: false,
        isDeleted: false,
      },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Manually match specific transactions to reconciliation
   */
  async matchTransactions(
    tenantId: string,
    reconId: string,
    transactionIds: string[]
  ): Promise<MatchResult> {
    if (transactionIds.length === 0) {
      return { matchedCount: 0, unmatchedCount: 0, matchedTransactionIds: [] };
    }

    const recon = await this.reconciliationRepo.findById(reconId);
    if (!recon) {
      throw new NotFoundException('Reconciliation', reconId);
    }
    if (recon.tenantId !== tenantId) {
      throw new NotFoundException('Reconciliation', reconId);
    }
    if (recon.status === ReconciliationStatus.RECONCILED) {
      throw new ConflictException(
        'Cannot modify transactions in a reconciled period',
        { reconId, status: recon.status }
      );
    }

    // Validate transactions
    const transactions = await this.prisma.transaction.findMany({
      where: {
        id: { in: transactionIds },
        tenantId,
        bankAccount: recon.bankAccount,
        date: { gte: recon.periodStart, lte: recon.periodEnd },
        isDeleted: false,
      },
    });

    if (transactions.length === 0) {
      return { matchedCount: 0, unmatchedCount: transactionIds.length, matchedTransactionIds: [] };
    }

    // Mark as reconciled
    const validIds = transactions.map(t => t.id);
    await this.prisma.transaction.updateMany({
      where: { id: { in: validIds } },
      data: { isReconciled: true, reconciledAt: new Date() },
    });

    return {
      matchedCount: validIds.length,
      unmatchedCount: transactionIds.length - validIds.length,
      matchedTransactionIds: validIds,
    };
  }
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database - NO MOCKS.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { ReconciliationService } from '../../src/database/services/reconciliation.service';
import { ReconciliationRepository } from '../../src/database/repositories/reconciliation.repository';
import { TransactionRepository } from '../../src/database/repositories/transaction.repository';
import { ReconciliationStatus, Tenant, Transaction } from '@prisma/client';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: { id: string };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        ReconciliationService,
        ReconciliationRepository,
        TransactionRepository,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<ReconciliationService>(ReconciliationService);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean in FK order - CRITICAL
    await prisma.reconciliation.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Recon Test Creche',
        email: 'recon@test.co.za',
        taxStatus: 'VAT_REGISTERED',
        // ... required fields
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: 'accountant@test.co.za',
        role: 'ACCOUNTANT',
        // ... required fields
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('reconcile()', () => {
    it('should reconcile when calculated = closing balance', async () => {
      // Create transactions: +10000c, -3000c (net +7000c)
      await prisma.transaction.createMany({
        data: [
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB-001',
            date: new Date('2025-01-15'),
            amountCents: 10000,
            isCredit: true,
            description: 'Deposit',
          },
          {
            tenantId: testTenant.id,
            bankAccount: 'FNB-001',
            date: new Date('2025-01-20'),
            amountCents: 3000,
            isCredit: false,
            description: 'Withdrawal',
          },
        ],
      });

      const result = await service.reconcile({
        tenantId: testTenant.id,
        bankAccount: 'FNB-001',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        openingBalanceCents: 50000,  // R500
        closingBalanceCents: 57000,  // R570 = 500 + 100 - 30
      }, testUser.id);

      expect(result.status).toBe(ReconciliationStatus.RECONCILED);
      expect(result.discrepancyCents).toBe(0);
      expect(result.matchedCount).toBe(2);
    });

    it('should detect discrepancy when balances differ', async () => {
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          amountCents: 10000,
          isCredit: true,
          description: 'Deposit',
        },
      });

      const result = await service.reconcile({
        tenantId: testTenant.id,
        bankAccount: 'FNB-001',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        openingBalanceCents: 50000,
        closingBalanceCents: 65000,  // Wrong - should be 60000
      }, testUser.id);

      expect(result.status).toBe(ReconciliationStatus.DISCREPANCY);
      expect(result.discrepancyCents).toBe(5000);
      expect(result.matchedCount).toBe(0);  // Not reconciled
    });

    it('should throw on already reconciled period', async () => {
      // Create reconciled period
      await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 60000,
          calculatedBalanceCents: 60000,
          discrepancyCents: 0,
          status: ReconciliationStatus.RECONCILED,
          reconciledBy: testUser.id,
          reconciledAt: new Date(),
        },
      });

      await expect(service.reconcile({
        tenantId: testTenant.id,
        bankAccount: 'FNB-001',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        openingBalanceCents: 50000,
        closingBalanceCents: 60000,
      }, testUser.id)).rejects.toThrow('already reconciled');
    });

    it('should handle period with no transactions', async () => {
      const result = await service.reconcile({
        tenantId: testTenant.id,
        bankAccount: 'FNB-001',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
        openingBalanceCents: 50000,
        closingBalanceCents: 50000,  // No change
      }, testUser.id);

      expect(result.status).toBe(ReconciliationStatus.RECONCILED);
      expect(result.calculatedBalanceCents).toBe(50000);
      expect(result.transactionCount).toBe(0);
    });
  });

  describe('calculateBalance()', () => {
    it('should correctly calculate opening + credits - debits', async () => {
      await prisma.transaction.createMany({
        data: [
          { tenantId: testTenant.id, bankAccount: 'FNB', date: new Date(), amountCents: 10000, isCredit: true, description: 'In' },
          { tenantId: testTenant.id, bankAccount: 'FNB', date: new Date(), amountCents: 5000, isCredit: true, description: 'In' },
          { tenantId: testTenant.id, bankAccount: 'FNB', date: new Date(), amountCents: 3000, isCredit: false, description: 'Out' },
        ],
      });

      const result = await service.calculateBalance(
        testTenant.id,
        'FNB',
        new Date('2025-01-01'),
        new Date('2025-12-31'),
        100000  // R1000 opening
      );

      // 100000 + 15000 - 3000 = 112000
      expect(result.calculatedBalanceCents).toBe(112000);
      expect(result.totalCreditsCents).toBe(15000);
      expect(result.totalDebitsCents).toBe(3000);
    });
  });

  describe('matchTransactions()', () => {
    it('should not allow matching on reconciled period', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 0,
          closingBalanceCents: 0,
          calculatedBalanceCents: 0,
          discrepancyCents: 0,
          status: ReconciliationStatus.RECONCILED,
        },
      });

      await expect(service.matchTransactions(
        testTenant.id,
        recon.id,
        ['some-tx-id']
      )).rejects.toThrow('reconciled');
    });
  });
});
```
</test_requirements>

<validation_criteria>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- Reconciliation formula: opening + credits - debits = calculated
- Status = RECONCILED only when |discrepancy| <= 1 cent
- Status = DISCREPANCY when |discrepancy| > 1 cent
- Reconciled transactions marked with isReconciled=true
- Cannot re-reconcile already reconciled periods
- Tenant isolation enforced on all queries
- Empty periods reconcile correctly (no transactions)
- Decimal.js with banker's rounding used
- No 'any' types used
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPattern="reconciliation.service" --verbose
</test_commands>

</task_spec>
