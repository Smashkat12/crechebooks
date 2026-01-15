/**
 * Pay Run Sync Repository Tests
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PayRunSyncRepository } from '../../../src/database/repositories/payrun-sync.repository';
import { CreatePayRunSyncDto } from '../../../src/database/dto/payrun.dto';
import { PayRunSyncStatus } from '../../../src/database/entities/payrun-sync.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('PayRunSyncRepository', () => {
  let repository: PayRunSyncRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let otherTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, PayRunSyncRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<PayRunSyncRepository>(PayRunSyncRepository);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.payRunSync.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
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

    // Create test tenants
    tenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Daycare',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    otherTenant = await prisma.tenant.create({
      data: {
        name: 'Bright Beginnings',
        addressLine1: '456 Other Road',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27217654321',
        email: `other${Date.now()}@brightbeginnings.co.za`,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  // Test data representing South African payroll context
  const createTestPayRunSyncData = (): CreatePayRunSyncDto => ({
    tenantId: '', // Will be set in tests
    simplePayPayRunId: '12345',
    waveId: 1,
    waveName: 'Monthly',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-31'),
    payDate: new Date('2026-01-25'),
    status: 'finalized',
    employeeCount: 15,
    totalGrossCents: 25000000, // R250,000
    totalNetCents: 18000000, // R180,000
    totalPayeCents: 4500000, // R45,000
    totalUifEmployeeCents: 250000, // R2,500
    totalUifEmployerCents: 250000, // R2,500
    totalSdlCents: 250000, // R2,500
    totalEtiCents: 0,
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create pay run sync with all fields', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const payRunSync = await repository.create(data);

      expect(payRunSync).toBeDefined();
      expect(payRunSync.id).toBeDefined();
      expect(payRunSync.tenantId).toBe(tenant.id);
      expect(payRunSync.simplePayPayRunId).toBe('12345');
      expect(payRunSync.waveId).toBe(1);
      expect(payRunSync.waveName).toBe('Monthly');
      expect(payRunSync.periodStart).toEqual(new Date('2026-01-01'));
      expect(payRunSync.periodEnd).toEqual(new Date('2026-01-31'));
      expect(payRunSync.payDate).toEqual(new Date('2026-01-25'));
      expect(payRunSync.status).toBe('finalized');
      expect(payRunSync.employeeCount).toBe(15);
      expect(payRunSync.totalGrossCents).toBe(25000000);
      expect(payRunSync.totalNetCents).toBe(18000000);
      expect(payRunSync.totalPayeCents).toBe(4500000);
      expect(payRunSync.totalUifEmployeeCents).toBe(250000);
      expect(payRunSync.totalUifEmployerCents).toBe(250000);
      expect(payRunSync.totalSdlCents).toBe(250000);
      expect(payRunSync.totalEtiCents).toBe(0);
      expect(payRunSync.syncStatus).toBe(PayRunSyncStatus.PENDING);
      expect(payRunSync.xeroJournalId).toBeNull();
      expect(payRunSync.xeroSyncedAt).toBeNull();
      expect(payRunSync.xeroSyncError).toBeNull();
      expect(payRunSync.createdAt).toBeDefined();
      expect(payRunSync.updatedAt).toBeDefined();
    });

    it('should auto-generate UUID', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const payRunSync = await repository.create(data);

      expect(payRunSync.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should default syncStatus to PENDING', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const payRunSync = await repository.create(data);

      expect(payRunSync.syncStatus).toBe(PayRunSyncStatus.PENDING);
    });

    it('should throw ConflictException for duplicate simplePayPayRunId', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      await repository.create(data);

      await expect(repository.create(data)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const data = {
        ...createTestPayRunSyncData(),
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });

    it('should allow same simplePayPayRunId for different tenants', async () => {
      const data1 = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const data2 = { ...createTestPayRunSyncData(), tenantId: otherTenant.id };

      const sync1 = await repository.create(data1);
      const sync2 = await repository.create(data2);

      expect(sync1.id).not.toBe(sync2.id);
      expect(sync1.tenantId).toBe(tenant.id);
      expect(sync2.tenantId).toBe(otherTenant.id);
    });
  });

  describe('findById', () => {
    it('should find pay run sync by id with matching tenant', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      const found = await repository.findById(created.id, tenant.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.simplePayPayRunId).toBe('12345');
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
        tenant.id,
      );

      expect(found).toBeNull();
    });

    it('should return null for valid ID but wrong tenant (tenant isolation)', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      // Try to access pay run sync with different tenant ID
      const found = await repository.findById(created.id, otherTenant.id);

      expect(found).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should find pay run sync by id with matching tenant', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      const found = await repository.findByIdOrThrow(created.id, tenant.id);

      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.findByIdOrThrow(
          '00000000-0000-0000-0000-000000000000',
          tenant.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for valid ID but wrong tenant (tenant isolation)', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      await expect(
        repository.findByIdOrThrow(created.id, otherTenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySimplePayId', () => {
    it('should find pay run sync by SimplePay ID', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      const found = await repository.findBySimplePayId(tenant.id, '12345');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.simplePayPayRunId).toBe('12345');
    });

    it('should return null for non-existent SimplePay ID', async () => {
      const found = await repository.findBySimplePayId(
        tenant.id,
        'nonexistent',
      );

      expect(found).toBeNull();
    });

    it('should not find pay run from different tenant', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      await repository.create(data);

      const found = await repository.findBySimplePayId(otherTenant.id, '12345');

      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    beforeEach(async () => {
      // Create multiple pay run syncs
      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-001',
        waveId: 1,
        waveName: 'Monthly',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
      });

      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-002',
        waveId: 2,
        waveName: 'Weekly',
        periodStart: new Date('2026-02-01'),
        periodEnd: new Date('2026-02-28'),
        status: 'draft',
      });

      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: otherTenant.id,
        simplePayPayRunId: 'pr-003',
      });
    });

    it('should return all pay run syncs for tenant', async () => {
      const syncs = await repository.findByTenant(tenant.id);

      expect(syncs).toHaveLength(2);
    });

    it('should filter by waveId', async () => {
      const syncs = await repository.findByTenant(tenant.id, { waveId: 1 });

      expect(syncs).toHaveLength(1);
      expect(syncs[0].waveName).toBe('Monthly');
    });

    it('should filter by status', async () => {
      const syncs = await repository.findByTenant(tenant.id, {
        status: 'draft',
      });

      expect(syncs).toHaveLength(1);
      expect(syncs[0].status).toBe('draft');
    });

    it('should order by periodStart descending', async () => {
      const syncs = await repository.findByTenant(tenant.id);

      expect(syncs).toHaveLength(2);
      expect(syncs[0].periodStart > syncs[1].periodStart).toBe(true);
    });

    it('should paginate results', async () => {
      const firstPage = await repository.findByTenant(tenant.id, {
        page: 1,
        limit: 1,
      });

      expect(firstPage).toHaveLength(1);

      const secondPage = await repository.findByTenant(tenant.id, {
        page: 2,
        limit: 1,
      });

      expect(secondPage).toHaveLength(1);
      expect(secondPage[0].id).not.toBe(firstPage[0].id);
    });
  });

  describe('findByPeriod', () => {
    beforeEach(async () => {
      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-jan',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
      });

      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-feb',
        periodStart: new Date('2026-02-01'),
        periodEnd: new Date('2026-02-28'),
      });

      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-mar',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
      });
    });

    it('should find pay runs within period', async () => {
      const syncs = await repository.findByPeriod(
        tenant.id,
        new Date('2026-01-01'),
        new Date('2026-02-28'),
      );

      expect(syncs).toHaveLength(2);
    });
  });

  describe('updateSyncStatus', () => {
    it('should update sync status', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      const updated = await repository.updateSyncStatus(
        created.id,
        PayRunSyncStatus.SYNCED,
      );

      expect(updated.syncStatus).toBe(PayRunSyncStatus.SYNCED);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.updateSyncStatus(
          '00000000-0000-0000-0000-000000000000',
          PayRunSyncStatus.SYNCED,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markXeroPosted', () => {
    it('should mark pay run as posted to Xero', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);
      await repository.updateSyncStatus(created.id, PayRunSyncStatus.SYNCED);

      const posted = await repository.markXeroPosted(created.id, 'MJ-12345');

      expect(posted.syncStatus).toBe(PayRunSyncStatus.XERO_POSTED);
      expect(posted.xeroJournalId).toBe('MJ-12345');
      expect(posted.xeroSyncedAt).toBeDefined();
      expect(posted.xeroSyncedAt).toBeInstanceOf(Date);
      expect(posted.xeroSyncError).toBeNull();
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.markXeroPosted(
          '00000000-0000-0000-0000-000000000000',
          'MJ-12345',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markXeroFailed', () => {
    it('should mark pay run as failed to post to Xero', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);
      await repository.updateSyncStatus(created.id, PayRunSyncStatus.SYNCED);

      const failed = await repository.markXeroFailed(
        created.id,
        'Invalid account code',
      );

      expect(failed.syncStatus).toBe(PayRunSyncStatus.XERO_FAILED);
      expect(failed.xeroSyncError).toBe('Invalid account code');
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.markXeroFailed(
          '00000000-0000-0000-0000-000000000000',
          'Error',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveAccountingData', () => {
    it('should save accounting data and update status to SYNCED', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      const accountingData = {
        entries: [
          {
            account_code: '6100',
            description: 'Salaries',
            debit: 250000,
            credit: 0,
          },
          {
            account_code: '2100',
            description: 'Net Pay',
            debit: 0,
            credit: 180000,
          },
        ],
      };

      const updated = await repository.saveAccountingData(
        created.id,
        accountingData,
      );

      expect(updated.syncStatus).toBe(PayRunSyncStatus.SYNCED);
      expect(updated.accountingData).toEqual(accountingData);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.saveAccountingData(
          '00000000-0000-0000-0000-000000000000',
          {},
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findPendingXeroSync', () => {
    beforeEach(async () => {
      // SYNCED but not posted to Xero
      const sync1 = await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-pending-1',
      });
      await repository.updateSyncStatus(sync1.id, PayRunSyncStatus.SYNCED);

      // Already posted to Xero
      const sync2 = await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-posted',
      });
      await repository.updateSyncStatus(sync2.id, PayRunSyncStatus.SYNCED);
      await repository.markXeroPosted(sync2.id, 'MJ-001');

      // Still PENDING
      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-not-synced',
      });
    });

    it('should return only synced pay runs without Xero journal', async () => {
      const pending = await repository.findPendingXeroSync(tenant.id);

      expect(pending).toHaveLength(1);
      expect(pending[0].simplePayPayRunId).toBe('pr-pending-1');
      expect(pending[0].syncStatus).toBe(PayRunSyncStatus.SYNCED);
      expect(pending[0].xeroJournalId).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing pay run sync with matching tenant', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      await repository.delete(created.id, tenant.id);

      const found = await repository.findById(created.id, tenant.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent pay run sync', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for pay run posted to Xero', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);
      await repository.updateSyncStatus(created.id, PayRunSyncStatus.SYNCED);
      await repository.markXeroPosted(created.id, 'MJ-12345');

      await expect(repository.delete(created.id, tenant.id)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for valid ID but wrong tenant (tenant isolation)', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      await expect(
        repository.delete(created.id, otherTenant.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsert', () => {
    it('should create new pay run sync if not exists', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };

      const result = await repository.upsert(data);

      expect(result.id).toBeDefined();
      expect(result.simplePayPayRunId).toBe('12345');
    });

    it('should update existing pay run sync', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };
      const created = await repository.create(data);

      const updatedData = {
        ...data,
        employeeCount: 20,
        totalGrossCents: 30000000,
      };

      const result = await repository.upsert(updatedData);

      expect(result.id).toBe(created.id);
      expect(result.employeeCount).toBe(20);
      expect(result.totalGrossCents).toBe(30000000);
    });
  });

  describe('countByTenant', () => {
    beforeEach(async () => {
      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-001',
        status: 'finalized',
      });

      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-002',
        status: 'draft',
      });

      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: otherTenant.id,
        simplePayPayRunId: 'pr-003',
      });
    });

    it('should count all pay run syncs for tenant', async () => {
      const count = await repository.countByTenant(tenant.id);

      expect(count).toBe(2);
    });

    it('should count filtered by status', async () => {
      const draftCount = await repository.countByTenant(tenant.id, {
        status: 'draft',
      });

      expect(draftCount).toBe(1);
    });
  });

  describe('tenant isolation', () => {
    it('should not return pay run syncs from other tenants', async () => {
      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-tenant-1',
      });

      await repository.create({
        ...createTestPayRunSyncData(),
        tenantId: otherTenant.id,
        simplePayPayRunId: 'pr-tenant-2',
      });

      const tenant1Syncs = await repository.findByTenant(tenant.id);
      const tenant2Syncs = await repository.findByTenant(otherTenant.id);

      expect(tenant1Syncs).toHaveLength(1);
      expect(tenant2Syncs).toHaveLength(1);
      expect(tenant1Syncs[0].tenantId).toBe(tenant.id);
      expect(tenant2Syncs[0].tenantId).toBe(otherTenant.id);
    });
  });

  describe('all PayRunSyncStatus values', () => {
    it('should handle PENDING, SYNCED, XERO_POSTED, XERO_FAILED', async () => {
      const data = { ...createTestPayRunSyncData(), tenantId: tenant.id };

      // PENDING (default)
      const pending = await repository.create(data);
      expect(pending.syncStatus).toBe(PayRunSyncStatus.PENDING);

      // SYNCED
      const synced = await repository.updateSyncStatus(
        pending.id,
        PayRunSyncStatus.SYNCED,
      );
      expect(synced.syncStatus).toBe(PayRunSyncStatus.SYNCED);

      // XERO_POSTED
      const posted = await repository.markXeroPosted(pending.id, 'MJ-123');
      expect(posted.syncStatus).toBe(PayRunSyncStatus.XERO_POSTED);

      // Create another for XERO_FAILED
      const data2 = {
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        simplePayPayRunId: 'pr-fail',
      };
      const toFail = await repository.create(data2);
      await repository.updateSyncStatus(toFail.id, PayRunSyncStatus.SYNCED);
      const failed = await repository.markXeroFailed(
        toFail.id,
        'Connection error',
      );
      expect(failed.syncStatus).toBe(PayRunSyncStatus.XERO_FAILED);
    });
  });

  describe('monetary values handling', () => {
    it('should store monetary values in cents correctly', async () => {
      const data = {
        ...createTestPayRunSyncData(),
        tenantId: tenant.id,
        totalGrossCents: 25000000, // R250,000.00
        totalNetCents: 18000000, // R180,000.00
        totalPayeCents: 4500000, // R45,000.00
        totalUifEmployeeCents: 265600, // R2,656.00 (using max UIF)
        totalUifEmployerCents: 265600, // R2,656.00
        totalSdlCents: 250000, // R2,500.00 (1% of gross)
        totalEtiCents: 100000, // R1,000.00
      };

      const created = await repository.create(data);

      expect(created.totalGrossCents).toBe(25000000);
      expect(created.totalNetCents).toBe(18000000);
      expect(created.totalPayeCents).toBe(4500000);
      expect(created.totalUifEmployeeCents).toBe(265600);
      expect(created.totalUifEmployerCents).toBe(265600);
      expect(created.totalSdlCents).toBe(250000);
      expect(created.totalEtiCents).toBe(100000);
    });
  });
});
