/**
 * Bank Statement Match Repository Tests
 * TASK-RECON-019: Bank Statement to Xero Transaction Reconciliation
 *
 * Tests use REAL PostgreSQL data - NO MOCKS
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BankStatementMatchRepository } from '../../../src/database/repositories/bank-statement-match.repository';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import {
  BankStatementMatchStatus,
  CreateBankStatementMatchDto,
} from '../../../src/database/entities/bank-statement-match.entity';
import { ReconciliationStatus } from '../../../src/database/entities/reconciliation.entity';
import { NotFoundException, DatabaseException } from '../../../src/shared/exceptions';
import { Tenant, Reconciliation, Transaction } from '@prisma/client';

describe('BankStatementMatchRepository', () => {
  let repository: BankStatementMatchRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testReconciliation: Reconciliation;
  let testTransaction: Transaction;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, BankStatementMatchRepository, ReconciliationRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<BankStatementMatchRepository>(BankStatementMatchRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
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

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Sunshine Creche',
        addressLine1: '45 Oak Avenue',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27215557890',
        email: `test${timestamp}@sunshine.co.za`,
        taxStatus: 'VAT_REGISTERED',
        vatNumber: '4234567890',
      },
    });

    // Create test reconciliation
    testReconciliation = await prisma.reconciliation.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'Standard Bank - 987654321',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
        openingBalanceCents: 5000000, // R50,000.00
        closingBalanceCents: 7500000, // R75,000.00
        calculatedBalanceCents: 7450000, // R74,500.00
        status: ReconciliationStatus.DRAFT,
        notes: 'January 2025 reconciliation',
      },
    });

    // Create test transaction
    testTransaction = await prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        date: new Date('2025-01-15'),
        description: 'SALARY PAYMENT - JOHN SMITH',
        amountCents: -1500000, // R15,000.00 debit
        bankAccount: 'Standard Bank - 987654321',
        isCredit: false,
        source: 'BANK_FEED',
        status: 'CATEGORIZED',
      },
    });
  });

  describe('create', () => {
    it('should create a MATCHED bank statement match record', async () => {
      const dto: CreateBankStatementMatchDto = {
        tenantId: testTenant.id,
        reconciliationId: testReconciliation.id,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'SALARY PAYMENT JOHN SMITH',
        bankAmountCents: 1500000, // R15,000.00
        bankIsCredit: false,
        transactionId: testTransaction.id,
        xeroDate: new Date('2025-01-15'),
        xeroDescription: 'SALARY PAYMENT - JOHN SMITH',
        xeroAmountCents: 1500000,
        xeroIsCredit: false,
        status: BankStatementMatchStatus.MATCHED,
        matchConfidence: 95.5,
      };

      const result = await repository.create(dto);

      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(testTenant.id);
      expect(result.reconciliationId).toBe(testReconciliation.id);
      expect(result.transactionId).toBe(testTransaction.id);
      expect(result.status).toBe(BankStatementMatchStatus.MATCHED);
      expect(Number(result.matchConfidence)).toBeCloseTo(95.5, 1);
      expect(result.bankAmountCents).toBe(1500000);
      expect(result.xeroAmountCents).toBe(1500000);
    });

    it('should create an IN_BANK_ONLY match record', async () => {
      const dto: CreateBankStatementMatchDto = {
        tenantId: testTenant.id,
        reconciliationId: testReconciliation.id,
        bankDate: new Date('2025-01-20'),
        bankDescription: 'BANK FEE - ACCOUNT MAINTENANCE',
        bankAmountCents: 15000, // R150.00
        bankIsCredit: false,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
        discrepancyReason: 'Bank fee not recorded in Xero',
      };

      const result = await repository.create(dto);

      expect(result.status).toBe(BankStatementMatchStatus.IN_BANK_ONLY);
      expect(result.transactionId).toBeNull();
      expect(result.xeroAmountCents).toBeNull();
      expect(result.discrepancyReason).toBe('Bank fee not recorded in Xero');
    });

    it('should create an IN_XERO_ONLY match record', async () => {
      const dto: CreateBankStatementMatchDto = {
        tenantId: testTenant.id,
        reconciliationId: testReconciliation.id,
        bankDate: new Date('2025-01-25'),
        bankDescription: '',
        bankAmountCents: 0,
        bankIsCredit: false,
        transactionId: testTransaction.id,
        xeroDate: new Date('2025-01-25'),
        xeroDescription: 'PAYMENT RECEIVED - INVOICE 001',
        xeroAmountCents: 250000,
        xeroIsCredit: true,
        status: BankStatementMatchStatus.IN_XERO_ONLY,
        discrepancyReason: 'Transaction not yet on bank statement',
      };

      const result = await repository.create(dto);

      expect(result.status).toBe(BankStatementMatchStatus.IN_XERO_ONLY);
      expect(result.discrepancyReason).toBe('Transaction not yet on bank statement');
    });

    it('should create an AMOUNT_MISMATCH match record', async () => {
      const dto: CreateBankStatementMatchDto = {
        tenantId: testTenant.id,
        reconciliationId: testReconciliation.id,
        bankDate: new Date('2025-01-18'),
        bankDescription: 'SUPPLIER PAYMENT ABC',
        bankAmountCents: 500000, // R5,000.00
        bankIsCredit: false,
        transactionId: testTransaction.id,
        xeroDate: new Date('2025-01-18'),
        xeroDescription: 'SUPPLIER PAYMENT ABC PTY LTD',
        xeroAmountCents: 550000, // R5,500.00
        xeroIsCredit: false,
        status: BankStatementMatchStatus.AMOUNT_MISMATCH,
        matchConfidence: 85.0,
        discrepancyReason: 'Amount differs by R500.00',
      };

      const result = await repository.create(dto);

      expect(result.status).toBe(BankStatementMatchStatus.AMOUNT_MISMATCH);
      expect(result.bankAmountCents).toBe(500000);
      expect(result.xeroAmountCents).toBe(550000);
      expect(result.discrepancyReason).toContain('R500.00');
    });

    it('should throw error for non-existent tenant', async () => {
      const dto: CreateBankStatementMatchDto = {
        tenantId: 'non-existent-tenant-id',
        reconciliationId: testReconciliation.id,
        bankDate: new Date('2025-01-15'),
        bankDescription: 'TEST',
        bankAmountCents: 100000,
        bankIsCredit: false,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
      };

      // Throws either NotFoundException or DatabaseException depending on error message
      await expect(repository.create(dto)).rejects.toThrow();
    });

    it('should throw NotFoundException for non-existent reconciliation', async () => {
      const dto: CreateBankStatementMatchDto = {
        tenantId: testTenant.id,
        reconciliationId: 'non-existent-recon-id',
        bankDate: new Date('2025-01-15'),
        bankDescription: 'TEST',
        bankAmountCents: 100000,
        bankIsCredit: false,
        status: BankStatementMatchStatus.IN_BANK_ONLY,
      };

      await expect(repository.create(dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find a match by ID', async () => {
      const created = await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'TEST TRANSACTION',
          bankAmountCents: 100000,
          bankIsCredit: true,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
        },
      });

      const result = await repository.findById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
      expect(result!.bankDescription).toBe('TEST TRANSACTION');
    });

    it('should return null for non-existent ID', async () => {
      const result = await repository.findById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('findByReconciliationId', () => {
    it('should find all matches for a reconciliation ordered by bank date', async () => {
      // Create matches out of date order
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: 'THIRD TRANSACTION',
            bankAmountCents: 300000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'FIRST TRANSACTION',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'SECOND TRANSACTION',
            bankAmountCents: 200000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.AMOUNT_MISMATCH,
          },
        ],
      });

      const results = await repository.findByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(results).toHaveLength(3);
      expect(results[0].bankDescription).toBe('FIRST TRANSACTION');
      expect(results[1].bankDescription).toBe('SECOND TRANSACTION');
      expect(results[2].bankDescription).toBe('THIRD TRANSACTION');
    });

    it('should return empty array for reconciliation with no matches', async () => {
      const results = await repository.findByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );
      expect(results).toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('should find all matches by status for a tenant', async () => {
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
            bankDate: new Date('2025-01-15'),
            bankDescription: 'BANK ONLY',
            bankAmountCents: 50000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: 'MATCHED 2',
            bankAmountCents: 200000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
        ],
      });

      const matchedResults = await repository.findByStatus(
        testTenant.id,
        BankStatementMatchStatus.MATCHED,
      );
      const bankOnlyResults = await repository.findByStatus(
        testTenant.id,
        BankStatementMatchStatus.IN_BANK_ONLY,
      );

      expect(matchedResults).toHaveLength(2);
      expect(bankOnlyResults).toHaveLength(1);
    });
  });

  describe('findByTransactionId', () => {
    it('should find match by transaction ID', async () => {
      await prisma.bankStatementMatch.create({
        data: {
          tenantId: testTenant.id,
          reconciliationId: testReconciliation.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'MATCHED TO TXN',
          bankAmountCents: 1500000,
          bankIsCredit: false,
          transactionId: testTransaction.id,
          xeroDate: new Date('2025-01-15'),
          xeroDescription: 'XERO DESC',
          xeroAmountCents: 1500000,
          xeroIsCredit: false,
          status: BankStatementMatchStatus.MATCHED,
        },
      });

      const result = await repository.findByTransactionId(testTransaction.id);

      expect(result).not.toBeNull();
      expect(result!.transactionId).toBe(testTransaction.id);
    });

    it('should return null for transaction with no match', async () => {
      const result = await repository.findByTransactionId(testTransaction.id);
      expect(result).toBeNull();
    });
  });

  describe('deleteByReconciliationId', () => {
    it('should delete all matches for a reconciliation', async () => {
      // Create some matches
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCH 1',
            bankAmountCents: 100000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.MATCHED,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-15'),
            bankDescription: 'MATCH 2',
            bankAmountCents: 200000,
            bankIsCredit: false,
            status: BankStatementMatchStatus.IN_BANK_ONLY,
          },
        ],
      });

      // Verify matches exist
      const beforeDelete = await repository.findByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );
      expect(beforeDelete).toHaveLength(2);

      // Delete
      await repository.deleteByReconciliationId(testReconciliation.id);

      // Verify deleted
      const afterDelete = await repository.findByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );
      expect(afterDelete).toHaveLength(0);
    });
  });

  describe('countByStatus', () => {
    it('should count matches by status for a reconciliation', async () => {
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
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: 'MISMATCH',
            bankAmountCents: 200000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.AMOUNT_MISMATCH,
          },
        ],
      });

      const counts = await repository.countByStatus(testTenant.id, testReconciliation.id);

      expect(counts[BankStatementMatchStatus.MATCHED]).toBe(2);
      expect(counts[BankStatementMatchStatus.IN_BANK_ONLY]).toBe(1);
      expect(counts[BankStatementMatchStatus.IN_XERO_ONLY]).toBe(0);
      expect(counts[BankStatementMatchStatus.AMOUNT_MISMATCH]).toBe(1);
      expect(counts[BankStatementMatchStatus.DATE_MISMATCH]).toBe(0);
    });

    it('should return all zeros for empty reconciliation', async () => {
      const counts = await repository.countByStatus(testTenant.id, testReconciliation.id);

      expect(counts[BankStatementMatchStatus.MATCHED]).toBe(0);
      expect(counts[BankStatementMatchStatus.IN_BANK_ONLY]).toBe(0);
      expect(counts[BankStatementMatchStatus.IN_XERO_ONLY]).toBe(0);
      expect(counts[BankStatementMatchStatus.AMOUNT_MISMATCH]).toBe(0);
      expect(counts[BankStatementMatchStatus.DATE_MISMATCH]).toBe(0);
    });
  });

  describe('findUnmatched', () => {
    it('should find IN_BANK_ONLY and IN_XERO_ONLY records', async () => {
      await prisma.bankStatementMatch.createMany({
        data: [
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-10'),
            bankDescription: 'MATCHED',
            bankAmountCents: 100000,
            bankIsCredit: true,
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
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-20'),
            bankDescription: '',
            bankAmountCents: 0,
            bankIsCredit: false,
            xeroDescription: 'XERO ONLY',
            xeroAmountCents: 75000,
            xeroIsCredit: true,
            status: BankStatementMatchStatus.IN_XERO_ONLY,
          },
          {
            tenantId: testTenant.id,
            reconciliationId: testReconciliation.id,
            bankDate: new Date('2025-01-25'),
            bankDescription: 'AMOUNT MISMATCH',
            bankAmountCents: 200000,
            bankIsCredit: true,
            status: BankStatementMatchStatus.AMOUNT_MISMATCH,
          },
        ],
      });

      const unmatched = await repository.findUnmatched(
        testTenant.id,
        testReconciliation.id,
      );

      expect(unmatched).toHaveLength(2);
      expect(unmatched.map((u) => u.status)).toEqual(
        expect.arrayContaining([
          BankStatementMatchStatus.IN_BANK_ONLY,
          BankStatementMatchStatus.IN_XERO_ONLY,
        ]),
      );
    });

    it('should return empty array when all matched', async () => {
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

      const unmatched = await repository.findUnmatched(
        testTenant.id,
        testReconciliation.id,
      );

      expect(unmatched).toHaveLength(0);
    });
  });

  describe('tenant isolation', () => {
    it('should not return matches from other tenants', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '999 Other St',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postalCode: '4001',
          phone: '+27315559999',
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
          openingBalanceCents: 1000000,
          closingBalanceCents: 1500000,
          calculatedBalanceCents: 1450000,
          status: ReconciliationStatus.DRAFT,
        },
      });

      // Create match in other tenant
      await prisma.bankStatementMatch.create({
        data: {
          tenantId: otherTenant.id,
          reconciliationId: otherRecon.id,
          bankDate: new Date('2025-01-15'),
          bankDescription: 'OTHER TENANT MATCH',
          bankAmountCents: 500000,
          bankIsCredit: true,
          status: BankStatementMatchStatus.MATCHED,
        },
      });

      // Query with test tenant should return empty
      const results = await repository.findByReconciliationId(
        testTenant.id,
        testReconciliation.id,
      );

      expect(results).toHaveLength(0);

      // Query by status should also be tenant-isolated
      const statusResults = await repository.findByStatus(
        testTenant.id,
        BankStatementMatchStatus.MATCHED,
      );

      expect(statusResults).toHaveLength(0);
    });
  });
});
