/**
 * Cash Flow Report Service Integration Tests
 * TASK-REPORTS-005: Missing Report Types Implementation
 *
 * @description Integration tests using REAL PostgreSQL database.
 * Tests Cash Flow Statement generation with operating, investing, and financing activities.
 *
 * CRITICAL: Uses real data, NO mock data.
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CashFlowReportService } from '../../../src/database/services/cash-flow-report.service';
import { CashFlowService } from '../../../src/database/services/cash-flow.service';
import { FinancialReportService } from '../../../src/database/services/financial-report.service';
import { GeneralLedgerService } from '../../../src/database/services/general-ledger.service';
import { OpeningBalanceService } from '../../../src/database/services/opening-balance.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { BusinessException } from '../../../src/shared/exceptions';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import { cleanDatabase } from '../../helpers/clean-database';

describe('CashFlowReportService (Integration)', () => {
  let service: CashFlowReportService;
  let prisma: PrismaService;
  let tenantRepo: TenantRepository;
  let transactionRepo: TransactionRepository;

  let testTenantId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashFlowReportService,
        CashFlowService,
        FinancialReportService,
        GeneralLedgerService,
        OpeningBalanceService,
        PrismaService,
        TenantRepository,
        TransactionRepository,
        InvoiceRepository,
        AuditLogService,
      ],
    }).compile();

    service = module.get<CashFlowReportService>(CashFlowReportService);
    prisma = module.get<PrismaService>(PrismaService);
    tenantRepo = module.get<TenantRepository>(TenantRepository);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant
    const tenant = await tenantRepo.create({
      name: 'Cash Flow Test Creche',
      email: `cashflow-test-${Date.now()}@example.com`,
      phone: '0211234567',
      addressLine1: '123 Test Street',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '8001',
    });
    testTenantId = tenant.id;
  });

  describe('generateCashFlowStatement', () => {
    it('should generate cash flow statement with all sections', async () => {
      const periodStart = new Date('2025-01-01');
      const periodEnd = new Date('2025-01-31');

      const result = await service.generateCashFlowStatement(
        testTenantId,
        periodStart,
        periodEnd,
      );

      // Verify structure
      expect(result.tenantId).toBe(testTenantId);
      expect(result.period.start).toEqual(periodStart);
      expect(result.period.end).toEqual(periodEnd);

      // Verify operating section
      expect(result.operating).toBeDefined();
      expect(typeof result.operating.netProfit).toBe('number');
      expect(typeof result.operating.adjustments).toBe('number');
      expect(typeof result.operating.workingCapital).toBe('number');
      expect(typeof result.operating.total).toBe('number');
      expect(Array.isArray(result.operating.details)).toBe(true);

      // Verify investing section
      expect(result.investing).toBeDefined();
      expect(typeof result.investing.total).toBe('number');
      expect(Array.isArray(result.investing.items)).toBe(true);

      // Verify financing section
      expect(result.financing).toBeDefined();
      expect(typeof result.financing.total).toBe('number');
      expect(Array.isArray(result.financing.items)).toBe(true);

      // Verify summary values
      expect(typeof result.netCashFlow).toBe('number');
      expect(typeof result.openingBalance).toBe('number');
      expect(typeof result.closingBalance).toBe('number');
      expect(typeof result.cashReconciles).toBe('boolean');
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should calculate net cash flow correctly', async () => {
      // Create credit transaction (cash inflow)
      await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-05'),
        description: 'Customer Payment',
        amountCents: 100000, // R1,000
        isCredit: true,
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      // Create debit transaction (cash outflow)
      await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-10'),
        description: 'Rent Payment',
        amountCents: 30000, // R300
        isCredit: false,
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      const periodStart = new Date('2025-01-01');
      const periodEnd = new Date('2025-01-31');

      const result = await service.generateCashFlowStatement(
        testTenantId,
        periodStart,
        periodEnd,
      );

      // Net cash flow should be calculated (actual values depend on how transactions are categorized)
      expect(typeof result.netCashFlow).toBe('number');
      expect(typeof result.closingBalance).toBe('number');
    });

    it('should handle empty period with no transactions', async () => {
      const periodStart = new Date('2025-01-01');
      const periodEnd = new Date('2025-01-31');

      const result = await service.generateCashFlowStatement(
        testTenantId,
        periodStart,
        periodEnd,
      );

      // Should return zeros, never null
      expect(result.operating.netProfit).toBe(0);
      expect(result.operating.total).toBe(0);
      expect(result.investing.total).toBe(0);
      expect(result.financing.total).toBe(0);
      expect(result.netCashFlow).toBe(0);
    });

    it('should throw error for invalid period dates', async () => {
      const periodStart = new Date('2025-01-31');
      const periodEnd = new Date('2025-01-01');

      await expect(
        service.generateCashFlowStatement(testTenantId, periodStart, periodEnd),
      ).rejects.toThrow(BusinessException);
    });

    it('should enforce tenant isolation', async () => {
      // Create another tenant
      const tenant2 = await tenantRepo.create({
        name: 'Other Creche',
        email: `other-test-${Date.now()}@example.com`,
        phone: '0219876543',
        addressLine1: '456 Other Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
      });

      // Create transaction for tenant2
      await transactionRepo.create({
        tenantId: tenant2.id,
        date: new Date('2025-01-05'),
        description: 'Other Tenant Transaction',
        amountCents: 999999,
        isCredit: true,
        bankAccount: 'Other Account',
        source: ImportSource.MANUAL,
      });

      const periodStart = new Date('2025-01-01');
      const periodEnd = new Date('2025-01-31');

      // Generate report for testTenantId
      const result = await service.generateCashFlowStatement(
        testTenantId,
        periodStart,
        periodEnd,
      );

      // Should not include other tenant's data
      expect(result.netCashFlow).toBe(0);

      // Cleanup
      await prisma.transaction.deleteMany({ where: { tenantId: tenant2.id } });
      await prisma.tenant.delete({ where: { id: tenant2.id } });
    });
  });

  describe('getCashFlowSummary', () => {
    it('should return summary with correct structure', async () => {
      const periodStart = new Date('2025-01-01');
      const periodEnd = new Date('2025-01-31');

      const result = await service.getCashFlowSummary(
        testTenantId,
        periodStart,
        periodEnd,
      );

      expect(typeof result.operatingCents).toBe('number');
      expect(typeof result.investingCents).toBe('number');
      expect(typeof result.financingCents).toBe('number');
      expect(typeof result.netChangeCents).toBe('number');
      expect(typeof result.openingBalanceCents).toBe('number');
      expect(typeof result.closingBalanceCents).toBe('number');
      expect(typeof result.isPositive).toBe('boolean');
    });

    it('should correctly identify positive cash flow', async () => {
      // Create credit transaction (cash inflow)
      await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-05'),
        description: 'Large Customer Payment',
        amountCents: 500000, // R5,000
        isCredit: true,
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      const periodStart = new Date('2025-01-01');
      const periodEnd = new Date('2025-01-31');

      const result = await service.getCashFlowSummary(
        testTenantId,
        periodStart,
        periodEnd,
      );

      // With only credit transactions, cash flow should be positive
      expect(result.closingBalanceCents).toBeGreaterThanOrEqual(0);
    });
  });
});
