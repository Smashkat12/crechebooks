/**
 * Report Request Repository Tests
 * TASK-SPAY-005: SimplePay Reports Management
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ReportRequestRepository } from '../../../src/database/repositories/report-request.repository';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  ReportStatus,
  ReportType,
} from '../../../src/database/entities/report-request.entity';
import { Tenant, ReportRequest } from '@prisma/client';
import { NotFoundException } from '../../../src/shared/exceptions';

describe('ReportRequestRepository', () => {
  let repository: ReportRequestRepository;
  let prisma: PrismaService;
  let tenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportRequestRepository, PrismaService],
    }).compile();

    repository = module.get<ReportRequestRepository>(ReportRequestRepository);
    prisma = module.get<PrismaService>(PrismaService);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database in exact order - reportRequest first before tenant
    await prisma.reportRequest.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.profileMappingSync.deleteMany({});
    await prisma.servicePeriodSync.deleteMany({});
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
    await prisma.simplePayEmployeeMapping.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    tenant = await prisma.tenant.create({
      data: {
        name: 'Test Daycare',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
        phone: '+27111234567',
        email: `test${Date.now()}@daycare.co.za`,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('create', () => {
    it('should create a report request with QUEUED status', async () => {
      const result = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: { periodStart: '2024-01-01', periodEnd: '2024-01-31' },
        requestedBy: 'user-123',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(tenant.id);
      expect(result.reportType).toBe(ReportType.ETI);
      expect(result.status).toBe(ReportStatus.QUEUED);
      expect(result.requestedBy).toBe('user-123');
      expect(result.params).toEqual({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      });
    });

    it('should throw NotFoundException for invalid tenant', async () => {
      await expect(
        repository.create({
          tenantId: 'non-existent-tenant-id',
          reportType: ReportType.VARIANCE,
          params: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create report without requestedBy', async () => {
      const result = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.LEAVE_LIABILITY,
        params: {},
      });

      expect(result.requestedBy).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find report request by ID', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.TRANSACTION_HISTORY,
        params: {},
      });

      const found = await repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should throw NotFoundException for non-existent ID', async () => {
      await expect(
        repository.findByIdOrThrow('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByAsyncUuid', () => {
    it('should find report request by async UUID', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      await repository.markProcessing(created.id, 'async-uuid-123');

      const found = await repository.findByAsyncUuid('async-uuid-123');

      expect(found).toBeDefined();
      expect(found!.asyncUuid).toBe('async-uuid-123');
    });

    it('should return null for non-existent async UUID', async () => {
      const found = await repository.findByAsyncUuid('non-existent-uuid');
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    let reportRequests: ReportRequest[];

    beforeEach(async () => {
      reportRequests = [
        await repository.create({
          tenantId: tenant.id,
          reportType: ReportType.ETI,
          params: {},
        }),
        await repository.create({
          tenantId: tenant.id,
          reportType: ReportType.VARIANCE,
          params: {},
        }),
        await repository.create({
          tenantId: tenant.id,
          reportType: ReportType.LEAVE_LIABILITY,
          params: {},
        }),
      ];

      // Mark one as completed
      await repository.markCompleted(reportRequests[0].id, { result: 'test' });
    });

    it('should find all report requests for tenant', async () => {
      const found = await repository.findByTenant(tenant.id);

      expect(found).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const found = await repository.findByTenant(tenant.id, {
        status: ReportStatus.COMPLETED,
      });

      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(reportRequests[0].id);
    });

    it('should filter by report type', async () => {
      const found = await repository.findByTenant(tenant.id, {
        reportType: ReportType.VARIANCE,
      });

      expect(found).toHaveLength(1);
      expect(found[0].reportType).toBe(ReportType.VARIANCE);
    });

    it('should support pagination', async () => {
      const found = await repository.findByTenant(tenant.id, {
        page: 1,
        limit: 2,
      });

      expect(found).toHaveLength(2);
    });
  });

  describe('findPending', () => {
    it('should find pending and processing report requests', async () => {
      const request1 = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });
      await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.VARIANCE,
        params: {},
      });
      const request3 = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.LEAVE_LIABILITY,
        params: {},
      });

      // Mark one as processing, one as completed
      await repository.markProcessing(request1.id);
      await repository.markCompleted(request3.id, { result: 'test' });

      const pending = await repository.findPending(tenant.id);

      expect(pending).toHaveLength(2); // 1 QUEUED + 1 PROCESSING
    });
  });

  describe('update', () => {
    it('should update report request status', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      const updated = await repository.update(created.id, {
        status: ReportStatus.PROCESSING,
      });

      expect(updated.status).toBe(ReportStatus.PROCESSING);
    });

    it('should update async UUID', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      const updated = await repository.update(created.id, {
        asyncUuid: 'new-async-uuid',
      });

      expect(updated.asyncUuid).toBe('new-async-uuid');
    });
  });

  describe('markProcessing', () => {
    it('should mark report as processing with async UUID', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      const updated = await repository.markProcessing(
        created.id,
        'async-uuid-456',
      );

      expect(updated.status).toBe(ReportStatus.PROCESSING);
      expect(updated.asyncUuid).toBe('async-uuid-456');
    });
  });

  describe('markCompleted', () => {
    it('should mark report as completed with result data', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      const resultData = {
        totalEtiCents: 150000,
        eligibleEmployees: 5,
      };

      const updated = await repository.markCompleted(created.id, resultData);

      expect(updated.status).toBe(ReportStatus.COMPLETED);
      expect(updated.resultData).toEqual(resultData);
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('markFailed', () => {
    it('should mark report as failed with error message', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      const updated = await repository.markFailed(
        created.id,
        'API connection failed',
      );

      expect(updated.status).toBe(ReportStatus.FAILED);
      expect(updated.errorMessage).toBe('API connection failed');
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete report request', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      await expect(repository.delete('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteOldReports', () => {
    it('should delete old completed reports', async () => {
      // Create and complete an old report
      const oldReport = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });
      await repository.markCompleted(oldReport.id, { result: 'test' });

      // Manually set the requestedAt to 31 days ago
      await prisma.reportRequest.update({
        where: { id: oldReport.id },
        data: {
          requestedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });

      // Create a recent report
      await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.VARIANCE,
        params: {},
      });

      const deletedCount = await repository.deleteOldReports(tenant.id, 30);

      expect(deletedCount).toBe(1);

      const remaining = await repository.findByTenant(tenant.id);
      expect(remaining).toHaveLength(1);
    });
  });

  describe('countByTenant', () => {
    it('should count report requests', async () => {
      await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });
      await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.VARIANCE,
        params: {},
      });

      const count = await repository.countByTenant(tenant.id);

      expect(count).toBe(2);
    });

    it('should count with filters', async () => {
      const request = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });
      await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.VARIANCE,
        params: {},
      });

      await repository.markCompleted(request.id, {});

      const count = await repository.countByTenant(tenant.id, {
        status: ReportStatus.COMPLETED,
      });

      expect(count).toBe(1);
    });
  });

  describe('getStatistics', () => {
    it('should return report statistics', async () => {
      const request1 = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });
      const request2 = await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.VARIANCE,
        params: {},
      });
      await repository.create({
        tenantId: tenant.id,
        reportType: ReportType.ETI,
        params: {},
      });

      await repository.markCompleted(request1.id, {});
      await repository.markFailed(request2.id, 'Failed');

      const stats = await repository.getStatistics(tenant.id);

      expect(stats.total).toBe(3);
      expect(stats.byStatus[ReportStatus.QUEUED]).toBe(1);
      expect(stats.byStatus[ReportStatus.COMPLETED]).toBe(1);
      expect(stats.byStatus[ReportStatus.FAILED]).toBe(1);
      expect(stats.byType[ReportType.ETI]).toBe(2);
      expect(stats.byType[ReportType.VARIANCE]).toBe(1);
    });
  });
});
