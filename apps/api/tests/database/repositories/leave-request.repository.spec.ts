/**
 * Leave Request Repository Tests
 * TASK-SPAY-001: SimplePay Leave Management
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { LeaveRequestRepository } from '../../../src/database/repositories/leave-request.repository';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { CreateLeaveRequestDto } from '../../../src/database/dto/leave.dto';
import { LeaveRequestStatus } from '../../../src/database/entities/leave-request.entity';
import { EmploymentType } from '../../../src/database/entities/staff.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant, Staff } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

describe('LeaveRequestRepository', () => {
  let repository: LeaveRequestRepository;
  let staffRepository: StaffRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let otherTenant: Tenant;
  let staff: Staff;
  let otherStaff: Staff;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, LeaveRequestRepository, StaffRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<LeaveRequestRepository>(LeaveRequestRepository);
    staffRepository = module.get<StaffRepository>(StaffRepository);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

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

    // Create test staff
    staff = await staffRepository.create({
      tenantId: tenant.id,
      employeeNumber: 'EMP-001',
      firstName: 'Thabo',
      lastName: 'Modise',
      idNumber: '8501015800084',
      email: 'thabo@littlestars.co.za',
      phone: '+27821234567',
      dateOfBirth: new Date('1985-01-01'),
      startDate: new Date('2024-01-15'),
      employmentType: EmploymentType.PERMANENT,
      basicSalaryCents: 1500000,
    });

    otherStaff = await staffRepository.create({
      tenantId: tenant.id,
      employeeNumber: 'EMP-002',
      firstName: 'Zanele',
      lastName: 'Nkosi',
      idNumber: '9203126543087',
      email: 'zanele@littlestars.co.za',
      phone: '+27829876543',
      dateOfBirth: new Date('1992-03-12'),
      startDate: new Date('2024-02-01'),
      employmentType: EmploymentType.PERMANENT,
      basicSalaryCents: 1200000,
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const createTestLeaveRequestData = (): CreateLeaveRequestDto => ({
    tenantId: tenant.id,
    staffId: staff.id,
    leaveTypeId: 1,
    leaveTypeName: 'Annual Leave',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-05'),
    totalDays: 5,
    totalHours: 40,
    reason: 'Family vacation',
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create leave request with all fields', async () => {
      const data = createTestLeaveRequestData();
      const leaveRequest = await repository.create(data);

      expect(leaveRequest).toBeDefined();
      expect(leaveRequest.id).toBeDefined();
      expect(leaveRequest.tenantId).toBe(tenant.id);
      expect(leaveRequest.staffId).toBe(staff.id);
      expect(leaveRequest.leaveTypeId).toBe(1);
      expect(leaveRequest.leaveTypeName).toBe('Annual Leave');
      expect(leaveRequest.startDate).toEqual(new Date('2024-06-01'));
      expect(leaveRequest.endDate).toEqual(new Date('2024-06-05'));
      expect(Number(leaveRequest.totalDays)).toBe(5);
      expect(Number(leaveRequest.totalHours)).toBe(40);
      expect(leaveRequest.reason).toBe('Family vacation');
      expect(leaveRequest.status).toBe(LeaveRequestStatus.PENDING);
      expect(leaveRequest.simplePaySynced).toBe(false);
      expect(leaveRequest.simplePayIds).toEqual([]);
      expect(leaveRequest.createdAt).toBeDefined();
      expect(leaveRequest.updatedAt).toBeDefined();
    });

    it('should create leave request without optional reason', async () => {
      const data = createTestLeaveRequestData();
      delete (data as any).reason;
      const leaveRequest = await repository.create(data);

      expect(leaveRequest).toBeDefined();
      expect(leaveRequest.reason).toBeNull();
    });

    it('should auto-generate UUID', async () => {
      const data = createTestLeaveRequestData();
      const leaveRequest = await repository.create(data);

      expect(leaveRequest.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should default status to PENDING', async () => {
      const data = createTestLeaveRequestData();
      const leaveRequest = await repository.create(data);

      expect(leaveRequest.status).toBe(LeaveRequestStatus.PENDING);
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      const data = createTestLeaveRequestData();
      data.staffId = '00000000-0000-0000-0000-000000000000';

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const data = createTestLeaveRequestData();
      data.tenantId = '00000000-0000-0000-0000-000000000000';

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });

    it('should handle decimal totalDays', async () => {
      const data = createTestLeaveRequestData();
      data.totalDays = 2.5;
      data.totalHours = 20;
      const leaveRequest = await repository.create(data);

      expect(Number(leaveRequest.totalDays)).toBe(2.5);
      expect(Number(leaveRequest.totalHours)).toBe(20);
    });
  });

  describe('findById', () => {
    it('should find leave request by id', async () => {
      const data = createTestLeaveRequestData();
      const created = await repository.create(data);

      const found = await repository.findById(created.id, tenant.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.leaveTypeName).toBe('Annual Leave');
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
        tenant.id,
      );

      expect(found).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should find leave request by id', async () => {
      const data = createTestLeaveRequestData();
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
  });

  describe('findByStaff', () => {
    beforeEach(async () => {
      // Create multiple leave requests for staff
      await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
      });

      await repository.create({
        ...createTestLeaveRequestData(),
        leaveTypeId: 2,
        leaveTypeName: 'Sick Leave',
        startDate: new Date('2024-07-10'),
        endDate: new Date('2024-07-12'),
        totalDays: 3,
        totalHours: 24,
      });

      // Create leave request for other staff
      await repository.create({
        tenantId: tenant.id,
        staffId: otherStaff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-05'),
        totalDays: 5,
        totalHours: 40,
      });
    });

    it('should return all leave requests for staff', async () => {
      const requests = await repository.findByStaff(staff.id);

      expect(requests).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const pending = await repository.findByStaff(staff.id, {
        status: LeaveRequestStatus.PENDING,
      });

      expect(pending).toHaveLength(2);
      expect(
        pending.every((r) => r.status === LeaveRequestStatus.PENDING),
      ).toBe(true);
    });

    it('should filter by leaveTypeId', async () => {
      const sickLeave = await repository.findByStaff(staff.id, {
        leaveTypeId: 2,
      });

      expect(sickLeave).toHaveLength(1);
      expect(sickLeave[0].leaveTypeName).toBe('Sick Leave');
    });

    it('should order by startDate descending', async () => {
      const requests = await repository.findByStaff(staff.id);

      expect(requests).toHaveLength(2);
      expect(requests[0].startDate > requests[1].startDate).toBe(true);
    });

    it('should paginate results', async () => {
      const firstPage = await repository.findByStaff(staff.id, {
        page: 1,
        limit: 1,
      });

      expect(firstPage).toHaveLength(1);

      const secondPage = await repository.findByStaff(staff.id, {
        page: 2,
        limit: 1,
      });

      expect(secondPage).toHaveLength(1);
      expect(secondPage[0].id).not.toBe(firstPage[0].id);
    });
  });

  describe('findByTenant', () => {
    beforeEach(async () => {
      // Create leave requests for different staff
      await repository.create(createTestLeaveRequestData());

      await repository.create({
        tenantId: tenant.id,
        staffId: otherStaff.id,
        leaveTypeId: 2,
        leaveTypeName: 'Sick Leave',
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-02'),
        totalDays: 2,
        totalHours: 16,
      });
    });

    it('should return all leave requests for tenant', async () => {
      const requests = await repository.findByTenant(tenant.id);

      expect(requests).toHaveLength(2);
    });

    it('should include staffId reference', async () => {
      const requests = await repository.findByTenant(tenant.id);

      // Results are ordered by startDate desc, so July (otherStaff) comes first
      expect(requests[0]).toHaveProperty('staffId');
      expect(requests[0].staffId).toBe(otherStaff.id);
      expect(requests[1]).toHaveProperty('staffId');
      expect(requests[1].staffId).toBe(staff.id);
    });
  });

  describe('findPendingByStaff', () => {
    it('should return only pending leave requests', async () => {
      const pending1 = await repository.create(createTestLeaveRequestData());
      const pending2 = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-05'),
      });

      // Approve one
      await repository.approve(pending1.id, tenant.id, 'manager-id');

      const pendingRequests = await repository.findPendingByStaff(staff.id);

      expect(pendingRequests).toHaveLength(1);
      expect(pendingRequests[0].id).toBe(pending2.id);
    });
  });

  describe('update', () => {
    it('should update leave request fields', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );

      const updated = await repository.update(leaveRequest.id, tenant.id, {
        reason: 'Updated reason',
        totalDays: 6,
        totalHours: 48,
      });

      expect(updated.reason).toBe('Updated reason');
      expect(Number(updated.totalDays)).toBe(6);
      expect(Number(updated.totalHours)).toBe(48);
    });

    it('should update dates', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );

      const updated = await repository.update(leaveRequest.id, tenant.id, {
        startDate: new Date('2024-06-10'),
        endDate: new Date('2024-06-15'),
      });

      expect(updated.startDate).toEqual(new Date('2024-06-10'));
      expect(updated.endDate).toEqual(new Date('2024-06-15'));
    });

    it('should throw NotFoundException for non-existent leave request', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', tenant.id, {
          reason: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for non-PENDING leave request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.approve(leaveRequest.id, tenant.id, 'manager-id');

      await expect(
        repository.update(leaveRequest.id, tenant.id, { reason: 'Updated' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('approve', () => {
    it('should set status to APPROVED', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );

      const approved = await repository.approve(
        leaveRequest.id,
        tenant.id,
        'manager-id',
      );

      expect(approved.status).toBe(LeaveRequestStatus.APPROVED);
      expect(approved.approvedBy).toBe('manager-id');
      expect(approved.approvedAt).toBeDefined();
      expect(approved.approvedAt).toBeInstanceOf(Date);
    });

    it('should throw NotFoundException for non-existent leave request', async () => {
      await expect(
        repository.approve(
          '00000000-0000-0000-0000-000000000000',
          tenant.id,
          'manager-id',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for already approved leave request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.approve(leaveRequest.id, tenant.id, 'manager-id');

      await expect(
        repository.approve(leaveRequest.id, tenant.id, 'another-manager'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for rejected leave request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.reject(
        leaveRequest.id,
        tenant.id,
        'manager-id',
        'Not available',
      );

      await expect(
        repository.approve(leaveRequest.id, tenant.id, 'manager-id'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reject', () => {
    it('should set status to REJECTED', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );

      const rejected = await repository.reject(
        leaveRequest.id,
        tenant.id,
        'manager-id',
        'Staff shortage during that period',
      );

      expect(rejected.status).toBe(LeaveRequestStatus.REJECTED);
      expect(rejected.approvedBy).toBe('manager-id');
      expect(rejected.rejectedReason).toBe('Staff shortage during that period');
    });

    it('should throw NotFoundException for non-existent leave request', async () => {
      await expect(
        repository.reject(
          '00000000-0000-0000-0000-000000000000',
          tenant.id,
          'manager-id',
          'Reason',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for non-PENDING leave request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.approve(leaveRequest.id, tenant.id, 'manager-id');

      await expect(
        repository.reject(leaveRequest.id, tenant.id, 'manager-id', 'Reason'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancel', () => {
    it('should set status to CANCELLED for PENDING request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );

      const cancelled = await repository.cancel(leaveRequest.id, tenant.id);

      expect(cancelled.status).toBe(LeaveRequestStatus.CANCELLED);
    });

    it('should set status to CANCELLED for APPROVED request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.approve(leaveRequest.id, tenant.id, 'manager-id');

      const cancelled = await repository.cancel(leaveRequest.id, tenant.id);

      expect(cancelled.status).toBe(LeaveRequestStatus.CANCELLED);
    });

    it('should throw NotFoundException for non-existent leave request', async () => {
      await expect(
        repository.cancel('00000000-0000-0000-0000-000000000000', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for REJECTED request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.reject(
        leaveRequest.id,
        tenant.id,
        'manager-id',
        'Reason',
      );

      await expect(
        repository.cancel(leaveRequest.id, tenant.id),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for already CANCELLED request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.cancel(leaveRequest.id, tenant.id);

      await expect(
        repository.cancel(leaveRequest.id, tenant.id),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('markSynced', () => {
    it('should mark leave request as synced', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.approve(leaveRequest.id, tenant.id, 'manager-id');

      const synced = await repository.markSynced(leaveRequest.id, [
        'sp-123',
        'sp-124',
        'sp-125',
      ]);

      expect(synced.simplePaySynced).toBe(true);
      expect(synced.simplePayIds).toEqual(['sp-123', 'sp-124', 'sp-125']);
    });
  });

  describe('delete', () => {
    it('should delete existing leave request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );

      await repository.delete(leaveRequest.id, tenant.id);

      const found = await repository.findById(leaveRequest.id, tenant.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent leave request', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for synced leave request', async () => {
      const leaveRequest = await repository.create(
        createTestLeaveRequestData(),
      );
      await repository.approve(leaveRequest.id, tenant.id, 'manager-id');
      await repository.markSynced(leaveRequest.id, ['sp-123']);

      await expect(
        repository.delete(leaveRequest.id, tenant.id),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('countByTenant', () => {
    beforeEach(async () => {
      await repository.create(createTestLeaveRequestData());
      await repository.create({
        ...createTestLeaveRequestData(),
        leaveTypeId: 2,
        leaveTypeName: 'Sick Leave',
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-02'),
        totalDays: 2,
        totalHours: 16,
      });

      const approved = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-05'),
      });
      await repository.approve(approved.id, tenant.id, 'manager-id');
    });

    it('should count all leave requests for tenant', async () => {
      const count = await repository.countByTenant(tenant.id);

      expect(count).toBe(3);
    });

    it('should count filtered by status', async () => {
      const pendingCount = await repository.countByTenant(tenant.id, {
        status: LeaveRequestStatus.PENDING,
      });

      expect(pendingCount).toBe(2);

      const approvedCount = await repository.countByTenant(tenant.id, {
        status: LeaveRequestStatus.APPROVED,
      });

      expect(approvedCount).toBe(1);
    });

    it('should count filtered by leaveTypeId', async () => {
      const sickLeaveCount = await repository.countByTenant(tenant.id, {
        leaveTypeId: 2,
      });

      expect(sickLeaveCount).toBe(1);
    });
  });

  describe('findUnsyncedApproved', () => {
    it('should return only unsynced approved leave requests', async () => {
      // Create and approve leave requests
      const lr1 = await repository.create(createTestLeaveRequestData());
      await repository.approve(lr1.id, tenant.id, 'manager-id');

      const lr2 = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-05'),
      });
      await repository.approve(lr2.id, tenant.id, 'manager-id');
      await repository.markSynced(lr2.id, ['sp-123']); // Mark as synced

      // Create pending leave request
      await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-05'),
      });

      const unsynced = await repository.findUnsyncedApproved(tenant.id);

      expect(unsynced).toHaveLength(1);
      expect(unsynced[0].id).toBe(lr1.id);
      expect(unsynced[0].simplePaySynced).toBe(false);
    });

    it('should order by startDate ascending', async () => {
      const lr1 = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-05'),
      });
      await repository.approve(lr1.id, tenant.id, 'manager-id');

      const lr2 = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
      });
      await repository.approve(lr2.id, tenant.id, 'manager-id');

      const unsynced = await repository.findUnsyncedApproved(tenant.id);

      expect(unsynced).toHaveLength(2);
      expect(unsynced[0].id).toBe(lr2.id); // June comes before July
      expect(unsynced[1].id).toBe(lr1.id);
    });
  });

  describe('all LeaveRequestStatus values', () => {
    it('should handle PENDING, APPROVED, REJECTED, CANCELLED', async () => {
      // PENDING
      const pending = await repository.create(createTestLeaveRequestData());
      expect(pending.status).toBe(LeaveRequestStatus.PENDING);

      // APPROVED
      const toApprove = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-05'),
      });
      const approved = await repository.approve(
        toApprove.id,
        tenant.id,
        'manager-id',
      );
      expect(approved.status).toBe(LeaveRequestStatus.APPROVED);

      // REJECTED
      const toReject = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-05'),
      });
      const rejected = await repository.reject(
        toReject.id,
        tenant.id,
        'manager-id',
        'Reason',
      );
      expect(rejected.status).toBe(LeaveRequestStatus.REJECTED);

      // CANCELLED
      const toCancel = await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-09-01'),
        endDate: new Date('2024-09-05'),
      });
      const cancelled = await repository.cancel(toCancel.id, tenant.id);
      expect(cancelled.status).toBe(LeaveRequestStatus.CANCELLED);
    });
  });

  describe('tenant isolation', () => {
    it('should not return leave requests from other tenants', async () => {
      // Create leave request for tenant 1
      await repository.create(createTestLeaveRequestData());

      // Create staff and leave request for tenant 2
      const otherTenantStaff = await staffRepository.create({
        tenantId: otherTenant.id,
        employeeNumber: 'EMP-999',
        firstName: 'Other',
        lastName: 'Staff',
        idNumber: '7512258765432',
        email: 'other@brightbeginnings.co.za',
        phone: '+27829999999',
        dateOfBirth: new Date('1975-12-25'),
        startDate: new Date('2024-01-01'),
        employmentType: EmploymentType.PERMANENT,
        basicSalaryCents: 1000000,
      });

      await repository.create({
        tenantId: otherTenant.id,
        staffId: otherTenantStaff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-05'),
        totalDays: 5,
        totalHours: 40,
      });

      const tenant1Requests = await repository.findByTenant(tenant.id);
      const tenant2Requests = await repository.findByTenant(otherTenant.id);

      expect(tenant1Requests).toHaveLength(1);
      expect(tenant2Requests).toHaveLength(1);
      expect(tenant1Requests[0].tenantId).toBe(tenant.id);
      expect(tenant2Requests[0].tenantId).toBe(otherTenant.id);
    });
  });

  describe('date handling', () => {
    it('should store startDate and endDate correctly', async () => {
      const startDate = new Date('2024-06-15');
      const endDate = new Date('2024-06-20');

      const leaveRequest = await repository.create({
        ...createTestLeaveRequestData(),
        startDate,
        endDate,
      });

      expect(leaveRequest.startDate).toEqual(startDate);
      expect(leaveRequest.endDate).toEqual(endDate);
    });

    it('should filter by date range', async () => {
      await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-05-01'),
        endDate: new Date('2024-05-05'),
      });

      await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-06-15'),
        endDate: new Date('2024-06-20'),
      });

      await repository.create({
        ...createTestLeaveRequestData(),
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-05'),
      });

      const juneRequests = await repository.findByStaff(staff.id, {
        fromDate: new Date('2024-06-01'),
        toDate: new Date('2024-06-30'),
      });

      expect(juneRequests).toHaveLength(1);
      expect(juneRequests[0].startDate.getMonth()).toBe(5); // June
    });
  });
});
