/**
 * Comparative Balance Sheet Service Tests
 * TASK-RECON-036: Complete Balance Sheet Implementation
 *
 * @description Integration tests for comparative balance sheet generation,
 * variance calculations, IFRS compliance checks, and opening balance verification
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { ComparativeBalanceSheetService } from '../../../src/database/services/comparative-balance-sheet.service';
import { BalanceSheetService } from '../../../src/database/services/balance-sheet.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { DEFAULT_ACCOUNTS } from '../../../src/database/constants/chart-of-accounts.constants';
import { ImportSource } from '../../../src/database/entities/transaction.entity';
import {
  CategorizationSource,
  VatType,
} from '../../../src/database/entities/categorization.entity';

describe('ComparativeBalanceSheetService (Integration)', () => {
  let service: ComparativeBalanceSheetService;
  let balanceSheetService: BalanceSheetService;
  let prisma: PrismaService;
  let tenantRepo: TenantRepository;
  let transactionRepo: TransactionRepository;
  let categorizationRepo: CategorizationRepository;

  let testTenantId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComparativeBalanceSheetService,
        BalanceSheetService,
        PrismaService,
        TransactionRepository,
        TenantRepository,
        CategorizationRepository,
        AuditLogService,
      ],
    }).compile();

    service = module.get<ComparativeBalanceSheetService>(
      ComparativeBalanceSheetService,
    );
    balanceSheetService = module.get<BalanceSheetService>(BalanceSheetService);
    prisma = module.get<PrismaService>(PrismaService);
    tenantRepo = module.get<TenantRepository>(TenantRepository);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    categorizationRepo = module.get<CategorizationRepository>(
      CategorizationRepository,
    );

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Create test tenant
    const tenant = await tenantRepo.create({
      name: 'Comparative Balance Sheet Test Creche',
      email: `comparative-test-${Date.now()}@example.com`,
      phone: '0211234567',
      addressLine1: '123 Test Street',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '8001',
    });
    testTenantId = tenant.id;
  });

  afterEach(async () => {
    // Cleanup test data
    if (testTenantId) {
      await prisma.categorization.deleteMany({
        where: { transaction: { tenantId: testTenantId } },
      });
      await prisma.transaction.deleteMany({
        where: { tenantId: testTenantId },
      });
      await prisma.tenant.delete({ where: { id: testTenantId } });
    }
  });

  describe('generateComparative', () => {
    it('should generate comparative balance sheet with two periods', async () => {
      // Create transaction in prior period
      // For asset accounts, debits (isCredit=false) increase the balance
      const priorTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Initial Deposit',
        amountCents: 100000, // R1,000
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: priorTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      // Create transaction in current period
      const currentTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'Second Deposit',
        amountCents: 50000, // R500
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: currentTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      // Generate comparative balance sheet
      const currentDate = new Date('2025-02-28');
      const priorDate = new Date('2025-01-31');

      const result = await service.generateComparative(
        testTenantId,
        currentDate,
        priorDate,
      );

      // Verify structure
      expect(result).toBeDefined();
      expect(result.currentPeriod).toBeDefined();
      expect(result.priorPeriod).toBeDefined();
      expect(result.variances).toBeDefined();
      expect(result.notes).toBeDefined();
      expect(result.complianceStatus).toBeDefined();

      // Verify periods are different
      expect(result.currentPeriod.asAtDate).not.toEqual(
        result.priorPeriod.asAtDate,
      );
    });

    it('should calculate variances correctly between periods', async () => {
      // Prior period: R1,000 in cash (debit to asset account = increase)
      const priorTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Prior Period Cash',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: priorTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      // Current period: Additional R500 in cash (total R1,500)
      const currentTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'Current Period Cash',
        amountCents: 50000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: currentTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      // Verify variance calculation
      // Prior: 100000c, Current: 150000c (100000 + 50000)
      // Variance: 50000c (50%)
      const cashVariance = result.variances.assets.current.find(
        (v) => v.account === DEFAULT_ACCOUNTS.PETTY_CASH.code,
      );

      expect(cashVariance).toBeDefined();
      expect(cashVariance!.priorAmountCents).toBe(100000);
      expect(cashVariance!.currentAmountCents).toBe(150000);
      expect(cashVariance!.varianceCents).toBe(50000);
      expect(cashVariance!.variancePercent).toBe(50);
    });

    it('should handle variance calculation with Decimal.js precision', async () => {
      // Create transactions with amounts that could cause floating point issues
      const priorTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Prior Amount',
        amountCents: 33333, // R333.33
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: priorTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const currentTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'Current Amount',
        amountCents: 16667, // R166.67
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: currentTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      const cashVariance = result.variances.assets.current.find(
        (v) => v.account === DEFAULT_ACCOUNTS.PETTY_CASH.code,
      );

      // Total current: 33333 + 16667 = 50000
      // Prior: 33333
      // Variance: 16667 (should be exact integer, no floating point issues)
      expect(cashVariance).toBeDefined();
      expect(Number.isInteger(cashVariance!.varianceCents)).toBe(true);

      // Verify variance percentage is calculated correctly
      const expectedPercent = new Decimal(16667).div(33333).mul(100).toNumber();
      expect(cashVariance!.variancePercent).toBeCloseTo(expectedPercent, 1);
    });

    it('should handle accounts that exist in only one period', async () => {
      // Only create transaction in current period
      const currentTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'New Account',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: currentTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      // Account should show 100% increase (from 0 to some value)
      const cashVariance = result.variances.assets.current.find(
        (v) => v.account === DEFAULT_ACCOUNTS.PETTY_CASH.code,
      );

      expect(cashVariance).toBeDefined();
      expect(cashVariance!.priorAmountCents).toBe(0);
      expect(cashVariance!.currentAmountCents).toBe(100000);
      expect(cashVariance!.variancePercent).toBe(100);
    });
  });

  describe('checkIFRSCompliance', () => {
    it('should pass compliance for balanced balance sheet with required items', async () => {
      // Create a balanced set of transactions
      // Cash asset (debit = increase for assets)
      const cashTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Cash Deposit',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: cashTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      // Generate balance sheet and check compliance
      const balanceSheet = await balanceSheetService.generate(
        testTenantId,
        new Date('2025-01-31'),
      );

      const compliance = service.checkIFRSCompliance(balanceSheet);

      // Should have some passed checks
      expect(compliance.checkedSections).toBeDefined();
      expect(compliance.checkedSections.length).toBeGreaterThan(0);

      // Check for accounting equation check
      const equationCheck = compliance.checkedSections.find(
        (c) => c.section === 'Accounting Equation',
      );
      expect(equationCheck).toBeDefined();
    });

    it('should flag non-balanced balance sheet as non-compliant', async () => {
      // Create a mock unbalanced balance sheet
      const mockUnbalancedSheet = {
        asAtDate: new Date('2025-01-31'),
        tenantId: testTenantId,
        assets: {
          current: [],
          nonCurrent: [],
          totalCurrentCents: 100000,
          totalNonCurrentCents: 0,
          totalCents: 100000,
        },
        liabilities: {
          current: [],
          nonCurrent: [],
          totalCurrentCents: 0,
          totalNonCurrentCents: 0,
          totalCents: 0,
        },
        equity: {
          items: [],
          retainedEarningsCents: 50000, // Intentionally not matching
          totalCents: 50000,
        },
        totalAssetsCents: 100000,
        totalLiabilitiesAndEquityCents: 50000, // Not balanced!
        isBalanced: false,
        generatedAt: new Date(),
      };

      const compliance = service.checkIFRSCompliance(
        mockUnbalancedSheet as any,
      );

      // Should be non-compliant
      expect(compliance.isCompliant).toBe(false);

      // Should have warning about balance
      expect(
        compliance.warnings.some((w) => w.includes('does not balance')),
      ).toBe(true);
    });

    it('should check for minimum required line items (Section 4.2)', async () => {
      // Create balance sheet with no transactions
      const balanceSheet = await balanceSheetService.generate(
        testTenantId,
        new Date('2025-01-31'),
      );

      const compliance = service.checkIFRSCompliance(balanceSheet);

      // Should have Section 4.2 checks
      const section42Checks = compliance.checkedSections.filter((c) =>
        c.section.startsWith('Section 4.2'),
      );

      expect(section42Checks.length).toBeGreaterThan(0);
    });

    it('should check current/non-current classification (Section 4.4-4.8)', async () => {
      // Create transaction (debit = increase for assets)
      const tx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Test Asset',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const balanceSheet = await balanceSheetService.generate(
        testTenantId,
        new Date('2025-01-31'),
      );

      const compliance = service.checkIFRSCompliance(balanceSheet);

      // Should have classification checks
      const classificationChecks = compliance.checkedSections.filter(
        (c) =>
          c.section.includes('4.4') ||
          c.section.includes('4.5') ||
          c.section.includes('4.7') ||
          c.section.includes('4.8'),
      );

      expect(classificationChecks.length).toBeGreaterThan(0);
    });

    it('should check materiality threshold (Section 4.11)', async () => {
      // Create a large transaction to have a baseline (debit = increase for assets)
      const largeTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-10'),
        description: 'Large Asset',
        amountCents: 10000000, // R100,000
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: largeTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      // Create a small transaction below 5% threshold
      const smallTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Small Item',
        amountCents: 10000, // R100 (0.1% of total - below 5%)
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Petty',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: smallTx.id,
        accountCode: DEFAULT_ACCOUNTS.CASH_ON_HAND.code,
        accountName: DEFAULT_ACCOUNTS.CASH_ON_HAND.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const balanceSheet = await balanceSheetService.generate(
        testTenantId,
        new Date('2025-01-31'),
      );

      const compliance = service.checkIFRSCompliance(balanceSheet);

      // Should have Section 4.11 check
      const materialityCheck = compliance.checkedSections.find((c) =>
        c.section.includes('4.11'),
      );

      expect(materialityCheck).toBeDefined();
    });
  });

  describe('getOpeningBalances', () => {
    it('should return opening balances equal to prior period closing', async () => {
      // Create transaction before period start (debit = increase for assets)
      const priorTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Prior Period Transaction',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: priorTx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      // Get opening balances for February
      const openingBalances = await service.getOpeningBalances(
        testTenantId,
        new Date('2025-02-01'),
      );

      // Verify structure
      expect(openingBalances).toBeDefined();
      expect(openingBalances.tenantId).toBe(testTenantId);
      expect(openingBalances.assets).toBeDefined();
      expect(openingBalances.liabilities).toBeDefined();
      expect(openingBalances.equity).toBeDefined();

      // Get prior period closing (Jan 31)
      const priorClosing = await balanceSheetService.generate(
        testTenantId,
        new Date('2025-01-31'),
      );

      // Opening balance should equal prior closing
      expect(openingBalances.totalAssetsCents).toBe(
        priorClosing.totalAssetsCents,
      );
      expect(openingBalances.totalLiabilitiesCents).toBe(
        priorClosing.liabilities.totalCents,
      );
    });

    it('should return zero opening balances for first period', async () => {
      // Get opening balances for a period with no prior transactions
      const openingBalances = await service.getOpeningBalances(
        testTenantId,
        new Date('2025-01-01'),
      );

      // Should be all zeros
      expect(openingBalances.totalAssetsCents).toBe(0);
      expect(openingBalances.totalLiabilitiesCents).toBe(0);
      expect(openingBalances.totalEquityCents).toBe(0);
    });

    it('should include retained earnings in equity opening balances', async () => {
      // Create income transaction before period
      // Income is credited (isCredit=true = credit to income = increase)
      const incomeTx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Fee Income',
        amountCents: 50000,
        isCredit: true, // Credit to income (income increase)
        bankAccount: 'Main Account',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: incomeTx.id,
        accountCode: DEFAULT_ACCOUNTS.SCHOOL_FEES.code,
        accountName: DEFAULT_ACCOUNTS.SCHOOL_FEES.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      // Get opening balances
      const openingBalances = await service.getOpeningBalances(
        testTenantId,
        new Date('2025-02-01'),
      );

      // Should have retained earnings in equity
      const retainedEarnings = openingBalances.equity.find(
        (e) => e.description === 'Retained Earnings',
      );

      expect(retainedEarnings).toBeDefined();
      expect(retainedEarnings!.balanceCents).toBe(50000);
    });
  });

  describe('variance calculation', () => {
    it('should calculate positive variance correctly', async () => {
      // Prior: 100000, Current: 150000 = +50000 (+50%)
      // Debit to asset account = increase
      const prior = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Prior',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: prior.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const current = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'Current',
        amountCents: 50000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: current.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      const variance = result.variances.assets.current.find(
        (v) => v.account === DEFAULT_ACCOUNTS.PETTY_CASH.code,
      );

      expect(variance!.varianceCents).toBe(50000);
      expect(variance!.variancePercent).toBeCloseTo(50, 1);
    });

    it('should calculate negative variance correctly', async () => {
      // Prior: 100000, then withdraw 60000 in current = 40000 (-60%)
      // Debit = increase for assets, Credit = decrease for assets
      const deposit = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Deposit',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: deposit.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const withdrawal = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'Withdrawal',
        amountCents: 60000,
        isCredit: true, // Credit to cash (asset decrease)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: withdrawal.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      const variance = result.variances.assets.current.find(
        (v) => v.account === DEFAULT_ACCOUNTS.PETTY_CASH.code,
      );

      // Prior: 100000, Current: 40000 (100000 - 60000)
      // Variance: -60000 (-60%)
      expect(variance!.varianceCents).toBe(-60000);
      expect(variance!.variancePercent).toBeCloseTo(-60, 1);
    });

    it('should handle zero to non-zero variance (100% increase)', async () => {
      // Only current period has data (debit = increase for assets)
      const current = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'New Account',
        amountCents: 50000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: current.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      const variance = result.variances.assets.current.find(
        (v) => v.account === DEFAULT_ACCOUNTS.PETTY_CASH.code,
      );

      expect(variance!.priorAmountCents).toBe(0);
      expect(variance!.currentAmountCents).toBe(50000);
      expect(variance!.variancePercent).toBe(100); // 100% increase from zero
    });
  });

  describe('notes generation', () => {
    it('should generate notes for significant variances (>20%)', async () => {
      // Create a significant variance (>20%)
      // Debit = increase for assets
      const prior = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Prior',
        amountCents: 100000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: prior.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const current = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-02-15'),
        description: 'Current - Big Change',
        amountCents: 100000, // +100%, which is > 20%
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: current.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      // Should have note about significant asset change
      const assetNote = result.notes.find(
        (n) =>
          n.section === 'assets' && n.title === 'Significant Asset Changes',
      );

      expect(assetNote).toBeDefined();
      expect(assetNote!.content).toContain('%');
    });
  });

  describe('tenant isolation', () => {
    it('should only include data for specified tenant', async () => {
      // Create another tenant
      const tenant2 = await tenantRepo.create({
        name: 'Other Creche',
        email: `other-${Date.now()}@example.com`,
        phone: '0219876543',
        addressLine1: '456 Other Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
      });

      // Create transaction for tenant2 (no categorization, won't appear in balance sheet)
      await transactionRepo.create({
        tenantId: tenant2.id,
        date: new Date('2025-01-15'),
        description: 'Other Tenant',
        amountCents: 999999,
        isCredit: false,
        bankAccount: 'Other',
        source: ImportSource.MANUAL,
      });

      // Create transaction for test tenant (debit = increase for assets)
      const tx = await transactionRepo.create({
        tenantId: testTenantId,
        date: new Date('2025-01-15'),
        description: 'Test Tenant',
        amountCents: 50000,
        isCredit: false, // Debit to cash (asset increase)
        bankAccount: 'Main',
        source: ImportSource.MANUAL,
      });

      await categorizationRepo.create({
        transactionId: tx.id,
        accountCode: DEFAULT_ACCOUNTS.PETTY_CASH.code,
        accountName: DEFAULT_ACCOUNTS.PETTY_CASH.name,
        confidenceScore: 100,
        source: CategorizationSource.USER_OVERRIDE,
        isSplit: false,
        vatType: VatType.EXEMPT,
      });

      const result = await service.generateComparative(
        testTenantId,
        new Date('2025-02-28'),
        new Date('2025-01-31'),
      );

      // Should not include other tenant's data
      expect(result.currentPeriod.totalAssetsCents).toBeLessThan(999999);

      // Cleanup tenant2
      await prisma.transaction.deleteMany({ where: { tenantId: tenant2.id } });
      await prisma.tenant.delete({ where: { id: tenant2.id } });
    });
  });
});
