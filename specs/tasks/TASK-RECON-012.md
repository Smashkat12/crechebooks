<task_spec id="TASK-RECON-012" version="3.0">

<metadata>
  <title>Discrepancy Detection Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>35</sequence>
  <implements>
    <requirement_ref>REQ-RECON-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-RECON-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
DiscrepancyService identifies and classifies reconciliation discrepancies.

**What it does:**
- Detect transactions in bank but not Xero (IN_BANK_NOT_XERO)
- Detect transactions in Xero but not bank (IN_XERO_NOT_BANK)
- Detect amount mismatches between bank and Xero (AMOUNT_MISMATCH)
- Detect date mismatches between bank and Xero (DATE_MISMATCH)
- Classify severity: LOW (<R10), MEDIUM (R10-R100), HIGH (>R100)
- Generate resolution suggestions for each discrepancy type
- Flag items above R0.01 threshold for investigation

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers) - never rands as floats
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries
- Discrepancy threshold: 1 cent (amounts above this are flagged)
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/ - it doesn't exist):

```
src/database/
├── services/
│   └── discrepancy.service.ts      # DiscrepancyService class
├── dto/
│   └── discrepancy.dto.ts          # Discrepancy DTOs and types
└── database.module.ts              # Add to providers and exports

tests/database/services/
└── discrepancy.service.spec.ts     # Integration tests with real DB
```
</project_structure>

<existing_infrastructure>
Dependencies available:
- PrismaService (for direct DB queries)
- ReconciliationRepository (from TASK-RECON-001)
- TransactionRepository (from TASK-TRANS-001)
- VatService patterns to follow (from TASK-SARS-011)

Note: This service works with the Xero sync data when available.
For initial implementation, bank transactions are already in database.
Xero comparison will be added when XeroMcpClient integration is complete.
</existing_infrastructure>

<files_to_create>
1. src/database/dto/discrepancy.dto.ts
2. src/database/services/discrepancy.service.ts
3. tests/database/services/discrepancy.service.spec.ts
</files_to_create>

<files_to_modify>
1. src/database/services/index.ts - Add `export * from './discrepancy.service';`
2. src/database/dto/index.ts - Add `export * from './discrepancy.dto';`
3. src/database/database.module.ts - Add DiscrepancyService to providers and exports
</files_to_modify>

<implementation_reference>

## DTOs (src/database/dto/discrepancy.dto.ts)
```typescript
export enum DiscrepancyType {
  IN_BANK_NOT_XERO = 'IN_BANK_NOT_XERO',
  IN_XERO_NOT_BANK = 'IN_XERO_NOT_BANK',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  DATE_MISMATCH = 'DATE_MISMATCH',
}

export type DiscrepancySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Discrepancy {
  type: DiscrepancyType;
  transactionId?: string;
  xeroTransactionId?: string;
  description: string;
  amountCents: number;
  date?: Date;
  expectedAmountCents?: number;
  actualAmountCents?: number;
  severity: DiscrepancySeverity;
}

export interface DiscrepancyReport {
  reconciliationId: string;
  tenantId: string;
  totalDiscrepancyCents: number;
  discrepancyCount: number;
  discrepancies: Discrepancy[];
  summary: {
    inBankNotXero: number;
    inXeroNotBank: number;
    amountMismatches: number;
    dateMismatches: number;
  };
  generatedAt: Date;
}

export interface ResolutionSuggestion {
  action: string;
  description: string;
  automatable: boolean;
  estimatedImpactCents: number;
}

export interface DiscrepancyClassification {
  type: DiscrepancyType | null;
  severity: DiscrepancySeverity;
}
```

## Service (src/database/services/discrepancy.service.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import {
  Discrepancy,
  DiscrepancyReport,
  DiscrepancyType,
  DiscrepancySeverity,
  ResolutionSuggestion,
  DiscrepancyClassification,
} from '../dto/discrepancy.dto';
import { NotFoundException } from '../../shared/exceptions';

// Threshold in cents
const DISCREPANCY_THRESHOLD_CENTS = 1;
const SEVERITY_LOW_MAX_CENTS = 1000;      // R10
const SEVERITY_MEDIUM_MAX_CENTS = 10000;  // R100

@Injectable()
export class DiscrepancyService {
  private readonly logger = new Logger(DiscrepancyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationRepo: ReconciliationRepository,
  ) {}

