import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ReconciliationRepository } from '../../../src/database/repositories/reconciliation.repository';
import { CreateReconciliationDto } from '../../../src/database/dto/reconciliation.dto';
import { ReconciliationStatus } from '../../../src/database/entities/reconciliation.entity';
import {
  NotFoundException,
  ConflictException,
  BusinessException,
} from '../../../src/shared/exceptions';
import { Tenant, User } from '@prisma/client';

describe('ReconciliationRepository', () => {
  let repository: ReconciliationRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;

  // Real test data - South African bank reconciliation
  const testReconciliationData: CreateReconciliationDto = {
    tenantId: '', // Will be set in beforeEach
    bankAccount: 'FNB Cheque - 123456789',
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-01-31'),
    openingBalanceCents: 10000000, // R100,000.00
    closingBalanceCents: 12500000, // R125,000.00 (bank statement)
    calculatedBalanceCents: 12450000, // R124,500.00 (from transactions)
    notes: 'January 2025 bank reconciliation',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, ReconciliationRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<ReconciliationRepository>(ReconciliationRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - reconciliations depend on tenant and user!
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
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

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
        taxStatus: 'VAT_REGISTERED',
        vatNumber: '4123456789',
      },
    });

    // Create test user for reconciliation tracking
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        auth0Id: `auth0|test${Date.now()}`,
        email: `admin${Date.now()}@littlestars.co.za`,
        name: 'Test Accountant',
        role: 'OWNER',
      },
    });

    // Update test data with created IDs
    testReconciliationData.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create reconciliation with all fields', async () => {
      const reconciliation = await repository.create(testReconciliationData);

      expect(reconciliation.id).toBeDefined();
      expect(reconciliation.tenantId).toBe(testTenant.id);
      expect(reconciliation.bankAccount).toBe(
        testReconciliationData.bankAccount,
      );
      expect(reconciliation.openingBalanceCents).toBe(10000000);
      expect(reconciliation.closingBalanceCents).toBe(12500000);
      expect(reconciliation.calculatedBalanceCents).toBe(12450000);
      expect(reconciliation.discrepancyCents).toBe(50000); // 125000 - 124500 = R500.00
      expect(reconciliation.status).toBe(ReconciliationStatus.IN_PROGRESS);
      expect(reconciliation.reconciledBy).toBeNull();
      expect(reconciliation.reconciledAt).toBeNull();
      expect(reconciliation.notes).toBe(testReconciliationData.notes);
      expect(reconciliation.createdAt).toBeInstanceOf(Date);
    });

    it('should auto-calculate discrepancy as closingBalance - calculatedBalance', async () => {
      const data: CreateReconciliationDto = {
        ...testReconciliationData,
        closingBalanceCents: 1000000, // R10,000.00
        calculatedBalanceCents: 950000, // R9,500.00
      };

      const reconciliation = await repository.create(data);

      expect(reconciliation.discrepancyCents).toBe(50000); // R500.00 discrepancy
    });

    it('should handle negative discrepancy (calculated > closing)', async () => {
      const data: CreateReconciliationDto = {
        ...testReconciliationData,
        closingBalanceCents: 950000,
        calculatedBalanceCents: 1000000,
      };

      const reconciliation = await repository.create(data);

      expect(reconciliation.discrepancyCents).toBe(-50000); // -R500.00 discrepancy
    });

    it('should handle zero discrepancy', async () => {
      const data: CreateReconciliationDto = {
        ...testReconciliationData,
        closingBalanceCents: 1000000,
        calculatedBalanceCents: 1000000,
      };

      const reconciliation = await repository.create(data);

      expect(reconciliation.discrepancyCents).toBe(0);
    });

    it('should default status to IN_PROGRESS', async () => {
      const reconciliation = await repository.create(testReconciliationData);
      expect(reconciliation.status).toBe(ReconciliationStatus.IN_PROGRESS);
    });

    it('should create reconciliation with minimum required fields', async () => {
      const minimalData: CreateReconciliationDto = {
        tenantId: testTenant.id,
        bankAccount: 'Savings Account',
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
        openingBalanceCents: 5000000,
        closingBalanceCents: 5500000,
        calculatedBalanceCents: 5500000,
      };

      const reconciliation = await repository.create(minimalData);

      expect(reconciliation.id).toBeDefined();
      expect(reconciliation.notes).toBeNull();
      expect(reconciliation.discrepancyCents).toBe(0);
    });

    it('should throw ConflictException for duplicate (tenantId, bankAccount, periodStart)', async () => {
      await repository.create(testReconciliationData);

      await expect(repository.create(testReconciliationData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow same period for different bank accounts', async () => {
      await repository.create(testReconciliationData);

      const otherAccount: CreateReconciliationDto = {
        ...testReconciliationData,
        bankAccount: 'Savings Account',
      };

      const reconciliation = await repository.create(otherAccount);
      expect(reconciliation.id).toBeDefined();
    });

    it('should allow same bank account for different periods', async () => {
      await repository.create(testReconciliationData);

      const nextMonth: CreateReconciliationDto = {
        ...testReconciliationData,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
      };

      const reconciliation = await repository.create(nextMonth);
      expect(reconciliation.id).toBeDefined();
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateReconciliationDto = {
        ...testReconciliationData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should find reconciliation by id', async () => {
      const created = await repository.create(testReconciliationData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.bankAccount).toBe(testReconciliationData.bankAccount);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByTenantAndAccount', () => {
    it('should find reconciliation by unique key', async () => {
      await repository.create(testReconciliationData);

      const found = await repository.findByTenantAndAccount(
        testTenant.id,
        testReconciliationData.bankAccount,
        testReconciliationData.periodStart,
      );

      expect(found).not.toBeNull();
      expect(found?.bankAccount).toBe(testReconciliationData.bankAccount);
    });

    it('should return null when not found', async () => {
      const found = await repository.findByTenantAndAccount(
        testTenant.id,
        'Non-existent Account',
        new Date('2024-01-01'),
      );

      expect(found).toBeNull();
    });

    it('should distinguish between bank accounts', async () => {
      await repository.create(testReconciliationData);
      await repository.create({
        ...testReconciliationData,
        bankAccount: 'Savings Account',
      });

      const cheque = await repository.findByTenantAndAccount(
        testTenant.id,
        testReconciliationData.bankAccount,
        testReconciliationData.periodStart,
      );

      const savings = await repository.findByTenantAndAccount(
        testTenant.id,
        'Savings Account',
        testReconciliationData.periodStart,
      );

      expect(cheque?.bankAccount).toBe(testReconciliationData.bankAccount);
      expect(savings?.bankAccount).toBe('Savings Account');
    });
  });

  describe('findByTenantId', () => {
    it('should return all reconciliations for tenant', async () => {
      await repository.create(testReconciliationData);
      await repository.create({
        ...testReconciliationData,
        bankAccount: 'Savings Account',
      });

      const reconciliations = await repository.findByTenantId(testTenant.id);

      expect(reconciliations).toHaveLength(2);
    });

    it('should filter by bankAccount', async () => {
      await repository.create(testReconciliationData);
      await repository.create({
        ...testReconciliationData,
        bankAccount: 'Savings Account',
      });

      const filtered = await repository.findByTenantId(testTenant.id, {
        bankAccount: 'Savings Account',
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].bankAccount).toBe('Savings Account');
    });

    it('should filter by status', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await repository.create({
        ...testReconciliationData,
        bankAccount: 'Savings Account',
      });

      const reconciled = await repository.findByTenantId(testTenant.id, {
        status: ReconciliationStatus.RECONCILED,
      });

      expect(reconciled).toHaveLength(1);
      expect(reconciled[0].status).toBe(ReconciliationStatus.RECONCILED);
    });

    it('should order by periodStart descending', async () => {
      await repository.create(testReconciliationData);
      await repository.create({
        ...testReconciliationData,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
      });

      const reconciliations = await repository.findByTenantId(testTenant.id);

      expect(reconciliations[0].periodStart.getMonth()).toBe(1); // February
      expect(reconciliations[1].periodStart.getMonth()).toBe(0); // January
    });
  });

  describe('findByBankAccount', () => {
    it('should return all reconciliations for specific bank account', async () => {
      await repository.create(testReconciliationData);
      await repository.create({
        ...testReconciliationData,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
      });
      await repository.create({
        ...testReconciliationData,
        bankAccount: 'Savings Account',
      });

      const reconciliations = await repository.findByBankAccount(
        testTenant.id,
        testReconciliationData.bankAccount,
      );

      expect(reconciliations).toHaveLength(2);
      reconciliations.forEach((r) => {
        expect(r.bankAccount).toBe(testReconciliationData.bankAccount);
      });
    });
  });

  describe('update', () => {
    it('should update reconciliation fields', async () => {
      const created = await repository.create(testReconciliationData);

      const updated = await repository.update(created.id, {
        closingBalanceCents: 13000000, // R130,000.00
        notes: 'Updated notes',
      });

      expect(updated.closingBalanceCents).toBe(13000000);
      expect(updated.notes).toBe('Updated notes');
      // Discrepancy should be recalculated
      expect(updated.discrepancyCents).toBe(13000000 - 12450000); // 550000
    });

    it('should recalculate discrepancy when calculatedBalanceCents is updated', async () => {
      const created = await repository.create(testReconciliationData);

      const updated = await repository.update(created.id, {
        calculatedBalanceCents: 12500000, // Now matches closing
      });

      expect(updated.discrepancyCents).toBe(0);
    });

    it('should throw NotFoundException for non-existent reconciliation', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          notes: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if reconciliation is RECONCILED', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await expect(
        repository.update(created.id, { notes: 'test' }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('complete', () => {
    it('should transition IN_PROGRESS to RECONCILED and set reconciler', async () => {
      const created = await repository.create(testReconciliationData);
      expect(created.status).toBe(ReconciliationStatus.IN_PROGRESS);

      const completed = await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      expect(completed.status).toBe(ReconciliationStatus.RECONCILED);
      expect(completed.reconciledAt).toBeInstanceOf(Date);
      expect(completed.reconciledBy).toBe(testUser.id);
    });

    it('should transition IN_PROGRESS to DISCREPANCY without setting reconciler fields', async () => {
      const created = await repository.create(testReconciliationData);

      const completed = await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.DISCREPANCY,
      });

      expect(completed.status).toBe(ReconciliationStatus.DISCREPANCY);
      // DISCREPANCY status should NOT set reconciledBy/reconciledAt
      expect(completed.reconciledBy).toBeNull();
      expect(completed.reconciledAt).toBeNull();
    });

    it('should throw NotFoundException for non-existent reconciliation', async () => {
      await expect(
        repository.complete('00000000-0000-0000-0000-000000000000', {
          reconciledBy: testUser.id,
          status: ReconciliationStatus.RECONCILED,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if already RECONCILED', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await expect(
        repository.complete(created.id, {
          reconciledBy: testUser.id,
          status: ReconciliationStatus.RECONCILED,
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw BusinessException if not IN_PROGRESS', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.DISCREPANCY,
      });

      await expect(
        repository.complete(created.id, {
          reconciledBy: testUser.id,
          status: ReconciliationStatus.RECONCILED,
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('calculateDiscrepancy', () => {
    it('should recalculate discrepancy based on current balances', async () => {
      const created = await repository.create(testReconciliationData);

      // Manually update balances without triggering recalculation
      await prisma.reconciliation.update({
        where: { id: created.id },
        data: {
          closingBalanceCents: 20000000,
          calculatedBalanceCents: 19500000,
          discrepancyCents: 0, // Wrong value
        },
      });

      const recalculated = await repository.calculateDiscrepancy(created.id);

      expect(recalculated.discrepancyCents).toBe(500000); // 20000000 - 19500000
    });

    it('should throw NotFoundException for non-existent reconciliation', async () => {
      await expect(
        repository.calculateDiscrepancy('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if RECONCILED', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await expect(repository.calculateDiscrepancy(created.id)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('findWithDiscrepancies', () => {
    it('should find reconciliations with non-zero discrepancy', async () => {
      // Create with discrepancy
      await repository.create(testReconciliationData); // Has R500 discrepancy

      // Create without discrepancy
      await repository.create({
        ...testReconciliationData,
        bankAccount: 'Savings Account',
        closingBalanceCents: 1000000,
        calculatedBalanceCents: 1000000, // No discrepancy
      });

      const withDiscrepancies = await repository.findWithDiscrepancies(
        testTenant.id,
      );

      expect(withDiscrepancies).toHaveLength(1);
      expect(withDiscrepancies[0].discrepancyCents).not.toBe(0);
    });

    it('should not include RECONCILED reconciliations', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      const withDiscrepancies = await repository.findWithDiscrepancies(
        testTenant.id,
      );

      expect(withDiscrepancies).toHaveLength(0);
    });
  });

  describe('findInProgress', () => {
    it('should find only IN_PROGRESS reconciliations', async () => {
      const created1 = await repository.create(testReconciliationData);
      await repository.complete(created1.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await repository.create({
        ...testReconciliationData,
        bankAccount: 'Savings Account',
      });

      const inProgress = await repository.findInProgress(testTenant.id);

      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].status).toBe(ReconciliationStatus.IN_PROGRESS);
    });
  });

  describe('delete', () => {
    it('should delete existing IN_PROGRESS reconciliation', async () => {
      const created = await repository.create(testReconciliationData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent reconciliation', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not IN_PROGRESS', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await expect(repository.delete(created.id)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw BusinessException if status is DISCREPANCY', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.DISCREPANCY,
      });

      await expect(repository.delete(created.id)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('tenant isolation', () => {
    it('should not return reconciliations from other tenants', async () => {
      await repository.create(testReconciliationData);

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@creche.co.za`,
        },
      });

      const reconciliations = await repository.findByTenantId(otherTenant.id);

      expect(reconciliations).toHaveLength(0);
    });
  });

  describe('status transitions', () => {
    it('should handle full IN_PROGRESS -> RECONCILED workflow', async () => {
      const created = await repository.create(testReconciliationData);
      expect(created.status).toBe(ReconciliationStatus.IN_PROGRESS);

      // Make some updates while in progress
      const updated = await repository.update(created.id, {
        notes: 'Verified all transactions',
      });
      expect(updated.status).toBe(ReconciliationStatus.IN_PROGRESS);

      // Complete the reconciliation
      const completed = await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });
      expect(completed.status).toBe(ReconciliationStatus.RECONCILED);
      expect(completed.reconciledAt).toBeInstanceOf(Date);
      expect(completed.reconciledBy).toBe(testUser.id);
    });

    it('should handle IN_PROGRESS -> DISCREPANCY workflow', async () => {
      const created = await repository.create(testReconciliationData);
      expect(created.status).toBe(ReconciliationStatus.IN_PROGRESS);

      // Mark as having discrepancy
      const discrepancy = await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.DISCREPANCY,
      });
      expect(discrepancy.status).toBe(ReconciliationStatus.DISCREPANCY);
      // Should NOT be marked as reconciled
      expect(discrepancy.reconciledAt).toBeNull();
      expect(discrepancy.reconciledBy).toBeNull();
    });
  });

  describe('date handling', () => {
    it('should store periodStart and periodEnd correctly', async () => {
      const reconciliation = await repository.create(testReconciliationData);

      const periodStart = new Date(reconciliation.periodStart);
      const periodEnd = new Date(reconciliation.periodEnd);

      expect(periodStart.getFullYear()).toBe(2025);
      expect(periodStart.getMonth()).toBe(0); // January
      expect(periodStart.getDate()).toBe(1);
      expect(periodEnd.getDate()).toBe(31);
    });

    it('should store reconciledAt correctly', async () => {
      const created = await repository.create(testReconciliationData);

      const beforeComplete = new Date();
      const completed = await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });
      const afterComplete = new Date();

      expect(completed.reconciledAt).toBeInstanceOf(Date);
      expect(completed.reconciledAt!.getTime()).toBeGreaterThanOrEqual(
        beforeComplete.getTime() - 1000,
      );
      expect(completed.reconciledAt!.getTime()).toBeLessThanOrEqual(
        afterComplete.getTime() + 1000,
      );
    });
  });

  describe('immutability after RECONCILED', () => {
    it('should prevent updates after RECONCILED', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await expect(
        repository.update(created.id, { notes: 'Changed after reconciled' }),
      ).rejects.toThrow(BusinessException);
    });

    it('should prevent deletion after RECONCILED', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await expect(repository.delete(created.id)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should prevent re-completion after RECONCILED', async () => {
      const created = await repository.create(testReconciliationData);
      await repository.complete(created.id, {
        reconciledBy: testUser.id,
        status: ReconciliationStatus.RECONCILED,
      });

      await expect(
        repository.complete(created.id, {
          reconciledBy: testUser.id,
          status: ReconciliationStatus.DISCREPANCY,
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('balance calculations', () => {
    it('should handle large balances (millions of cents)', async () => {
      // PostgreSQL INT max is 2,147,483,647, so use values within range
      const largeBalance: CreateReconciliationDto = {
        ...testReconciliationData,
        openingBalanceCents: 2000000000, // R20,000,000.00 (R20 million)
        closingBalanceCents: 2100000000, // R21,000,000.00
        calculatedBalanceCents: 2100000000,
      };

      const reconciliation = await repository.create(largeBalance);

      expect(reconciliation.openingBalanceCents).toBe(2000000000);
      expect(reconciliation.closingBalanceCents).toBe(2100000000);
      expect(reconciliation.discrepancyCents).toBe(0);
    });

    it('should handle negative balances (overdraft)', async () => {
      const overdraft: CreateReconciliationDto = {
        ...testReconciliationData,
        openingBalanceCents: -500000, // -R5,000.00
        closingBalanceCents: -300000, // -R3,000.00
        calculatedBalanceCents: -280000,
      };

      const reconciliation = await repository.create(overdraft);

      expect(reconciliation.openingBalanceCents).toBe(-500000);
      expect(reconciliation.closingBalanceCents).toBe(-300000);
      expect(reconciliation.discrepancyCents).toBe(-20000); // -300000 - (-280000)
    });
  });
});
