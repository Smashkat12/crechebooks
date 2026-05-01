/**
 * StaffPortalController — leave + IRP5 endpoints
 *
 * Covers:
 *   GET  /staff-portal/leave/balances       — wired to SimplePay (Path B)
 *   GET  /staff-portal/leave/requests       — wired to LeaveRequestRepository
 *   POST /staff-portal/leave/requests       — creates DB record via repository
 *   DELETE /staff-portal/leave/requests/:id — cancels via repository
 *   GET  /staff-portal/documents/irp5       — honest stub (SimplePay has no IRP5 API)
 *   GET  /staff-portal/dashboard            — leaveBalance from SimplePay with fallback
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StaffPortalController } from './staff-portal.controller';
import { StaffDocumentService } from '../../database/services/staff-document.service';
import { StaffOnboardingService } from '../../database/services/staff-onboarding.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { StaffAuthGuard } from '../auth/guards/staff-auth.guard';
import { StaffMagicLinkService } from '../auth/services/staff-magic-link.service';
import { SimplePayPayslipService } from '../../integrations/simplepay/simplepay-payslip.service';
import { SimplePayLeaveService } from '../../integrations/simplepay/simplepay-leave.service';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { LeaveRequestRepository } from '../../database/repositories/leave-request.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import type { StaffSessionInfo } from '../auth/decorators/current-staff.decorator';
import { LeaveType, LeaveStatus } from './dto/staff-leave.dto';
import { LeaveRequest } from '@prisma/client';
import Decimal from 'decimal.js';
import { Irp5PortalService } from './irp5-portal.service';
import { Irp5PdfService } from './irp5-pdf.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = 'bdff4374-64d5-420c-b454-8e85e9df552a';
const STAFF_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const mockSession: StaffSessionInfo = {
  staffId: STAFF_ID,
  tenantId: TENANT_ID,
  staff: { email: 'staff@test.com' } as StaffSessionInfo['staff'],
} as StaffSessionInfo;

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeLeaveRequest(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'lr-abc',
    tenantId: TENANT_ID,
    staffId: STAFF_ID,
    leaveTypeId: 1,
    leaveTypeName: 'Annual Leave',
    startDate: new Date('2026-06-02'),
    endDate: new Date('2026-06-04'),
    totalDays: new Decimal('3'),
    totalHours: new Decimal('24'),
    reason: 'Holiday',
    status: 'PENDING',
    simplePaySynced: false,
    simplePayIds: [],
    approvedBy: null,
    approvedAt: null,
    rejectedReason: null,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    ...overrides,
  };
}

const mockSpBalance = {
  leave_type_id: 1,
  leave_type_name: 'Annual Leave',
  opening_balance: 0,
  accrued: 15,
  taken: 5,
  pending: 2,
  adjustment: 0,
  current_balance: 8,
  units: 'days' as const,
};

const mockSpLeaveType = {
  id: 1,
  name: 'Annual Leave',
  accrual_type: 'annual' as const,
  accrual_rate: 0,
  accrual_cap: null,
  carry_over_cap: null,
  units: 'days' as const,
  requires_approval: true,
  is_active: true,
};

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockSimplePayLeaveService = {
  getLeaveBalancesByStaff: jest.fn(),
  getLeaveTypes: jest.fn(),
};

const mockLeaveRequestRepo = {
  findByStaff: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  cancel: jest.fn(),
};

const mockPrisma = {
  staff: {
    findUnique: jest.fn(),
  },
};

const mockPayslipService = {
  getImportedPayslips: jest.fn().mockResolvedValue({ data: [], total: 0 }),
};

const passthroughGuard = { canActivate: () => true };

// ---------------------------------------------------------------------------
// Module setup helper
// ---------------------------------------------------------------------------

async function buildModule() {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [StaffPortalController],
    providers: [
      {
        provide: StaffDocumentService,
        useValue: { getDocumentsByStaff: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: StaffOnboardingService,
        useValue: { getOnboardingByStaffId: jest.fn().mockResolvedValue(null) },
      },
      { provide: StorageService, useValue: {} },
      { provide: PrismaService, useValue: mockPrisma },
      { provide: SimplePayPayslipService, useValue: mockPayslipService },
      { provide: SimplePayRepository, useValue: {} },
      { provide: SimplePayLeaveService, useValue: mockSimplePayLeaveService },
      { provide: LeaveRequestRepository, useValue: mockLeaveRequestRepo },
      {
        provide: Irp5PortalService,
        useValue: {
          listForStaff: jest.fn().mockResolvedValue({ data: [], total: 0, availableYears: [] }),
          getYearAggregate: jest.fn().mockRejectedValue(new NotFoundException('no data')),
        },
      },
      { provide: Irp5PdfService, useValue: {} },
      {
        provide: StaffMagicLinkService,
        useValue: { verifySessionToken: jest.fn() },
      },
    ],
  })
    .overrideGuard(StaffAuthGuard)
    .useValue(passthroughGuard)
    .compile();

  return module.get<StaffPortalController>(StaffPortalController);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StaffPortalController — leave balances', () => {
  let controller: StaffPortalController;

  beforeEach(async () => {
    jest.clearAllMocks();
    controller = await buildModule();
    mockPrisma.staff.findUnique.mockResolvedValue({
      startDate: new Date('2023-03-15'),
    });
  });

  it('returns SimplePay balances when connected', async () => {
    mockSimplePayLeaveService.getLeaveBalancesByStaff.mockResolvedValue([
      mockSpBalance,
    ]);

    const result = await controller.getLeaveBalances(mockSession);

    expect(
      mockSimplePayLeaveService.getLeaveBalancesByStaff,
    ).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].available).toBe(8);
    expect(result.balances[0].used).toBe(5);
  });

  it('falls back to BCEA statutory minimums when SimplePay throws', async () => {
    mockSimplePayLeaveService.getLeaveBalancesByStaff.mockRejectedValue(
      new Error('No SimplePay connection found for tenant'),
    );

    const result = await controller.getLeaveBalances(mockSession);

    // BCEA fallback: Annual(15), Sick(30), Family(3)
    expect(result.balances.length).toBeGreaterThanOrEqual(3);
    const annual = result.balances.find((b) => b.type === LeaveType.ANNUAL);
    expect(annual?.entitled).toBe(15);
    const sick = result.balances.find((b) => b.type === LeaveType.SICK);
    expect(sick?.entitled).toBe(30);
    const family = result.balances.find((b) => b.type === LeaveType.FAMILY);
    expect(family?.entitled).toBe(3);
  });

  it('returns employment start date from DB', async () => {
    mockSimplePayLeaveService.getLeaveBalancesByStaff.mockResolvedValue([]);

    const result = await controller.getLeaveBalances(mockSession);

    expect(result.employmentStartDate).toEqual(new Date('2023-03-15'));
  });

  it('maps sick leave name to LeaveType.SICK', async () => {
    mockSimplePayLeaveService.getLeaveBalancesByStaff.mockResolvedValue([
      {
        ...mockSpBalance,
        leave_type_name: 'Sick Leave',
        taken: 2,
        current_balance: 28,
      },
    ]);

    const result = await controller.getLeaveBalances(mockSession);
    expect(result.balances[0].type).toBe(LeaveType.SICK);
  });
});

// ---------------------------------------------------------------------------

describe('StaffPortalController — leave requests (GET)', () => {
  let controller: StaffPortalController;

  beforeEach(async () => {
    jest.clearAllMocks();
    controller = await buildModule();
  });

  it('calls LeaveRequestRepository.findByStaff with staffId and page/limit', async () => {
    mockLeaveRequestRepo.findByStaff.mockResolvedValue([]);

    await controller.getLeaveRequests(mockSession, undefined, '2', '10');

    expect(mockLeaveRequestRepo.findByStaff).toHaveBeenCalledWith(
      STAFF_ID,
      expect.objectContaining({ page: 2, limit: 10 }),
    );
  });

  it('maps DB status PENDING (uppercase) to portal status pending (lowercase)', async () => {
    mockLeaveRequestRepo.findByStaff.mockResolvedValue([
      makeLeaveRequest({ status: 'PENDING' }),
    ]);

    const result = await controller.getLeaveRequests(mockSession);
    expect(result.data[0].status).toBe('pending');
  });

  it('maps DB status APPROVED (uppercase) to portal status approved', async () => {
    mockLeaveRequestRepo.findByStaff.mockResolvedValue([
      makeLeaveRequest({ status: 'APPROVED' }),
    ]);

    const result = await controller.getLeaveRequests(mockSession);
    expect(result.data[0].status).toBe('approved');
  });

  it('passes uppercase status filter to repository', async () => {
    mockLeaveRequestRepo.findByStaff.mockResolvedValue([]);

    await controller.getLeaveRequests(mockSession, 'pending');

    expect(mockLeaveRequestRepo.findByStaff).toHaveBeenCalledWith(
      STAFF_ID,
      expect.objectContaining({ status: 'PENDING' }),
    );
  });

  it('maps leave type name from DB to portal LeaveType enum', async () => {
    mockLeaveRequestRepo.findByStaff.mockResolvedValue([
      makeLeaveRequest({ leaveTypeName: 'Sick Leave' }),
    ]);

    const result = await controller.getLeaveRequests(mockSession);
    expect(result.data[0].type).toBe(LeaveType.SICK);
  });

  it('returns paginated total from results length', async () => {
    mockLeaveRequestRepo.findByStaff.mockResolvedValue([
      makeLeaveRequest(),
      makeLeaveRequest({ id: 'lr-xyz' }),
    ]);

    const result = await controller.getLeaveRequests(mockSession);
    expect(result.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe('StaffPortalController — create leave request (POST)', () => {
  let controller: StaffPortalController;

  beforeEach(async () => {
    jest.clearAllMocks();
    controller = await buildModule();
  });

  const validDto = {
    type: LeaveType.ANNUAL,
    startDate: '2026-06-02',
    endDate: '2026-06-04',
    reason: 'Holiday',
  };

  it('creates a DB leave request via LeaveRequestRepository', async () => {
    mockSimplePayLeaveService.getLeaveTypes.mockResolvedValue([
      mockSpLeaveType,
    ]);
    mockLeaveRequestRepo.create.mockResolvedValue(makeLeaveRequest());

    await controller.createLeaveRequest(mockSession, validDto);

    expect(mockLeaveRequestRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        staffId: STAFF_ID,
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        reason: 'Holiday',
      }),
    );
  });

  it('resolves leaveTypeId and leaveTypeName from SimplePay when connected', async () => {
    mockSimplePayLeaveService.getLeaveTypes.mockResolvedValue([
      mockSpLeaveType,
    ]);
    mockLeaveRequestRepo.create.mockResolvedValue(makeLeaveRequest());

    await controller.createLeaveRequest(mockSession, validDto);

    const [createArg] = mockLeaveRequestRepo.create.mock.calls[0];
    expect(createArg.leaveTypeId).toBe(1);
    expect(createArg.leaveTypeName).toBe('Annual Leave');
  });

  it('falls back to leaveTypeId=0 and static name when SimplePay unavailable', async () => {
    mockSimplePayLeaveService.getLeaveTypes.mockRejectedValue(
      new Error('No SimplePay connection'),
    );
    mockLeaveRequestRepo.create.mockResolvedValue(makeLeaveRequest());

    await controller.createLeaveRequest(mockSession, validDto);

    const [createArg] = mockLeaveRequestRepo.create.mock.calls[0];
    expect(createArg.leaveTypeId).toBe(0);
    expect(createArg.leaveTypeName).toBe('Annual Leave');
  });

  it('returns status PENDING in response DTO', async () => {
    mockSimplePayLeaveService.getLeaveTypes.mockResolvedValue([]);
    mockLeaveRequestRepo.create.mockResolvedValue(makeLeaveRequest());

    const result = await controller.createLeaveRequest(mockSession, validDto);
    expect(result.request.status).toBe(LeaveStatus.PENDING);
  });

  it('throws BadRequestException when end date is before start date', async () => {
    const badDto = {
      ...validDto,
      startDate: '2026-06-10',
      endDate: '2026-06-05',
    };

    await expect(
      controller.createLeaveRequest(mockSession, badDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('calculates total working days excluding weekends', async () => {
    // 2026-06-01 (Mon) to 2026-06-05 (Fri) = 5 working days
    mockSimplePayLeaveService.getLeaveTypes.mockResolvedValue([]);
    mockLeaveRequestRepo.create.mockResolvedValue(
      makeLeaveRequest({ totalDays: new Decimal('5') }),
    );

    await controller.createLeaveRequest(mockSession, {
      type: LeaveType.ANNUAL,
      startDate: '2026-06-01',
      endDate: '2026-06-05',
    });

    const [createArg] = mockLeaveRequestRepo.create.mock.calls[0];
    expect(createArg.totalDays).toBe(5);
    expect(createArg.totalHours).toBe(40);
  });
});

// ---------------------------------------------------------------------------

describe('StaffPortalController — cancel leave request (DELETE)', () => {
  let controller: StaffPortalController;

  beforeEach(async () => {
    jest.clearAllMocks();
    controller = await buildModule();
  });

  it('cancels a pending leave request belonging to the current staff member', async () => {
    const lr = makeLeaveRequest({ status: 'PENDING' });
    mockLeaveRequestRepo.findById.mockResolvedValue(lr);
    mockLeaveRequestRepo.cancel.mockResolvedValue({
      ...lr,
      status: 'CANCELLED',
    });

    const result = await controller.cancelLeaveRequest(mockSession, 'lr-abc');

    expect(mockLeaveRequestRepo.cancel).toHaveBeenCalledWith(
      'lr-abc',
      TENANT_ID,
    );
    expect(result.request.status).toBe(LeaveStatus.CANCELLED);
  });

  it('throws NotFoundException when leave request does not exist', async () => {
    mockLeaveRequestRepo.findById.mockResolvedValue(null);

    await expect(
      controller.cancelLeaveRequest(mockSession, 'non-existent'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when leave request belongs to a different staff member', async () => {
    mockLeaveRequestRepo.findById.mockResolvedValue(
      makeLeaveRequest({ staffId: 'different-staff-id' }),
    );

    await expect(
      controller.cancelLeaveRequest(mockSession, 'lr-abc'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when repository cancel throws ConflictException', async () => {
    const lr = makeLeaveRequest({ status: 'APPROVED' });
    mockLeaveRequestRepo.findById.mockResolvedValue(lr);
    mockLeaveRequestRepo.cancel.mockRejectedValue(
      new ConflictException("Cannot cancel leave request in 'APPROVED' status"),
    );

    await expect(
      controller.cancelLeaveRequest(mockSession, 'lr-abc'),
    ).rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------

describe('StaffPortalController — IRP5 documents (GET)', () => {
  let controller: StaffPortalController;

  beforeEach(async () => {
    jest.clearAllMocks();
    controller = await buildModule();
  });

  it('returns empty data array when no payslips are imported', async () => {
    const result = await controller.getIRP5Documents(mockSession);

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty availableYears when no payslips are imported', async () => {
    const result = await controller.getIRP5Documents(mockSession);

    expect(result.availableYears).toEqual([]);
  });

  it('throws NotFoundException when downloading IRP5 PDF with malformed ID', async () => {
    const res = {
      set: jest.fn(),
      send: jest.fn(),
    } as unknown as import('express').Response;

    await expect(
      controller.downloadIRP5Pdf(mockSession, 'irp5-2025-001', res),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------

describe('StaffPortalController — dashboard leave balance', () => {
  let controller: StaffPortalController;

  beforeEach(async () => {
    jest.clearAllMocks();
    controller = await buildModule();
    mockPrisma.staff.findUnique.mockResolvedValue({
      position: 'Teacher',
      department: null,
      startDate: new Date('2023-03-15'),
      isActive: true,
      employeeNumber: 'EMP001',
      simplePayMapping: null,
    });
  });

  it('populates leaveBalance.annual from SimplePay balance', async () => {
    mockSimplePayLeaveService.getLeaveBalancesByStaff.mockResolvedValue([
      {
        ...mockSpBalance,
        leave_type_name: 'Annual Leave',
        current_balance: 12,
        taken: 3,
      },
    ]);

    const result = await controller.getDashboard(mockSession);

    expect(result.leaveBalance.annual).toBe(12);
    expect(result.leaveBalance.annualUsed).toBe(3);
  });

  it('falls back to BCEA statutory minimums when SimplePay throws', async () => {
    mockSimplePayLeaveService.getLeaveBalancesByStaff.mockRejectedValue(
      new Error('Not connected'),
    );

    const result = await controller.getDashboard(mockSession);

    // BCEA minimum annual leave is 15 days
    expect(result.leaveBalance.annual).toBe(15);
    expect(result.leaveBalance.sick).toBe(30);
    expect(result.leaveBalance.family).toBe(3);
  });
});