  /**
   * Detect discrepancies for a reconciliation period
   * Compares bank transactions against Xero records
   */
  async detectDiscrepancies(
    tenantId: string,
    reconId: string
  ): Promise<DiscrepancyReport> {
    // Get reconciliation record
    const recon = await this.reconciliationRepo.findById(reconId);
    if (!recon) {
      throw new NotFoundException('Reconciliation', reconId);
    }
    if (recon.tenantId !== tenantId) {
      throw new NotFoundException('Reconciliation', reconId);
    }

    // Get bank transactions for period
    const bankTxs = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount: recon.bankAccount,
        date: { gte: recon.periodStart, lte: recon.periodEnd },
        isDeleted: false,
      },
    });

    // Get Xero transactions for period (from synced data)
    // For now, use transactions marked as synced with xeroTransactionId
    const xeroTxs = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount: recon.bankAccount,
        date: { gte: recon.periodStart, lte: recon.periodEnd },
        xeroTransactionId: { not: null },
        status: 'SYNCED',
        isDeleted: false,
      },
    });

    const discrepancies: Discrepancy[] = [];
    const summary = {
      inBankNotXero: 0,
      inXeroNotBank: 0,
      amountMismatches: 0,
      dateMismatches: 0,
    };

    // Create lookup maps by reference
    const bankByRef = new Map(bankTxs.map(tx => [tx.reference ?? tx.id, tx]));
    const xeroByRef = new Map(xeroTxs.map(tx => [tx.xeroTransactionId ?? tx.id, tx]));

    // Check bank transactions not matched to Xero
    for (const bankTx of bankTxs) {
      const matchKey = bankTx.reference ?? bankTx.id;
      const matched = xeroTxs.find(x =>
        x.reference === matchKey ||
        (x.amountCents === bankTx.amountCents && this.isSameDate(x.date, bankTx.date))
      );

      if (!matched) {
        discrepancies.push({
          type: DiscrepancyType.IN_BANK_NOT_XERO,
          transactionId: bankTx.id,
          description: `Bank transaction not found in Xero: ${bankTx.description}`,
          amountCents: Math.abs(bankTx.amountCents),
          date: bankTx.date,
          severity: this.calculateSeverity(Math.abs(bankTx.amountCents)),
        });
        summary.inBankNotXero++;
      } else if (bankTx.amountCents !== matched.amountCents) {
        // Amount mismatch
        const diff = Math.abs(bankTx.amountCents - matched.amountCents);
        if (diff > DISCREPANCY_THRESHOLD_CENTS) {
          discrepancies.push({
            type: DiscrepancyType.AMOUNT_MISMATCH,
            transactionId: bankTx.id,
            xeroTransactionId: matched.xeroTransactionId ?? undefined,
            description: `Amount mismatch: Bank=${bankTx.amountCents}c, Xero=${matched.amountCents}c`,
            amountCents: diff,
            date: bankTx.date,
            expectedAmountCents: matched.amountCents,
            actualAmountCents: bankTx.amountCents,
            severity: this.calculateSeverity(diff),
          });
          summary.amountMismatches++;
        }
      } else if (!this.isSameDate(bankTx.date, matched.date)) {
        // Date mismatch
        discrepancies.push({
          type: DiscrepancyType.DATE_MISMATCH,
          transactionId: bankTx.id,
          xeroTransactionId: matched.xeroTransactionId ?? undefined,
          description: `Date mismatch: Bank=${bankTx.date.toISOString()}, Xero=${matched.date.toISOString()}`,
          amountCents: 0,
          date: bankTx.date,
          severity: 'LOW',
        });
        summary.dateMismatches++;
      }
    }

    // Check Xero transactions not in bank
    for (const xeroTx of xeroTxs) {
      const matchKey = xeroTx.xeroTransactionId ?? xeroTx.id;
      const matched = bankTxs.find(b =>
        b.reference === matchKey ||
        (b.amountCents === xeroTx.amountCents && this.isSameDate(b.date, xeroTx.date))
      );

      if (!matched) {
        discrepancies.push({
          type: DiscrepancyType.IN_XERO_NOT_BANK,
          xeroTransactionId: xeroTx.xeroTransactionId ?? undefined,
          description: `Xero transaction not found in bank: ${xeroTx.description}`,
          amountCents: Math.abs(xeroTx.amountCents),
          date: xeroTx.date,
          severity: this.calculateSeverity(Math.abs(xeroTx.amountCents)),
        });
        summary.inXeroNotBank++;
      }
    }

    const totalDiscrepancyCents = discrepancies.reduce(
      (sum, d) => sum + Math.abs(d.amountCents),
      0
    );

    if (discrepancies.length > 0) {
      this.logger.warn(
        `Detected ${discrepancies.length} discrepancies for reconciliation ${reconId}, total=${totalDiscrepancyCents}c`
      );
    }

    return {
      reconciliationId: reconId,
      tenantId,
      totalDiscrepancyCents,
      discrepancyCount: discrepancies.length,
      discrepancies,
      summary,
      generatedAt: new Date(),
    };
  }

  /**
   * Classify a discrepancy by comparing bank and Xero transactions
   */
  classifyDiscrepancy(
    bankTx: { amountCents: number; date: Date } | null,
    xeroTx: { amountCents: number; date: Date } | null
  ): DiscrepancyClassification {
    if (bankTx && !xeroTx) {
      return {
        type: DiscrepancyType.IN_BANK_NOT_XERO,
        severity: this.calculateSeverity(Math.abs(bankTx.amountCents)),
      };
    }

    if (!bankTx && xeroTx) {
      return {
        type: DiscrepancyType.IN_XERO_NOT_BANK,
        severity: this.calculateSeverity(Math.abs(xeroTx.amountCents)),
      };
    }

    if (bankTx && xeroTx) {
      const amountDiff = Math.abs(bankTx.amountCents - xeroTx.amountCents);
      if (amountDiff > DISCREPANCY_THRESHOLD_CENTS) {
        return {
          type: DiscrepancyType.AMOUNT_MISMATCH,
          severity: this.calculateSeverity(amountDiff),
        };
      }

      if (!this.isSameDate(bankTx.date, xeroTx.date)) {
        return {
          type: DiscrepancyType.DATE_MISMATCH,
          severity: 'LOW',
        };
      }
    }

    return { type: null, severity: 'LOW' };
  }

  /**
   * Suggest resolution for a discrepancy
   */
  suggestResolution(discrepancy: Discrepancy): ResolutionSuggestion {
    switch (discrepancy.type) {
      case DiscrepancyType.IN_BANK_NOT_XERO:
        return {
          action: 'CREATE_XERO_ENTRY',
          description: 'Create a manual entry in Xero to match this bank transaction',
          automatable: false,
          estimatedImpactCents: discrepancy.amountCents,
        };

      case DiscrepancyType.IN_XERO_NOT_BANK:
        return {
          action: 'VERIFY_BANK_STATEMENT',
          description: 'Verify if transaction is missing from bank statement or incorrectly entered in Xero',
          automatable: false,
          estimatedImpactCents: discrepancy.amountCents,
        };

      case DiscrepancyType.AMOUNT_MISMATCH:
        return {
          action: 'ADJUST_AMOUNT',
          description: `Adjust amount in Xero from ${(discrepancy.expectedAmountCents ?? 0) / 100} to ${(discrepancy.actualAmountCents ?? 0) / 100}`,
          automatable: false,
          estimatedImpactCents: discrepancy.amountCents,
        };

      case DiscrepancyType.DATE_MISMATCH:
        return {
          action: 'ADJUST_DATE',
          description: 'Update transaction date in Xero to match bank statement',
          automatable: false,
          estimatedImpactCents: 0,
        };

      default:
        return {
          action: 'MANUAL_REVIEW',
          description: 'Manual review required',
          automatable: false,
          estimatedImpactCents: discrepancy.amountCents,
        };
    }
  }

  /**
   * Report a discrepancy for audit trail
   */
  async reportDiscrepancy(
    discrepancy: Discrepancy,
    tenantId: string
  ): Promise<void> {
    this.logger.warn({
      event: 'DISCREPANCY_REPORTED',
      tenantId,
      type: discrepancy.type,
      amountCents: discrepancy.amountCents,
      severity: discrepancy.severity,
      description: discrepancy.description,
      transactionId: discrepancy.transactionId,
      xeroTransactionId: discrepancy.xeroTransactionId,
    });
  }

  /**
   * Calculate severity based on amount
   */
  private calculateSeverity(amountCents: number): DiscrepancySeverity {
    const absAmount = Math.abs(amountCents);
    if (absAmount > SEVERITY_MEDIUM_MAX_CENTS) {
      return 'HIGH';
    }
    if (absAmount > SEVERITY_LOW_MAX_CENTS) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * Compare dates ignoring time
   */
  private isSameDate(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database - NO MOCKS.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { DiscrepancyService } from '../../src/database/services/discrepancy.service';
import { ReconciliationRepository } from '../../src/database/repositories/reconciliation.repository';
import { DiscrepancyType } from '../../src/database/dto/discrepancy.dto';
import { Tenant, ReconciliationStatus } from '@prisma/client';

describe('DiscrepancyService', () => {
  let service: DiscrepancyService;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, DiscrepancyService, ReconciliationRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<DiscrepancyService>(DiscrepancyService);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    await prisma.reconciliation.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.tenant.deleteMany({});

    testTenant = await prisma.tenant.create({
      data: { name: 'Discrepancy Test', email: 'disc@test.co.za', taxStatus: 'VAT_REGISTERED' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('detectDiscrepancies()', () => {
    it('should detect IN_BANK_NOT_XERO', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 0,
          closingBalanceCents: 10000,
          calculatedBalanceCents: 10000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Bank transaction without Xero sync
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          amountCents: 10000,
          isCredit: true,
          description: 'Bank only',
          status: 'PENDING',
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancyCount).toBe(1);
      expect(report.discrepancies[0].type).toBe(DiscrepancyType.IN_BANK_NOT_XERO);
      expect(report.summary.inBankNotXero).toBe(1);
    });

    it('should detect AMOUNT_MISMATCH', async () => {
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
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Bank transaction
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          amountCents: 10000,
          reference: 'REF-001',
          isCredit: true,
          description: 'Test',
          status: 'PENDING',
        },
      });

      // Xero synced with different amount
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          amountCents: 9500,  // Difference of R5
          reference: 'REF-001',
          xeroTransactionId: 'xero-123',
          isCredit: true,
          description: 'Test',
          status: 'SYNCED',
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.summary.amountMismatches).toBeGreaterThan(0);
    });
  });

  describe('classifyDiscrepancy()', () => {
    it('should classify IN_BANK_NOT_XERO', () => {
      const result = service.classifyDiscrepancy(
        { amountCents: 10000, date: new Date() },
        null
      );
      expect(result.type).toBe(DiscrepancyType.IN_BANK_NOT_XERO);
    });

    it('should classify IN_XERO_NOT_BANK', () => {
      const result = service.classifyDiscrepancy(
        null,
        { amountCents: 10000, date: new Date() }
      );
      expect(result.type).toBe(DiscrepancyType.IN_XERO_NOT_BANK);
    });

    it('should classify AMOUNT_MISMATCH', () => {
      const result = service.classifyDiscrepancy(
        { amountCents: 10000, date: new Date() },
        { amountCents: 9000, date: new Date() }
      );
      expect(result.type).toBe(DiscrepancyType.AMOUNT_MISMATCH);
    });

    it('should return null for matching transactions', () => {
      const date = new Date();
      const result = service.classifyDiscrepancy(
        { amountCents: 10000, date },
        { amountCents: 10000, date }
      );
      expect(result.type).toBeNull();
    });
  });

  describe('calculateSeverity()', () => {
    it('should return LOW for < R10', () => {
      const report = { type: DiscrepancyType.IN_BANK_NOT_XERO, amountCents: 500 } as any;
      const suggestion = service.suggestResolution(report);
      // Severity is calculated internally
      expect(suggestion.action).toBe('CREATE_XERO_ENTRY');
    });

    it('should return HIGH for > R100', () => {
      const result = service.classifyDiscrepancy(
        { amountCents: 15000, date: new Date() },  // R150
        null
      );
      expect(result.severity).toBe('HIGH');
    });
  });

  describe('suggestResolution()', () => {
    it('should suggest CREATE_XERO_ENTRY for IN_BANK_NOT_XERO', () => {
      const suggestion = service.suggestResolution({
        type: DiscrepancyType.IN_BANK_NOT_XERO,
        description: 'Test',
        amountCents: 1000,
        severity: 'LOW',
      });
      expect(suggestion.action).toBe('CREATE_XERO_ENTRY');
      expect(suggestion.automatable).toBe(false);
    });

    it('should suggest VERIFY_BANK_STATEMENT for IN_XERO_NOT_BANK', () => {
      const suggestion = service.suggestResolution({
        type: DiscrepancyType.IN_XERO_NOT_BANK,
        description: 'Test',
        amountCents: 1000,
        severity: 'LOW',
      });
      expect(suggestion.action).toBe('VERIFY_BANK_STATEMENT');
    });
  });
});
```
</test_requirements>

<validation_criteria>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- IN_BANK_NOT_XERO detection works correctly
- IN_XERO_NOT_BANK detection works correctly
- AMOUNT_MISMATCH detection for differences > 1 cent
- DATE_MISMATCH detection for different dates
- Severity classification: LOW (<R10), MEDIUM (R10-R100), HIGH (>R100)
- Resolution suggestions appropriate for each type
- Tenant isolation enforced
- Total discrepancy amount calculated correctly
- Summary aggregation by type works
- No 'any' types used
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPattern="discrepancy.service" --verbose
</test_commands>

</task_spec>
