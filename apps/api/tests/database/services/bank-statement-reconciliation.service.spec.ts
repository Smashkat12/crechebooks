/**
 * Bank Statement Reconciliation Service Tests
 * TASK-RECON-019: Bank Statement to Xero Transaction Reconciliation
 *
 * Tests use REAL PostgreSQL data - NO MOCKS
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BankStatementReconciliationService } from '../../../src/database/services/bank-statement-reconciliation.service';
import { BankStatementMatchRepository } from '../../../src/database/repositories/bank-statement-match.repository';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import {
  BankStatementMatchStatus,
} from '../../../src/database/entities/bank-statement-match.entity';
import { ReconciliationStatus } from '../../../src/database/entities/reconciliation.entity';
import { LLMWhispererParser } from '../../../src/database/parsers/llmwhisperer-parser';
import { Tenant, Reconciliation, Transaction, BankStatementMatch } from '@prisma/client';

// Mock LLMWhisperer parser for tests - we test its behavior separately
const mockLLMWhispererParser = {
  parseWithBalances: jest.fn(),
};

describe('BankStatementReconciliationService', () => {
  let service: BankStatementReconciliationService;
  let repository: BankStatementMatchRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testReconciliation: Reconciliation;
  let testTransactions: Transaction[];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        BankStatementReconciliationService,
        BankStatementMatchRepository,
        ReconciliationRepository,
        {
          provide: LLMWhispererParser,
          useValue: mockLLMWhispererParser,
        },
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<BankStatementReconciliationService>(
      BankStatementReconciliationService,
    );
    repository = module.get<BankStatementMatchRepository>(BankStatementMatchRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.auditLog.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    const timestamp = Date.now();

    // Create test tenant - South African creche
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Happy Kids Creche',
        addressLine1: '78 Protea Street',
        city: 'Pretoria',
        province: 'Gauteng',
        postalCode: '0002',
        phone: '+27125554567',
        email: `test${timestamp}@happykids.co.za`,
        taxStatus: 'VAT_REGISTERED',
        vatNumber: '4345678901',
      },
    });

    // Create test reconciliation for January 2025
    testReconciliation = await prisma.reconciliation.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'Nedbank Business - 112233445566',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        openingBalanceCents: 10000000, // R100,000.00
        closingBalanceCents: 12000000, // R120,000.00
        calculatedBalanceCents: 11950000, // R119,500.00
        status: ReconciliationStatus.DRAFT,
        notes: 'January 2025 bank reconciliation',
      },
    });

    // Create realistic test transactions (from Xero)
    testTransactions = await Promise.all([
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-05'),
          description: 'SCHOOL FEE PAYMENT - SMITH FAMILY',
          amountCents: 350000, // R3,500.00 credit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: true,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-10'),
          description: 'SALARY PAYMENT - JANE DOE',
          amountCents: -1800000, // R18,000.00 debit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: false,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-15'),
          description: 'SUPPLIES - EDUCATIONAL TOYS PTY LTD',
          amountCents: -250000, // R2,500.00 debit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: false,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
      prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-20'),
          description: 'PARENT FEE - JONES FAMILY',
          amountCents: 400000, // R4,000.00 credit
          bankAccount: 'Nedbank Business - 112233445566',
          isCredit: true,
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      }),
    ]);
  });

  describe('getMatchesByReconciliationId', () => {
    beforeEach(async () => {
      // Create test matches
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCH A',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'MATCH B',
            bankAmountCents: 200000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: 'MATCH C',
            bankAmountCents: 150000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.AMOUNT_MISMATCH,
          },
        ],
      });
    });

    it('should return all matches for a reconciliation', async () => {
      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(matches).toHaveLength(3);
    });

    it('should return match details with correct fields', async () => {
      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(matches[0]).toHaveProperty('id');
      expect(matches[0]).toHaveProperty('bankDate');
      expect(matches[0]).toHaveProperty('bankDescription');
      expect(matches[0]).toHaveProperty('bankAmountCents');
      expect(matches[0]).toHaveProperty('bankIsCredit');
      expect(matches[0]).toHaveProperty('status');
    });
  });

  describe('getUnmatchedSummary', () => {
    beforeEach(async () => {
      // Create various match types
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCHED ITEM',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'BANK FEE',
            bankAmountCents: 15000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
            discrepancyReason: 'Bank fee not in Xero',
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: '',
            bankAmountCents: 0,
            bankIsCredit: false,
            transactionId: testTransactions[0].id,
            xeroDescription: 'UNCLEARED CHEQUE',
            xeroAmountCents: 50000,
            xeroIsCredit: false,
            status: BankStatementMatchStatus.IN_XERO_ONLY,
            discrepancyReason: 'Cheque not yet cleared',
          },
        ],
      });
    });

    it('should return summary of unmatched transactions', async () => {
      const summary = await service.getUnmatchedSummary(
        testTenant.id,
        testReconciliation.id,
      );

      expect(summary.inBankOnly).toHaveLength(1);
      expect(summary.inBankOnly[0]).toHaveProperty('date');
      expect(summary.inBankOnly[0]).toHaveProperty('description');
      expect(summary.inBankOnly[0]).toHaveProperty('amount');

      expect(summary.inXeroOnly).toHaveLength(1);
      expect(summary.inXeroOnly[0]).toHaveProperty('date');
      expect(summary.inXeroOnly[0]).toHaveProperty('description');
      expect(summary.inXeroOnly[0]).toHaveProperty('amount');
      expect(summary.inXeroOnly[0]).toHaveProperty('transactionId');
    });

    it('should return empty arrays when all matched', async () => {
      // Clear and create only matched records
      await prisma.bankStatementMatch.deleteMany({
        where: { reconciliationId: testReconciliation.id },
      });

      await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'ALL MATCHED',
          bankAmountCents: 100000,
          bankIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
        },
      });

      const summary = await service.getUnmatchedSummary(
        testTenant.id,
        testReconciliation.id,
      );

      expect(summary.inBankOnly).toHaveLength(0);
      expect(summary.inXeroOnly).toHaveLength(0);
    });
  });

  describe('calculateSimilarity (private method via reflection)', () => {
    it('should calculate exact match as 100%', () => {
      const similarity = (service as any).calculateSimilarity(
        'SALARY PAYMENT JOHN',
        'SALARY PAYMENT JOHN',
      );
      expect(similarity).toBe(1);
    });

    it('should calculate similar strings with high confidence', () => {
      const similarity = (service as any).calculateSimilarity(
        'SALARY PAYMENT JOHN SMITH',
        'SALARY PAYMENT J SMITH',
      );
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should calculate different strings with low confidence', () => {
      const similarity = (service as any).calculateSimilarity(
        'SALARY PAYMENT',
        'GROCERY PURCHASE',
      );
      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle empty strings', () => {
      const similarity = (service as any).calculateSimilarity('', '');
      expect(similarity).toBe(1);

      const emptyVsNot = (service as any).calculateSimilarity('', 'SOME TEXT');
      expect(emptyVsNot).toBe(0);
    });
  });

  describe('calculateBalance (private method via reflection)', () => {
    it('should calculate correct balance from transactions', () => {
      const transactions = [
        { date: new Date(), description: 'CR', amountCents: 200000, isCredit: true, runningBalanceCents: 0 },
        { date: new Date(), description: 'DR', amountCents: 100000, isCredit: false, runningBalanceCents: 0 },
      ];

      const calculatedBalance = (service as any).calculateBalance(
        10000000, // R100,000 opening
        transactions,
      );

      // 10,000,000 + 200,000 - 100,000 = 10,100,000
      expect(calculatedBalance).toBe(10100000);
    });

    it('should handle mixed credits and debits', () => {
      const transactions = [
        { date: new Date(), description: 'CR', amountCents: 500000, isCredit: true, runningBalanceCents: 0 },
        { date: new Date(), description: 'DR', amountCents: 200000, isCredit: false, runningBalanceCents: 0 },
        { date: new Date(), description: 'CR', amountCents: 100000, isCredit: true, runningBalanceCents: 0 },
      ];

      const calculatedBalance = (service as any).calculateBalance(1000000, transactions);

      // 1,000,000 + 500,000 - 200,000 + 100,000 = 1,400,000
      expect(calculatedBalance).toBe(1400000);
    });
  });

  describe('tenant isolation', () => {
    it('should not access matches from other tenants', async () => {
      // Create another tenant and reconciliation
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '123 Other St',
          city: 'Bloemfontein',
          province: 'Free State',
          postalCode: '9301',
          phone: '+27515559999',
          email: `other${Date.now()}@test.co.za`,
          taxStatus: 'NOT_REGISTERED',
        },
      });

      const otherRecon = await prisma.reconciliation.create({
        data: {
          tenantId: otherTenant.id,
          bankAccount: 'Other Bank',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 500000,
          closingBalanceCents: 600000,
          calculatedBalanceCents: 590000,
          status: ReconciliationStatus.DRAFT,
        },
      });

      // Create match for other tenant
      await prisma.bankStatementMatch.create({
        data: {
          tenantId: otherTenant.id,
          reconciliationId: otherRecon.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'OTHER TENANT DATA',
          bankAmountCents: 99999,
          bankIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
        },
      });

      // Query with original tenant should not see other tenant's data
      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(matches.every((m) => m.bankDescription !== 'OTHER TENANT DATA')).toBe(true);
    });
  });

  describe('repository integration', () => {
    it('should correctly store and retrieve match records', async () => {
      const created = await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'INTEGRATION TEST',
          bankAmountCents: 123456,
          bankIsCredit: true,
          transactionId: testTransactions[0].id,
          xeroDate: new Date('2025-01-15'),
          xeroDescription: 'XERO INTEGRATION TEST',
          xeroAmountCents: 123456,
          xeroIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
          matchConfidence: 95.5,
        },
      });

      const matches = await service.getMatchesByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(matches).toHaveLength(1);
      expect(matches[0].bankDescription).toBe('INTEGRATION TEST');
      expect(matches[0].bankAmountCents).toBe(123456);
      expect(matches[0].xeroDescription).toBe('XERO INTEGRATION TEST');
      expect(matches[0].status).toBe(BankStatementMatchStatus.MATCHED);
    });

    it('should count matches correctly by status', async () => {
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCHED 1',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-11'),
            bankDescription: 'MATCHED 2',
            bankAmountCents: 150000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'BANK ONLY',
            bankAmountCents: 50000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
          },
        ],
      });

      const counts = await repository.countByStatus(testTenant.id, testReconciliation.id);

      expect(counts[BankStatementMatchStatus.MATCHED]).toBe(2);
      expect(counts[BankStatementMatchStatus.IN_BANK_ONLY]).toBe(1);
      expect(counts[BankStatementMatchStatus.IN_XERO_ONLY]).toBe(0);
    });
  });
});
