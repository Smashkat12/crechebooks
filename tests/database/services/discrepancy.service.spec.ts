/**
 * DiscrepancyService Integration Tests
 * TASK-RECON-012: Discrepancy Detection and Classification
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests discrepancy detection, classification, severity calculation, and resolution suggestions
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { DiscrepancyService } from '../../../src/database/services/discrepancy.service';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import { Tenant, ReconciliationStatus, TransactionStatus } from '@prisma/client';
import { DiscrepancyType } from '../../../src/database/dto/discrepancy.dto';

describe('DiscrepancyService', () => {
  let service: DiscrepancyService;
  let prisma: PrismaService;
  let testTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        DiscrepancyService,
        ReconciliationRepository,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<DiscrepancyService>(DiscrepancyService);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Discrepancy Test Creche',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27211234567',
        email: `discrepancy${Date.now()}@test.co.za`,
      },
    });
  });

  afterEach(async () => {
    // Cleanup test data in FK order - CRITICAL
    if (testTenant?.id) {
      await prisma.auditLog.deleteMany({ where: { tenantId: testTenant.id } });
      await prisma.reconciliation.deleteMany({ where: { tenantId: testTenant.id } });
      await prisma.transaction.deleteMany({ where: { tenantId: testTenant.id } });
      await prisma.user.deleteMany({ where: { tenantId: testTenant.id } });
      await prisma.tenant.delete({ where: { id: testTenant.id } });
    }
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('detectDiscrepancies()', () => {
    it('should detect IN_BANK_NOT_XERO transactions', async () => {
      // Create reconciliation
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 60000,
          calculatedBalanceCents: 60000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Create bank transaction (not synced to Xero)
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Bank deposit not in Xero',
          amountCents: 5000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancyCount).toBe(1);
      expect(report.summary.inBankNotXero).toBe(1);
      expect(report.summary.inXeroNotBank).toBe(0);
      expect(report.discrepancies[0].type).toBe(
        DiscrepancyType.IN_BANK_NOT_XERO,
      );
      expect(report.discrepancies[0].amountCents).toBe(5000);
    });

    it('should detect IN_XERO_NOT_BANK transactions', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 50000,
          calculatedBalanceCents: 50000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Create Xero transaction (synced but not in bank)
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Xero transaction not in bank',
          xeroTransactionId: 'XERO-123',
          amountCents: 8000,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancyCount).toBe(1);
      expect(report.summary.inXeroNotBank).toBe(1);
      expect(report.summary.inBankNotXero).toBe(0);
      expect(report.discrepancies[0].type).toBe(
        DiscrepancyType.IN_XERO_NOT_BANK,
      );
      expect(report.discrepancies[0].xeroTransactionId).toBe('XERO-123');
    });

    it('should detect AMOUNT_MISMATCH', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 50000,
          calculatedBalanceCents: 50000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Create bank transaction
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Payment',
          reference: 'REF-001',
          amountCents: 10000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      // Create Xero transaction with different amount
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Payment',
          reference: 'REF-001',
          xeroTransactionId: 'XERO-456',
          amountCents: 9500, // Different amount
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancyCount).toBe(1);
      expect(report.summary.amountMismatches).toBe(1);
      expect(report.discrepancies[0].type).toBe(
        DiscrepancyType.AMOUNT_MISMATCH,
      );
      expect(report.discrepancies[0].expectedAmountCents).toBe(9500);
      expect(report.discrepancies[0].actualAmountCents).toBe(10000);
    });

    it('should detect DATE_MISMATCH', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 50000,
          calculatedBalanceCents: 50000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Create bank transaction
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Payment',
          reference: 'REF-002',
          amountCents: 15000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      // Create Xero transaction with different date
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-18'), // Different date
          description: 'Payment',
          reference: 'REF-002',
          xeroTransactionId: 'XERO-789',
          amountCents: 15000,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancyCount).toBe(1);
      expect(report.summary.dateMismatches).toBe(1);
      expect(report.discrepancies[0].type).toBe(DiscrepancyType.DATE_MISMATCH);
    });

    it('should match transactions by reference correctly', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 70000,
          calculatedBalanceCents: 70000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Create matching bank and Xero transactions with same reference
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Payment',
          reference: 'MATCH-REF',
          amountCents: 20000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Payment',
          reference: 'MATCH-REF',
          xeroTransactionId: 'XERO-MATCH',
          amountCents: 20000,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      // Should have no discrepancies as they match
      expect(report.discrepancyCount).toBe(0);
      expect(report.summary.inBankNotXero).toBe(0);
      expect(report.summary.inXeroNotBank).toBe(0);
    });

    it('should match transactions by amount and date when no reference', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 75000,
          calculatedBalanceCents: 75000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      // Create matching transactions without reference
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-20'),
          description: 'Payment without ref',
          amountCents: 25000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-20'),
          description: 'Payment without ref',
          xeroTransactionId: 'XERO-NO-REF',
          amountCents: 25000,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancyCount).toBe(0);
    });

    it('should enforce tenant isolation', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Durban',
          province: 'KZN',
          postalCode: '4001',
          phone: '+27311234567',
          email: `other${Date.now()}@test.co.za`,
        },
      });

      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 50000,
          calculatedBalanceCents: 50000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      await expect(
        service.detectDiscrepancies(otherTenant.id, recon.id),
      ).rejects.toThrow();
    });
  });

  describe('classifyDiscrepancy()', () => {
    it('should classify amount mismatch', async () => {
      const bankTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          description: 'Test',
          amountCents: 10000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      const xeroTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          description: 'Test',
          xeroTransactionId: 'XERO-123',
          amountCents: 9500,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const classification = service.classifyDiscrepancy(bankTx, xeroTx);

      expect(classification.type).toBe(DiscrepancyType.AMOUNT_MISMATCH);
      expect(classification.severity).toBe('LOW'); // 500c difference
    });

    it('should classify date mismatch', async () => {
      const bankTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          description: 'Test',
          amountCents: 10000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      const xeroTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-18'),
          description: 'Test',
          xeroTransactionId: 'XERO-456',
          amountCents: 10000,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const classification = service.classifyDiscrepancy(bankTx, xeroTx);

      expect(classification.type).toBe(DiscrepancyType.DATE_MISMATCH);
    });

    it('should return null type for matching transactions', async () => {
      const bankTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          description: 'Test',
          amountCents: 10000,
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      const xeroTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB',
          date: new Date('2025-01-15'),
          description: 'Test',
          xeroTransactionId: 'XERO-789',
          amountCents: 10000,
          isCredit: true,
          source: 'MANUAL',
          status: TransactionStatus.SYNCED,
        },
      });

      const classification = service.classifyDiscrepancy(bankTx, xeroTx);

      expect(classification.type).toBeNull();
    });
  });

  describe('calculateSeverity()', () => {
    it('should classify LOW for <= R10 (1000c)', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 50000,
          calculatedBalanceCents: 50000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Small transaction',
          amountCents: 500, // R5
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancies[0].severity).toBe('LOW');
    });

    it('should classify MEDIUM for R10-R100 (1000-10000c)', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 50000,
          calculatedBalanceCents: 50000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Medium transaction',
          amountCents: 5000, // R50
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancies[0].severity).toBe('MEDIUM');
    });

    it('should classify HIGH for > R100 (>10000c)', async () => {
      const recon = await prisma.reconciliation.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          periodStart: new Date('2025-01-01'),
          periodEnd: new Date('2025-01-31'),
          openingBalanceCents: 50000,
          closingBalanceCents: 50000,
          calculatedBalanceCents: 50000,
          discrepancyCents: 0,
          status: ReconciliationStatus.IN_PROGRESS,
        },
      });

      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB-001',
          date: new Date('2025-01-15'),
          description: 'Large transaction',
          amountCents: 50000, // R500
          isCredit: true,
          source: 'CSV_IMPORT',
          status: TransactionStatus.PENDING,
        },
      });

      const report = await service.detectDiscrepancies(testTenant.id, recon.id);

      expect(report.discrepancies[0].severity).toBe('HIGH');
    });
  });

  describe('suggestResolution()', () => {
    it('should suggest CREATE_XERO_TRANSACTION for IN_BANK_NOT_XERO', () => {
      const discrepancy = {
        type: DiscrepancyType.IN_BANK_NOT_XERO,
        description: 'Bank transaction',
        amountCents: 5000,
        severity: 'LOW' as const,
      };

      const suggestion = service.suggestResolution(discrepancy);

      expect(suggestion.action).toBe('CREATE_XERO_TRANSACTION');
      expect(suggestion.automatable).toBe(true);
      expect(suggestion.estimatedImpactCents).toBe(5000);
    });

    it('should suggest VERIFY_BANK_TRANSACTION for IN_XERO_NOT_BANK', () => {
      const discrepancy = {
        type: DiscrepancyType.IN_XERO_NOT_BANK,
        description: 'Xero transaction',
        amountCents: 8000,
        severity: 'MEDIUM' as const,
      };

      const suggestion = service.suggestResolution(discrepancy);

      expect(suggestion.action).toBe('VERIFY_BANK_TRANSACTION');
      expect(suggestion.automatable).toBe(false);
    });

    it('should suggest CORRECT_AMOUNT for AMOUNT_MISMATCH', () => {
      const discrepancy = {
        type: DiscrepancyType.AMOUNT_MISMATCH,
        description: 'Amount difference',
        amountCents: 500,
        expectedAmountCents: 10000,
        actualAmountCents: 10500,
        severity: 'LOW' as const,
      };

      const suggestion = service.suggestResolution(discrepancy);

      expect(suggestion.action).toBe('CORRECT_AMOUNT');
      expect(suggestion.automatable).toBe(false);
      expect(suggestion.estimatedImpactCents).toBe(500);
    });
  });

  describe('reportDiscrepancy()', () => {
    it('should store discrepancy in audit log', async () => {
      const discrepancy = {
        type: DiscrepancyType.IN_BANK_NOT_XERO,
        transactionId: 'tx-123',
        description: 'Test discrepancy',
        amountCents: 5000,
        severity: 'LOW' as const,
      };

      await service.reportDiscrepancy(discrepancy, testTenant.id);

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          action: 'RECONCILE',
          entityId: 'tx-123',
        },
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].entityId).toBe('tx-123');
      expect(logs[0].changeSummary).toContain('Discrepancy detected');
      expect(logs[0].afterValue).toMatchObject({
        discrepancyType: DiscrepancyType.IN_BANK_NOT_XERO,
        amountCents: 5000,
        severity: 'LOW',
      });
    });
  });
});
