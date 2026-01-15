/**
 * Employee Setup Log Repository Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { EmployeeSetupLogRepository } from '../../../src/database/repositories/employee-setup-log.repository';
import {
  SetupStatus,
  PipelineStep,
  SetupStepStatus,
} from '../../../src/database/entities/employee-setup-log.entity';
import { Tenant, Staff } from '@prisma/client';

describe('EmployeeSetupLogRepository', () => {
  let repository: EmployeeSetupLogRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let staff: Staff;
  let staff2: Staff;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, EmployeeSetupLogRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<EmployeeSetupLogRepository>(
      EmployeeSetupLogRepository,
    );

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
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
    tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@creche.co.za`,
      },
    });

    // Create test staff
    staff = await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        employeeNumber: 'EMP-001',
        firstName: 'Thabo',
        lastName: 'Modise',
        idNumber: '8501015800084',
        dateOfBirth: new Date('1985-01-01'),
        startDate: new Date('2024-01-15'),
        employmentType: 'PERMANENT',
        payFrequency: 'MONTHLY',
        basicSalaryCents: 1500000,
      },
    });

    staff2 = await prisma.staff.create({
      data: {
        tenantId: tenant.id,
        employeeNumber: 'EMP-002',
        firstName: 'Zanele',
        lastName: 'Nkosi',
        idNumber: '9001015800084',
        dateOfBirth: new Date('1990-01-01'),
        startDate: new Date('2024-02-01'),
        employmentType: 'CONTRACT',
        payFrequency: 'MONTHLY',
        basicSalaryCents: 1200000,
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
    it('should create a setup log with default values', async () => {
      const result = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.tenantId).toBe(tenant.id);
      expect(result.staffId).toBe(staff.id);
      expect(result.triggeredBy).toBe('system');
      expect(result.status).toBe(SetupStatus.PENDING);
      expect(result.profileAssigned).toBeNull();
      expect(result.leaveInitialized).toBe(false);
      expect(result.taxConfigured).toBe(false);
      expect(result.calculationsAdded).toBe(0);
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeNull();
    });

    it('should create setup log with custom status', async () => {
      const result = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'admin',
        status: SetupStatus.IN_PROGRESS,
      });

      expect(result.status).toBe(SetupStatus.IN_PROGRESS);
    });

    it('should create setup log with simplePayEmployeeId', async () => {
      const result = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        simplePayEmployeeId: 'sp-123',
      });

      expect(result.simplePayEmployeeId).toBe('sp-123');
    });

    it('should store initial setup steps as JSON', async () => {
      const result = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      expect(result.setupSteps).toBeDefined();
      expect(Array.isArray(result.setupSteps)).toBe(true);
    });
  });

  describe('findById', () => {
    it('should find setup log by id with matching tenant', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const found = await repository.findById(created.id, tenant.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.staffId).toBe(staff.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('non-existent-id', tenant.id);
      expect(found).toBeNull();
    });

    it('should return null for valid ID but wrong tenant (tenant isolation)', async () => {
      const created = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27217654321',
          email: `other${Date.now()}@othercreche.co.za`,
        },
      });

      // Try to access setup log with different tenant ID
      const found = await repository.findById(created.id, otherTenant.id);

      expect(found).toBeNull();
    });
  });

  describe('findByStaffId', () => {
    it('should find setup log by staff id', async () => {
      await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const found = await repository.findByStaffId(staff.id);

      expect(found).toBeDefined();
      expect(found?.staffId).toBe(staff.id);
    });

    it('should return null for non-existent staff id', async () => {
      const found = await repository.findByStaffId('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByTenant', () => {
    beforeEach(async () => {
      await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        status: SetupStatus.COMPLETED,
      });

      await repository.create({
        tenantId: tenant.id,
        staffId: staff2.id,
        triggeredBy: 'admin',
        status: SetupStatus.PENDING,
      });
    });

    it('should return all setup logs for tenant', async () => {
      const result = await repository.findByTenant(tenant.id);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      const result = await repository.findByTenant(tenant.id, {
        status: SetupStatus.COMPLETED,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(SetupStatus.COMPLETED);
    });

    it('should filter by triggeredBy', async () => {
      const result = await repository.findByTenant(tenant.id, {
        triggeredBy: 'admin',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].triggeredBy).toBe('admin');
    });

    it('should support pagination', async () => {
      const result = await repository.findByTenant(tenant.id, {
        skip: 0,
        take: 1,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe('findPendingSetups', () => {
    it('should find pending and in-progress setups', async () => {
      await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
        status: SetupStatus.PENDING,
      });

      const pending = await repository.findPendingSetups(tenant.id);

      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe(SetupStatus.PENDING);
    });

    it('should not include completed setups', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      await repository.markCompleted(log.id, {});

      const pending = await repository.findPendingSetups(tenant.id);

      expect(pending).toHaveLength(0);
    });
  });

  describe('findFailedSetups', () => {
    it('should find failed, partial, and rolled back setups', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      await repository.markFailed(log.id, {
        errors: [
          {
            step: PipelineStep.CREATE_EMPLOYEE,
            code: 'ERROR',
            message: 'Failed',
            details: {},
            timestamp: new Date().toISOString(),
          },
        ],
      });

      const failed = await repository.findFailedSetups(tenant.id);

      expect(failed).toHaveLength(1);
      expect(failed[0].status).toBe(SetupStatus.FAILED);
    });
  });

  describe('markInProgress', () => {
    it('should update status to IN_PROGRESS', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const updated = await repository.markInProgress(log.id);

      expect(updated.status).toBe(SetupStatus.IN_PROGRESS);
    });
  });

  describe('markCompleted', () => {
    it('should mark setup as completed with all data', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const updated = await repository.markCompleted(log.id, {
        simplePayEmployeeId: 'sp-456',
        profileAssigned: 'Teacher',
        leaveInitialized: true,
        taxConfigured: true,
        calculationsAdded: 3,
      });

      expect(updated.status).toBe(SetupStatus.COMPLETED);
      expect(updated.simplePayEmployeeId).toBe('sp-456');
      expect(updated.profileAssigned).toBe('Teacher');
      expect(updated.leaveInitialized).toBe(true);
      expect(updated.taxConfigured).toBe(true);
      expect(updated.calculationsAdded).toBe(3);
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('markFailed', () => {
    it('should mark setup as failed', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const updated = await repository.markFailed(log.id, {
        errors: [
          {
            step: PipelineStep.CREATE_EMPLOYEE,
            code: 'API_ERROR',
            message: 'Connection failed',
            details: {},
            timestamp: new Date().toISOString(),
          },
        ],
      });

      expect(updated.status).toBe(SetupStatus.FAILED);
      expect(updated.completedAt).toBeDefined();
    });

    it('should mark as PARTIAL if some steps completed', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const updated = await repository.markFailed(log.id, {
        setupSteps: [
          {
            step: PipelineStep.CREATE_EMPLOYEE,
            status: SetupStepStatus.COMPLETED,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 100,
            error: null,
            details: {},
            canRollback: true,
            rollbackData: null,
          },
          {
            step: PipelineStep.ASSIGN_PROFILE,
            status: SetupStepStatus.FAILED,
            startedAt: new Date().toISOString(),
            completedAt: null,
            durationMs: null,
            error: 'Failed',
            details: {},
            canRollback: false,
            rollbackData: null,
          },
        ],
        errors: [],
      });

      expect(updated.status).toBe(SetupStatus.PARTIAL);
    });
  });

  describe('markRolledBack', () => {
    it('should mark setup as rolled back', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const updated = await repository.markRolledBack(
        log.id,
        [],
        [
          {
            step: PipelineStep.CREATE_EMPLOYEE,
            code: 'ROLLBACK',
            message: 'Rolled back employee creation',
            details: {},
            timestamp: new Date().toISOString(),
          },
        ],
      );

      expect(updated.status).toBe(SetupStatus.ROLLED_BACK);
    });
  });

  describe('update', () => {
    it('should update specific fields', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const updated = await repository.update(log.id, {
        profileAssigned: 'Principal',
        leaveInitialized: true,
      });

      expect(updated.profileAssigned).toBe('Principal');
      expect(updated.leaveInitialized).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete setup log with correct tenant', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      await repository.delete(log.id, tenant.id);

      const found = await repository.findById(log.id, tenant.id);
      expect(found).toBeNull();
    });

    it('TC-001: should throw NotFoundException when deleting with wrong tenant (cross-tenant deletion blocked)', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche Delete',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27217654321',
          email: `other-delete-${Date.now()}@othercreche.co.za`,
        },
      });

      // Attempt cross-tenant deletion - should fail
      await expect(repository.delete(log.id, otherTenant.id)).rejects.toThrow();

      // Verify original record still exists
      const found = await repository.findById(log.id, tenant.id);
      expect(found).not.toBeNull();
    });

    it('TC-003: should throw NotFoundException for non-existent ID', async () => {
      await expect(
        repository.delete('non-existent-id', tenant.id),
      ).rejects.toThrow();
    });

    it('TC-004: error message should not leak tenant information', async () => {
      const log = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Leak Test Creche',
          addressLine1: '789 Test Street',
          city: 'Durban',
          province: 'KwaZulu-Natal',
          postalCode: '4001',
          phone: '+27317654321',
          email: `leak-test-${Date.now()}@creche.co.za`,
        },
      });

      try {
        await repository.delete(log.id, otherTenant.id);
        fail('Expected NotFoundException to be thrown');
      } catch (error) {
        // Error message should be generic "not found" - not reveal tenant ownership
        expect(error.message).not.toContain(tenant.id);
        expect(error.message).not.toContain(otherTenant.id);
        expect(error.message).not.toContain('wrong tenant');
        expect(error.message).not.toContain('different tenant');
      }
    });
  });

  describe('deleteByStaffId', () => {
    it('should delete setup log by staff id with correct tenant', async () => {
      await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      await repository.deleteByStaffId(staff.id, tenant.id);

      const found = await repository.findByStaffId(staff.id);
      expect(found).toBeNull();
    });

    it('should not delete setup logs from other tenants', async () => {
      await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Staff Delete Creche',
          addressLine1: '999 Test Street',
          city: 'Pretoria',
          province: 'Gauteng',
          postalCode: '0001',
          phone: '+27127654321',
          email: `other-staff-delete-${Date.now()}@creche.co.za`,
        },
      });

      // Try to delete with wrong tenant - should not delete the record
      await repository.deleteByStaffId(staff.id, otherTenant.id);

      // Original record should still exist
      const found = await repository.findByStaffId(staff.id);
      expect(found).not.toBeNull();
    });
  });

  describe('existsForStaff', () => {
    it('should return true if setup log exists for staff', async () => {
      await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });

      const exists = await repository.existsForStaff(staff.id);
      expect(exists).toBe(true);
    });

    it('should return false if no setup log exists', async () => {
      const exists = await repository.existsForStaff(staff.id);
      expect(exists).toBe(false);
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      // Create logs with different statuses
      const log1 = await repository.create({
        tenantId: tenant.id,
        staffId: staff.id,
        triggeredBy: 'system',
      });
      await repository.markCompleted(log1.id, {});

      await repository.create({
        tenantId: tenant.id,
        staffId: staff2.id,
        triggeredBy: 'system',
        status: SetupStatus.PENDING,
      });
    });

    it('should return correct statistics', async () => {
      const stats = await repository.getStatistics(tenant.id);

      expect(stats.total).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.inProgress).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.partial).toBe(0);
      expect(stats.rolledBack).toBe(0);
    });
  });
});
