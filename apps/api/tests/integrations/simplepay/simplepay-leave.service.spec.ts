/**
 * SimplePay Leave Service Tests
 * TASK-SPAY-001: SimplePay Leave Management
 */

import 'dotenv/config';
import { cleanDatabase } from '../../helpers/clean-database';
import { Test, TestingModule } from '@nestjs/testing';
import { SimplePayLeaveService } from '../../../src/integrations/simplepay/simplepay-leave.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { LeaveRequestRepository } from '../../../src/database/repositories/leave-request.repository';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  SimplePayLeaveType,
  SimplePayLeaveBalance,
  SimplePayLeaveDay,
  LeaveRequestStatus,
} from '../../../src/database/entities/leave-request.entity';
import { EmploymentType } from '../../../src/database/entities/staff.entity';
import { Tenant, Staff, LeaveRequest } from '@prisma/client';

describe('SimplePayLeaveService', () => {
  let service: SimplePayLeaveService;
  let apiClient: SimplePayApiClient;
  let simplePayRepo: SimplePayRepository;
  let leaveRequestRepo: LeaveRequestRepository;
  let staffRepository: StaffRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let staff: Staff;

  // Mock API client methods
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockPatch = jest.fn();
  const mockDelete = jest.fn();
  const mockInitializeForTenant = jest.fn();
  const mockGetClientId = jest.fn().mockReturnValue('test-client-123');

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePayLeaveService,
        {
          provide: SimplePayApiClient,
          useValue: {
            get: mockGet,
            post: mockPost,
            patch: mockPatch,
            delete: mockDelete,
            initializeForTenant: mockInitializeForTenant,
            getClientId: mockGetClientId,
          },
        },
        SimplePayRepository,
        LeaveRequestRepository,
        StaffRepository,
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                SIMPLEPAY_API_URL: 'https://api.simplepay.co.za/v1',
                SIMPLEPAY_API_KEY: 'test-key',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SimplePayLeaveService>(SimplePayLeaveService);
    apiClient = module.get<SimplePayApiClient>(SimplePayApiClient);
    simplePayRepo = module.get<SimplePayRepository>(SimplePayRepository);
    leaveRequestRepo = module.get<LeaveRequestRepository>(
      LeaveRequestRepository,
    );
    staffRepository = module.get<StaffRepository>(StaffRepository);
    prisma = module.get<PrismaService>(PrismaService);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockInitializeForTenant.mockResolvedValue(undefined);

    // Clean database using TRUNCATE CASCADE
    await cleanDatabase(prisma);

    // Note: Cache is cleared per-tenant when tenant is created
    // No need to clear cache here before tenant exists

    // Create test tenant
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
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getLeaveTypes', () => {
    // The implementation calls apiClient.get<Record<string, string>>() which
    // returns SimplePay's format: { "leaveTypeId": "name", ... }
    const mockLeaveTypesResponse: Record<string, string> = {
      '1': 'Annual Leave',
      '2': 'Sick Leave',
      '3': 'Family Responsibility Leave',
    };

    it('should fetch leave types from SimplePay API', async () => {
      mockGet.mockResolvedValue(mockLeaveTypesResponse);

      const leaveTypes = await service.getLeaveTypes(tenant.id);

      expect(mockInitializeForTenant).toHaveBeenCalledWith(tenant.id);
      expect(mockGet).toHaveBeenCalledWith(
        '/clients/test-client-123/leave_types',
      );
      expect(leaveTypes).toHaveLength(3);
      expect(leaveTypes[0].name).toBe('Annual Leave');
      expect(leaveTypes[0].id).toBe(1);
      expect(leaveTypes[0].accrual_type).toBe('annual');
      expect(leaveTypes[1].name).toBe('Sick Leave');
      expect(leaveTypes[1].accrual_type).toBe('sick');
      expect(leaveTypes[2].name).toBe('Family Responsibility Leave');
      expect(leaveTypes[2].accrual_type).toBe('family_responsibility');
    });

    it('should cache leave types for 15 minutes', async () => {
      mockGet.mockResolvedValue(mockLeaveTypesResponse);

      // First call should fetch from API
      await service.getLeaveTypes(tenant.id);
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await service.getLeaveTypes(tenant.id);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should force refresh cache when specified', async () => {
      mockGet.mockResolvedValue(mockLeaveTypesResponse);

      await service.getLeaveTypes(tenant.id);
      expect(mockGet).toHaveBeenCalledTimes(1);

      await service.getLeaveTypes(tenant.id, true);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors', async () => {
      mockGet.mockRejectedValue(new Error('API Error'));

      await expect(service.getLeaveTypes(tenant.id)).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('getLeaveBalances', () => {
    // The implementation makes two API calls:
    // 1. GET /employees/{id}/leave_balances?date={date} -> Record<string, number>
    // 2. GET /clients/{id}/leave_types -> Record<string, string>
    const mockBalanceResponse: Record<string, number> = {
      '1': 8,
      '2': 27,
    };

    const mockLeaveTypeNamesResponse: Record<string, string> = {
      '1': 'Annual Leave',
      '2': 'Sick Leave',
    };

    it('should fetch leave balances for an employee', async () => {
      mockGet.mockImplementation((endpoint: string) => {
        if (endpoint.includes('/leave_balances')) {
          return Promise.resolve(mockBalanceResponse);
        }
        if (endpoint.includes('/leave_types')) {
          return Promise.resolve(mockLeaveTypeNamesResponse);
        }
        return Promise.resolve({});
      });

      const balances = await service.getLeaveBalances(tenant.id, 'sp-emp-123');

      expect(mockInitializeForTenant).toHaveBeenCalledWith(tenant.id);
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/employees/sp-emp-123/leave_balances'),
      );
      expect(balances).toHaveLength(2);
      expect(balances[0].current_balance).toBe(8);
      expect(balances[0].leave_type_name).toBe('Annual Leave');
      expect(balances[1].current_balance).toBe(27);
      expect(balances[1].leave_type_name).toBe('Sick Leave');
    });

    it('should handle API errors', async () => {
      mockGet.mockRejectedValue(new Error('Employee not found'));

      await expect(
        service.getLeaveBalances(tenant.id, 'invalid-emp'),
      ).rejects.toThrow('Employee not found');
    });
  });

  describe('getLeaveDays', () => {
    const mockLeaveDays: { leave_day: SimplePayLeaveDay }[] = [
      {
        leave_day: {
          id: 100,
          employee_id: 123,
          leave_type_id: 1,
          date: '2024-06-03',
          hours: 8,
          status: 'approved',
          notes: null,
          created_at: '2024-05-15T10:00:00Z',
          updated_at: '2024-05-15T10:00:00Z',
        },
      },
      {
        leave_day: {
          id: 101,
          employee_id: 123,
          leave_type_id: 1,
          date: '2024-06-04',
          hours: 8,
          status: 'approved',
          notes: null,
          created_at: '2024-05-15T10:00:00Z',
          updated_at: '2024-05-15T10:00:00Z',
        },
      },
    ];

    it('should fetch leave days for an employee', async () => {
      mockGet.mockResolvedValue(mockLeaveDays);

      const leaveDays = await service.getLeaveDays(tenant.id, 'sp-emp-123');

      expect(mockGet).toHaveBeenCalledWith('/employees/sp-emp-123/leave_days');
      expect(leaveDays).toHaveLength(2);
      expect(leaveDays[0].date).toBe('2024-06-03');
    });

    it('should filter by date range', async () => {
      mockGet.mockResolvedValue(mockLeaveDays);

      await service.getLeaveDays(
        tenant.id,
        'sp-emp-123',
        new Date('2024-06-01'),
        new Date('2024-06-30'),
      );

      expect(mockGet).toHaveBeenCalledWith(
        '/employees/sp-emp-123/leave_days?from_date=2024-06-01&to_date=2024-06-30',
      );
    });

    it('should filter by from date only', async () => {
      mockGet.mockResolvedValue(mockLeaveDays);

      await service.getLeaveDays(
        tenant.id,
        'sp-emp-123',
        new Date('2024-06-01'),
      );

      expect(mockGet).toHaveBeenCalledWith(
        '/employees/sp-emp-123/leave_days?from_date=2024-06-01',
      );
    });
  });

  describe('createLeaveDay', () => {
    const mockCreatedLeaveDay: SimplePayLeaveDay = {
      id: 200,
      employee_id: 123,
      leave_type_id: 1,
      date: '2024-06-10',
      hours: 8,
      status: 'pending',
      notes: 'Vacation day',
      created_at: '2024-06-01T10:00:00Z',
      updated_at: '2024-06-01T10:00:00Z',
    };

    it('should create a leave day in SimplePay', async () => {
      mockPost.mockResolvedValue({ leave_day: mockCreatedLeaveDay });

      const leaveDay = await service.createLeaveDay(tenant.id, 'sp-emp-123', {
        leave_type_id: 1,
        date: '2024-06-10',
        hours: 8,
        notes: 'Vacation day',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/employees/sp-emp-123/leave_days',
        {
          leave_day: {
            leave_type_id: 1,
            date: '2024-06-10',
            hours: 8,
            notes: 'Vacation day',
          },
        },
      );
      expect(leaveDay.id).toBe(200);
      expect(leaveDay.date).toBe('2024-06-10');
    });

    it('should handle unwrapped response format', async () => {
      mockPost.mockResolvedValue(mockCreatedLeaveDay);

      const leaveDay = await service.createLeaveDay(tenant.id, 'sp-emp-123', {
        leave_type_id: 1,
        date: '2024-06-10',
        hours: 8,
      });

      expect(leaveDay.id).toBe(200);
    });

    it('should handle null notes', async () => {
      mockPost.mockResolvedValue({ leave_day: mockCreatedLeaveDay });

      await service.createLeaveDay(tenant.id, 'sp-emp-123', {
        leave_type_id: 1,
        date: '2024-06-10',
        hours: 8,
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/employees/sp-emp-123/leave_days',
        {
          leave_day: {
            leave_type_id: 1,
            date: '2024-06-10',
            hours: 8,
            notes: null,
          },
        },
      );
    });
  });

  describe('createMultipleLeaveDays', () => {
    const mockCreatedLeaveDay = (
      id: number,
      date: string,
    ): SimplePayLeaveDay => ({
      id,
      employee_id: 123,
      leave_type_id: 1,
      date,
      hours: 8,
      status: 'pending',
      notes: null,
      created_at: '2024-06-01T10:00:00Z',
      updated_at: '2024-06-01T10:00:00Z',
    });

    it('should create multiple leave days', async () => {
      mockPost
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(1, '2024-06-03'),
        })
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(2, '2024-06-04'),
        })
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(3, '2024-06-05'),
        });

      const inputs = [
        { leave_type_id: 1, date: '2024-06-03', hours: 8 },
        { leave_type_id: 1, date: '2024-06-04', hours: 8 },
        { leave_type_id: 1, date: '2024-06-05', hours: 8 },
      ];

      const leaveDays = await service.createMultipleLeaveDays(
        tenant.id,
        'sp-emp-123',
        inputs,
      );

      expect(leaveDays).toHaveLength(3);
      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures', async () => {
      mockPost
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(1, '2024-06-03'),
        })
        .mockRejectedValueOnce(new Error('Duplicate entry'))
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(3, '2024-06-05'),
        });

      const inputs = [
        { leave_type_id: 1, date: '2024-06-03', hours: 8 },
        { leave_type_id: 1, date: '2024-06-04', hours: 8 },
        { leave_type_id: 1, date: '2024-06-05', hours: 8 },
      ];

      const leaveDays = await service.createMultipleLeaveDays(
        tenant.id,
        'sp-emp-123',
        inputs,
      );

      expect(leaveDays).toHaveLength(2);
    });

    it('should throw error when all creations fail', async () => {
      mockPost
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'));

      const inputs = [
        { leave_type_id: 1, date: '2024-06-03', hours: 8 },
        { leave_type_id: 1, date: '2024-06-04', hours: 8 },
      ];

      await expect(
        service.createMultipleLeaveDays(tenant.id, 'sp-emp-123', inputs),
      ).rejects.toThrow('All leave day creations failed');
    });
  });

  describe('updateLeaveDay', () => {
    const mockUpdatedLeaveDay: SimplePayLeaveDay = {
      id: 100,
      employee_id: 123,
      leave_type_id: 1,
      date: '2024-06-03',
      hours: 4, // Updated from 8 to 4
      status: 'pending',
      notes: 'Half day only',
      created_at: '2024-05-15T10:00:00Z',
      updated_at: '2024-06-01T10:00:00Z',
    };

    it('should update a leave day', async () => {
      mockPatch.mockResolvedValue({ leave_day: mockUpdatedLeaveDay });

      const leaveDay = await service.updateLeaveDay(tenant.id, 100, {
        hours: 4,
        notes: 'Half day only',
      });

      expect(mockPatch).toHaveBeenCalledWith('/leave_days/100', {
        leave_day: { hours: 4, notes: 'Half day only' },
      });
      expect(leaveDay.hours).toBe(4);
    });

    it('should handle unwrapped response format', async () => {
      mockPatch.mockResolvedValue(mockUpdatedLeaveDay);

      const leaveDay = await service.updateLeaveDay(tenant.id, 100, {
        hours: 4,
      });

      expect(leaveDay.hours).toBe(4);
    });
  });

  describe('deleteLeaveDay', () => {
    it('should delete a leave day', async () => {
      mockDelete.mockResolvedValue(undefined);

      await service.deleteLeaveDay(tenant.id, 100);

      expect(mockDelete).toHaveBeenCalledWith('/leave_days/100');
    });

    it('should handle API errors', async () => {
      mockDelete.mockRejectedValue(new Error('Leave day not found'));

      await expect(service.deleteLeaveDay(tenant.id, 999)).rejects.toThrow(
        'Leave day not found',
      );
    });
  });

  describe('syncLeaveRequestToSimplePay', () => {
    let leaveRequest: LeaveRequest;

    beforeEach(async () => {
      // Create SimplePay connection
      await prisma.simplePayConnection.create({
        data: {
          tenantId: tenant.id,
          clientId: 'test-client-123',
          apiKey: 'test-api-key',
          isActive: true,
        },
      });

      // Create SimplePay employee mapping
      await prisma.simplePayEmployeeMapping.create({
        data: {
          tenantId: tenant.id,
          staffId: staff.id,
          simplePayEmployeeId: 'sp-emp-456',
        },
      });

      // Create and approve leave request
      leaveRequest = await leaveRequestRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-05'),
        totalDays: 3,
        totalHours: 24,
        reason: 'Vacation',
      });
      await leaveRequestRepo.approve(leaveRequest.id, tenant.id, 'manager-id');
    });

    it('should sync approved leave request to SimplePay', async () => {
      const mockCreatedLeaveDay = (
        id: number,
        date: string,
      ): SimplePayLeaveDay => ({
        id,
        employee_id: 456,
        leave_type_id: 1,
        date,
        hours: 8,
        status: 'approved',
        notes: 'Vacation',
        created_at: '2024-06-01T10:00:00Z',
        updated_at: '2024-06-01T10:00:00Z',
      });

      mockPost
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(1, '2024-06-03'),
        })
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(2, '2024-06-04'),
        })
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(3, '2024-06-05'),
        });

      const result = await service.syncLeaveRequestToSimplePay(
        tenant.id,
        leaveRequest.id,
      );

      expect(result.success).toBe(true);
      expect(result.simplePayIds).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Verify leave request was marked as synced
      const updatedRequest = await leaveRequestRepo.findById(
        leaveRequest.id,
        tenant.id,
      );
      expect(updatedRequest?.simplePaySynced).toBe(true);
      expect(updatedRequest?.simplePayIds).toEqual(['1', '2', '3']);
    });

    it('should fail for non-approved leave request', async () => {
      const pendingRequest = await leaveRequestRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-05'),
        totalDays: 5,
        totalHours: 40,
      });

      const result = await service.syncLeaveRequestToSimplePay(
        tenant.id,
        pendingRequest.id,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        "Leave request is in 'PENDING' status, must be APPROVED to sync",
      );
    });

    it('should fail for already synced leave request', async () => {
      await leaveRequestRepo.markSynced(leaveRequest.id, ['sp-100', 'sp-101']);

      const result = await service.syncLeaveRequestToSimplePay(
        tenant.id,
        leaveRequest.id,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Leave request is already synced to SimplePay',
      );
    });

    it('should fail for staff without SimplePay mapping', async () => {
      // Create staff without SimplePay mapping
      const unmappedStaff = await staffRepository.create({
        tenantId: tenant.id,
        employeeNumber: 'EMP-999',
        firstName: 'Unmapped',
        lastName: 'Staff',
        idNumber: '9999999999999',
        email: 'unmapped@littlestars.co.za',
        phone: '+27829999999',
        dateOfBirth: new Date('1990-01-01'),
        startDate: new Date('2024-01-01'),
        employmentType: EmploymentType.PERMANENT,
        basicSalaryCents: 1000000,
      });

      const unmappedRequest = await leaveRequestRepo.create({
        tenantId: tenant.id,
        staffId: unmappedStaff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-05'),
        totalDays: 5,
        totalHours: 40,
      });
      await leaveRequestRepo.approve(
        unmappedRequest.id,
        tenant.id,
        'manager-id',
      );

      const result = await service.syncLeaveRequestToSimplePay(
        tenant.id,
        unmappedRequest.id,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'Staff member is not linked to a SimplePay employee',
      );
    });

    it('should skip weekends when generating leave days', async () => {
      // Friday to Monday (should skip Saturday and Sunday)
      const fridayToMondayRequest = await leaveRequestRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-06-07'), // Friday
        endDate: new Date('2024-06-10'), // Monday
        totalDays: 2,
        totalHours: 16,
      });
      await leaveRequestRepo.approve(
        fridayToMondayRequest.id,
        tenant.id,
        'manager-id',
      );

      const mockCreatedLeaveDay = (
        id: number,
        date: string,
      ): SimplePayLeaveDay => ({
        id,
        employee_id: 456,
        leave_type_id: 1,
        date,
        hours: 8,
        status: 'approved',
        notes: null,
        created_at: '2024-06-01T10:00:00Z',
        updated_at: '2024-06-01T10:00:00Z',
      });

      mockPost
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(1, '2024-06-07'),
        })
        .mockResolvedValueOnce({
          leave_day: mockCreatedLeaveDay(2, '2024-06-10'),
        });

      const result = await service.syncLeaveRequestToSimplePay(
        tenant.id,
        fridayToMondayRequest.id,
      );

      expect(result.success).toBe(true);
      expect(mockPost).toHaveBeenCalledTimes(2); // Only Friday and Monday
    });
  });

  describe('syncAllUnsyncedLeaveRequests', () => {
    beforeEach(async () => {
      // Create SimplePay connection
      await prisma.simplePayConnection.create({
        data: {
          tenantId: tenant.id,
          clientId: 'test-client-123',
          apiKey: 'test-api-key',
          isActive: true,
        },
      });

      // Create SimplePay employee mapping
      await prisma.simplePayEmployeeMapping.create({
        data: {
          tenantId: tenant.id,
          staffId: staff.id,
          simplePayEmployeeId: 'sp-emp-456',
        },
      });
    });

    it('should sync all unsynced approved leave requests', async () => {
      // Create and approve multiple leave requests
      const lr1 = await leaveRequestRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-03'),
        totalDays: 1,
        totalHours: 8,
      });
      await leaveRequestRepo.approve(lr1.id, tenant.id, 'manager-id');

      const lr2 = await leaveRequestRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        leaveTypeId: 2,
        leaveTypeName: 'Sick Leave',
        startDate: new Date('2024-07-01'),
        endDate: new Date('2024-07-01'),
        totalDays: 1,
        totalHours: 8,
      });
      await leaveRequestRepo.approve(lr2.id, tenant.id, 'manager-id');

      // Pending request (should not be synced)
      await leaveRequestRepo.create({
        tenantId: tenant.id,
        staffId: staff.id,
        leaveTypeId: 1,
        leaveTypeName: 'Annual Leave',
        startDate: new Date('2024-08-01'),
        endDate: new Date('2024-08-01'),
        totalDays: 1,
        totalHours: 8,
      });

      const mockLeaveDay: SimplePayLeaveDay = {
        id: 100,
        employee_id: 456,
        leave_type_id: 1,
        date: '2024-06-03',
        hours: 8,
        status: 'approved',
        notes: null,
        created_at: '2024-06-01T10:00:00Z',
        updated_at: '2024-06-01T10:00:00Z',
      };

      mockPost.mockResolvedValue({ leave_day: mockLeaveDay });

      const results = await service.syncAllUnsyncedLeaveRequests(tenant.id);

      expect(results).toHaveLength(2);
      expect(results.filter((r) => r.success)).toHaveLength(2);
    });
  });

  describe('getLeaveBalancesByStaff', () => {
    beforeEach(async () => {
      // Create SimplePay connection
      await prisma.simplePayConnection.create({
        data: {
          tenantId: tenant.id,
          clientId: 'test-client-123',
          apiKey: 'test-api-key',
          isActive: true,
        },
      });

      // Create SimplePay employee mapping
      await prisma.simplePayEmployeeMapping.create({
        data: {
          tenantId: tenant.id,
          staffId: staff.id,
          simplePayEmployeeId: 'sp-emp-456',
        },
      });
    });

    it('should get leave balances by staff ID', async () => {
      // The implementation calls getLeaveBalances which makes two API calls:
      // 1. GET /employees/{id}/leave_balances?date={date} -> Record<string, number>
      // 2. GET /clients/{id}/leave_types -> Record<string, string>
      mockGet.mockImplementation((endpoint: string) => {
        if (endpoint.includes('/leave_balances')) {
          return Promise.resolve({ '1': 10 } as Record<string, number>);
        }
        if (endpoint.includes('/leave_types')) {
          return Promise.resolve({ '1': 'Annual Leave' } as Record<
            string,
            string
          >);
        }
        return Promise.resolve({});
      });

      const balances = await service.getLeaveBalancesByStaff(
        tenant.id,
        staff.id,
      );

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('/employees/sp-emp-456/leave_balances'),
      );
      expect(balances).toHaveLength(1);
      expect(balances[0].current_balance).toBe(10);
    });

    it('should throw error for staff without SimplePay mapping', async () => {
      // Create staff without SimplePay mapping
      const unmappedStaff = await staffRepository.create({
        tenantId: tenant.id,
        employeeNumber: 'EMP-999',
        firstName: 'Unmapped',
        lastName: 'Staff',
        idNumber: '9999999999999',
        email: 'unmapped@littlestars.co.za',
        phone: '+27829999999',
        dateOfBirth: new Date('1990-01-01'),
        startDate: new Date('2024-01-01'),
        employmentType: EmploymentType.PERMANENT,
        basicSalaryCents: 1000000,
      });

      await expect(
        service.getLeaveBalancesByStaff(tenant.id, unmappedStaff.id),
      ).rejects.toThrow('Staff member is not linked to a SimplePay employee');
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific tenant', async () => {
      // SimplePay returns Record<string, string> for leave types
      const mockLeaveTypesResponse: Record<string, string> = {
        '1': 'Annual Leave',
      };

      mockGet.mockResolvedValue(mockLeaveTypesResponse);

      // Populate cache
      await service.getLeaveTypes(tenant.id);
      expect(mockGet).toHaveBeenCalledTimes(1);

      // Clear cache for tenant
      service.clearCache(tenant.id);

      // Should fetch again
      await service.getLeaveTypes(tenant.id);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches when no tenant specified', async () => {
      const mockLeaveTypesResponse: Record<string, string> = {
        '1': 'Annual Leave',
      };

      mockGet.mockResolvedValue(mockLeaveTypesResponse);

      await service.getLeaveTypes(tenant.id);
      expect(mockGet).toHaveBeenCalledTimes(1);

      service.clearCache(tenant.id);

      await service.getLeaveTypes(tenant.id);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });
});
