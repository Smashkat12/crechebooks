/**
 * Bulk Operation Log Repository Tests
 * TASK-SPAY-007: SimplePay Bulk Operations Service
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BulkOperationLogRepository } from '../../../src/database/repositories/bulk-operation-log.repository';
import {
  BulkOperationType,
  BulkOperationStatus,
} from '../../../src/database/entities/bulk-operation-log.entity';
import { NotFoundException } from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('BulkOperationLogRepository', () => {
  let repository: BulkOperationLogRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let otherTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, BulkOperationLogRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<BulkOperationLogRepository>(
      BulkOperationLogRepository,
    );

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.profileMappingSync.deleteMany({});
    await prisma.servicePeriodSync.deleteMany({});
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

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a bulk operation log with all fields', async () => {
      const requestData = {
        entities: [
          { employeeId: 'emp-1', itemCode: 'BONUS', value: 5000 },
          { employeeId: 'emp-2', itemCode: 'BONUS', value: 3000 },
        ],
      };

      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.BONUS_DISTRIBUTION,
        totalEntities: 2,
        requestData,
        executedBy: 'admin@test.com',
      });

      expect(log).toBeDefined();
      expect(log.id).toBeDefined();
      expect(log.tenantId).toBe(tenant.id);
      expect(log.operationType).toBe(BulkOperationType.BONUS_DISTRIBUTION);
      expect(log.status).toBe(BulkOperationStatus.PENDING);
      expect(log.totalEntities).toBe(2);
      expect(log.successCount).toBe(0);
      expect(log.failureCount).toBe(0);
      expect(log.requestData).toEqual(requestData);
      expect(log.executedBy).toBe('admin@test.com');
      expect(log.startedAt).toBeDefined();
      expect(log.completedAt).toBeNull();
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      await expect(
        repository.create({
          tenantId: '00000000-0000-0000-0000-000000000000',
          operationType: BulkOperationType.SALARY_ADJUSTMENT,
          totalEntities: 1,
          requestData: {},
          executedBy: 'admin@test.com',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update bulk operation log', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.GENERIC_INPUT,
        totalEntities: 5,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const updated = await repository.update(log.id, {
        status: BulkOperationStatus.PROCESSING,
      });

      expect(updated.status).toBe(BulkOperationStatus.PROCESSING);
    });

    it('should throw NotFoundException for non-existent log', async () => {
      await expect(
        repository.update('non-existent-id', {
          status: BulkOperationStatus.PROCESSING,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markProcessing', () => {
    it('should mark operation as processing', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.DEDUCTION_SETUP,
        totalEntities: 3,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const updated = await repository.markProcessing(log.id);

      expect(updated.status).toBe(BulkOperationStatus.PROCESSING);
    });
  });

  describe('markCompleted', () => {
    it('should mark operation as completed when all succeed', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.EMPLOYEE_UPDATE,
        totalEntities: 3,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const resultData = {
        results: [
          { entityIndex: 0, entityId: 'emp-1', success: true },
          { entityIndex: 1, entityId: 'emp-2', success: true },
          { entityIndex: 2, entityId: 'emp-3', success: true },
        ],
      };

      const completed = await repository.markCompleted(log.id, {
        successCount: 3,
        failureCount: 0,
        resultData,
      });

      expect(completed.status).toBe(BulkOperationStatus.COMPLETED);
      expect(completed.successCount).toBe(3);
      expect(completed.failureCount).toBe(0);
      expect(completed.resultData).toEqual(resultData);
      expect(completed.completedAt).toBeDefined();
    });

    it('should mark operation as partial failure when some fail', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.SALARY_ADJUSTMENT,
        totalEntities: 3,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const completed = await repository.markCompleted(log.id, {
        successCount: 2,
        failureCount: 1,
        resultData: { results: [] },
        errors: [{ entityIndex: 2, errorMessage: 'Failed' }],
      });

      expect(completed.status).toBe(BulkOperationStatus.PARTIAL_FAILURE);
      expect(completed.successCount).toBe(2);
      expect(completed.failureCount).toBe(1);
    });

    it('should mark operation as failed when all fail', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.BONUS_DISTRIBUTION,
        totalEntities: 2,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const completed = await repository.markCompleted(log.id, {
        successCount: 0,
        failureCount: 2,
        resultData: { results: [] },
        errors: [
          { entityIndex: 0, errorMessage: 'Failed 1' },
          { entityIndex: 1, errorMessage: 'Failed 2' },
        ],
      });

      expect(completed.status).toBe(BulkOperationStatus.FAILED);
      expect(completed.successCount).toBe(0);
      expect(completed.failureCount).toBe(2);
    });
  });

  describe('markFailed', () => {
    it('should mark operation as failed with errors', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.GENERIC_INPUT,
        totalEntities: 5,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const errors = [
        {
          entityIndex: -1,
          errorCode: 'API_ERROR',
          errorMessage: 'Connection failed',
        },
      ];

      const failed = await repository.markFailed(log.id, errors);

      expect(failed.status).toBe(BulkOperationStatus.FAILED);
      expect(failed.failureCount).toBe(1);
      expect(failed.errors).toEqual(errors);
      expect(failed.completedAt).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find bulk operation log by id', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.SALARY_ADJUSTMENT,
        totalEntities: 1,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const found = await repository.findById(log.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(log.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should find bulk operation log by id', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.DEDUCTION_SETUP,
        totalEntities: 2,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const found = await repository.findByIdOrThrow(log.id);

      expect(found.id).toBe(log.id);
    });

    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.findByIdOrThrow('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByTenant', () => {
    beforeEach(async () => {
      // Create multiple logs
      await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.SALARY_ADJUSTMENT,
        totalEntities: 5,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const log2 = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.BONUS_DISTRIBUTION,
        totalEntities: 3,
        requestData: {},
        executedBy: 'admin@test.com',
      });
      await repository.markCompleted(log2.id, {
        successCount: 3,
        failureCount: 0,
        resultData: {},
      });

      await repository.create({
        tenantId: otherTenant.id,
        operationType: BulkOperationType.EMPLOYEE_UPDATE,
        totalEntities: 2,
        requestData: {},
        executedBy: 'admin@test.com',
      });
    });

    it('should return logs for tenant', async () => {
      const { data, total } = await repository.findByTenant(tenant.id);

      expect(data).toHaveLength(2);
      expect(total).toBe(2);
      data.forEach((log) => {
        expect(log.tenantId).toBe(tenant.id);
      });
    });

    it('should filter by operation type', async () => {
      const { data, total } = await repository.findByTenant(tenant.id, {
        operationType: BulkOperationType.SALARY_ADJUSTMENT,
      });

      expect(data).toHaveLength(1);
      expect(total).toBe(1);
      expect(data[0].operationType).toBe(BulkOperationType.SALARY_ADJUSTMENT);
    });

    it('should filter by status', async () => {
      const { data, total } = await repository.findByTenant(tenant.id, {
        status: BulkOperationStatus.COMPLETED,
      });

      expect(data).toHaveLength(1);
      expect(total).toBe(1);
      expect(data[0].status).toBe(BulkOperationStatus.COMPLETED);
    });

    it('should paginate results', async () => {
      const { data: page1 } = await repository.findByTenant(tenant.id, {
        page: 1,
        limit: 1,
      });

      const { data: page2 } = await repository.findByTenant(tenant.id, {
        page: 2,
        limit: 1,
      });

      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should order by startedAt descending', async () => {
      const { data } = await repository.findByTenant(tenant.id);

      expect(data.length).toBeGreaterThan(1);
      for (let i = 0; i < data.length - 1; i++) {
        expect(data[i].startedAt.getTime()).toBeGreaterThanOrEqual(
          data[i + 1].startedAt.getTime(),
        );
      }
    });
  });

  describe('findRecentByTenant', () => {
    it('should return recent logs for tenant', async () => {
      // Create 15 logs
      for (let i = 0; i < 15; i++) {
        await repository.create({
          tenantId: tenant.id,
          operationType: BulkOperationType.GENERIC_INPUT,
          totalEntities: i + 1,
          requestData: {},
          executedBy: 'admin@test.com',
        });
      }

      const recent = await repository.findRecentByTenant(tenant.id, 10);

      expect(recent).toHaveLength(10);
    });
  });

  describe('countByTenantAndStatus', () => {
    beforeEach(async () => {
      // Create logs with different statuses
      await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.GENERIC_INPUT,
        totalEntities: 1,
        requestData: {},
        executedBy: 'admin@test.com',
      }); // PENDING

      const log2 = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.GENERIC_INPUT,
        totalEntities: 2,
        requestData: {},
        executedBy: 'admin@test.com',
      });
      await repository.markCompleted(log2.id, {
        successCount: 2,
        failureCount: 0,
        resultData: {},
      }); // COMPLETED

      const log3 = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.GENERIC_INPUT,
        totalEntities: 3,
        requestData: {},
        executedBy: 'admin@test.com',
      });
      await repository.markFailed(log3.id, []); // FAILED
    });

    it('should count logs by status', async () => {
      const counts = await repository.countByTenantAndStatus(tenant.id);

      expect(counts[BulkOperationStatus.PENDING]).toBe(1);
      expect(counts[BulkOperationStatus.COMPLETED]).toBe(1);
      expect(counts[BulkOperationStatus.FAILED]).toBe(1);
      expect(counts[BulkOperationStatus.PROCESSING]).toBe(0);
      expect(counts[BulkOperationStatus.PARTIAL_FAILURE]).toBe(0);
    });
  });

  describe('getStatsByTenant', () => {
    beforeEach(async () => {
      const log1 = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.SALARY_ADJUSTMENT,
        totalEntities: 10,
        requestData: {},
        executedBy: 'admin@test.com',
      });
      await repository.markCompleted(log1.id, {
        successCount: 8,
        failureCount: 2,
        resultData: {},
      });

      const log2 = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.BONUS_DISTRIBUTION,
        totalEntities: 5,
        requestData: {},
        executedBy: 'admin@test.com',
      });
      await repository.markCompleted(log2.id, {
        successCount: 5,
        failureCount: 0,
        resultData: {},
      });
    });

    it('should return statistics for tenant', async () => {
      const stats = await repository.getStatsByTenant(tenant.id);

      expect(stats.totalOperations).toBe(2);
      expect(stats.totalEntitiesProcessed).toBe(15);
      expect(stats.totalSuccessful).toBe(13);
      expect(stats.totalFailed).toBe(2);
      expect(stats.byOperationType[BulkOperationType.SALARY_ADJUSTMENT]).toBe(
        1,
      );
      expect(stats.byOperationType[BulkOperationType.BONUS_DISTRIBUTION]).toBe(
        1,
      );
      expect(stats.byOperationType[BulkOperationType.DEDUCTION_SETUP]).toBe(0);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete completed logs older than cutoff', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.GENERIC_INPUT,
        totalEntities: 1,
        requestData: {},
        executedBy: 'admin@test.com',
      });
      await repository.markCompleted(log.id, {
        successCount: 1,
        failureCount: 0,
        resultData: {},
      });

      // Set startedAt to 2 days ago by updating directly
      await prisma.bulkOperationLog.update({
        where: { id: log.id },
        data: { startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      });

      const deleted = await repository.deleteOlderThan(
        tenant.id,
        new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      );

      expect(deleted).toBe(1);

      const found = await repository.findById(log.id);
      expect(found).toBeNull();
    });

    it('should not delete pending logs', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.GENERIC_INPUT,
        totalEntities: 1,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      // Set startedAt to 2 days ago
      await prisma.bulkOperationLog.update({
        where: { id: log.id },
        data: { startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      });

      const deleted = await repository.deleteOlderThan(
        tenant.id,
        new Date(Date.now() - 24 * 60 * 60 * 1000),
      );

      expect(deleted).toBe(0);

      const found = await repository.findById(log.id);
      expect(found).toBeDefined();
    });
  });

  describe('tenant isolation', () => {
    it('should not return logs from other tenants', async () => {
      await repository.create({
        tenantId: tenant.id,
        operationType: BulkOperationType.SALARY_ADJUSTMENT,
        totalEntities: 1,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      await repository.create({
        tenantId: otherTenant.id,
        operationType: BulkOperationType.BONUS_DISTRIBUTION,
        totalEntities: 2,
        requestData: {},
        executedBy: 'admin@test.com',
      });

      const { data: tenant1Logs } = await repository.findByTenant(tenant.id);
      const { data: tenant2Logs } = await repository.findByTenant(
        otherTenant.id,
      );

      expect(tenant1Logs).toHaveLength(1);
      expect(tenant2Logs).toHaveLength(1);
      expect(tenant1Logs[0].tenantId).toBe(tenant.id);
      expect(tenant2Logs[0].tenantId).toBe(otherTenant.id);
    });
  });
});
