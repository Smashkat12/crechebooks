/**
 * Staff Created Handler Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 * TASK-SPAY-010: Auto-add SA statutory calculations
 *
 * Unit tests for the StaffCreatedHandler which handles
 * automatic SimplePay employee setup when staff is created.
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  StaffCreatedHandler,
  StaffCreatedEvent,
} from '../../../src/integrations/simplepay/handlers/staff-created.handler';
import { SimplePayRepository } from '../../../src/database/repositories/simplepay.repository';
import { SimplePayEmployeeSetupService } from '../../../src/integrations/simplepay/simplepay-employee-setup.service';
import { SA_PAYROLL_CODES } from '../../../src/database/entities/calculation.entity';

describe('StaffCreatedHandler', () => {
  let handler: StaffCreatedHandler;
  let simplePayRepo: jest.Mocked<SimplePayRepository>;
  let setupService: jest.Mocked<SimplePayEmployeeSetupService>;

  const mockSimplePayRepo = {
    findConnection: jest.fn(),
    createConnection: jest.fn(),
    findEmployeeMapping: jest.fn(),
    createEmployeeMapping: jest.fn(),
  };

  const mockSetupService = {
    setupEmployeeComprehensive: jest.fn(),
    retrySetup: jest.fn(),
    getSetupStatus: jest.fn(),
    getSetupStatistics: jest.fn(),
  };

  const createTestEvent = (
    overrides: Partial<StaffCreatedEvent> = {},
  ): StaffCreatedEvent => ({
    tenantId: 'tenant-123',
    staffId: 'staff-456',
    firstName: 'Thabo',
    lastName: 'Modise',
    employmentType: 'PERMANENT',
    position: 'TEACHER',
    createdBy: 'user-789',
    ...overrides,
  });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffCreatedHandler,
        {
          provide: SimplePayRepository,
          useValue: mockSimplePayRepo,
        },
        {
          provide: SimplePayEmployeeSetupService,
          useValue: mockSetupService,
        },
      ],
    }).compile();

    handler = module.get<StaffCreatedHandler>(StaffCreatedHandler);
    simplePayRepo = module.get(SimplePayRepository);
    setupService = module.get(SimplePayEmployeeSetupService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });
  });

  describe('handleStaffCreated', () => {
    describe('when SimplePay connection exists and is active', () => {
      beforeEach(() => {
        mockSimplePayRepo.findConnection.mockResolvedValue({
          id: 'conn-123',
          tenantId: 'tenant-123',
          clientId: 'client-456',
          isActive: true,
        });
      });

      it('should trigger comprehensive setup with statutory calculations', async () => {
        mockSetupService.setupEmployeeComprehensive.mockResolvedValue({
          success: true,
          setupLogId: 'log-123',
          staffId: 'staff-456',
          simplePayEmployeeId: 'sp-emp-789',
          status: 'COMPLETED',
          stepsCompleted: 8,
          stepsFailed: 0,
          profileAssigned: 'Full-Time Teacher',
          leaveInitialized: true,
          taxConfigured: true,
          calculationsAdded: 4,
          errors: [],
          warnings: [],
          durationMs: 5000,
        });

        const event = createTestEvent();
        await handler.handleStaffCreated(event);

        expect(
          mockSetupService.setupEmployeeComprehensive,
        ).toHaveBeenCalledWith('tenant-123', {
          staffId: 'staff-456',
          triggeredBy: 'auto:staff.created:user-789',
          additionalCalculations: expect.arrayContaining([
            expect.objectContaining({
              code: SA_PAYROLL_CODES.PAYE,
              name: 'PAYE (Pay As You Earn)',
              type: 'DEDUCTION',
            }),
            expect.objectContaining({
              code: SA_PAYROLL_CODES.UIF_EMPLOYEE,
              name: 'UIF Employee Contribution',
              type: 'DEDUCTION',
            }),
            expect.objectContaining({
              code: SA_PAYROLL_CODES.UIF_EMPLOYER,
              name: 'UIF Employer Contribution',
              type: 'COMPANY_CONTRIBUTION',
            }),
            expect.objectContaining({
              code: SA_PAYROLL_CODES.SDL,
              name: 'Skills Development Levy',
              type: 'COMPANY_CONTRIBUTION',
            }),
          ]),
        });
      });

      it('should include 4 SA statutory calculations', async () => {
        mockSetupService.setupEmployeeComprehensive.mockResolvedValue({
          success: true,
          setupLogId: 'log-123',
          staffId: 'staff-456',
          simplePayEmployeeId: 'sp-emp-789',
          status: 'COMPLETED',
          stepsCompleted: 8,
          stepsFailed: 0,
          profileAssigned: null,
          leaveInitialized: false,
          taxConfigured: false,
          calculationsAdded: 4,
          errors: [],
          warnings: [],
          durationMs: 5000,
        });

        const event = createTestEvent();
        await handler.handleStaffCreated(event);

        const callArgs =
          mockSetupService.setupEmployeeComprehensive.mock.calls[0][1];
        expect(callArgs.additionalCalculations).toHaveLength(4);
      });

      it('should handle partial setup success', async () => {
        mockSetupService.setupEmployeeComprehensive.mockResolvedValue({
          success: false,
          setupLogId: 'log-123',
          staffId: 'staff-456',
          simplePayEmployeeId: 'sp-emp-789',
          status: 'PARTIAL',
          stepsCompleted: 5,
          stepsFailed: 3,
          profileAssigned: 'Full-Time Teacher',
          leaveInitialized: false,
          taxConfigured: false,
          calculationsAdded: 0,
          errors: [
            {
              step: 'setup_leave',
              code: 'API_ERROR',
              message: 'Leave setup failed',
              details: {},
              timestamp: new Date().toISOString(),
            },
          ],
          warnings: [],
          durationMs: 3000,
        });

        const event = createTestEvent();

        // Should not throw, just log warning
        await expect(handler.handleStaffCreated(event)).resolves.not.toThrow();
      });

      it('should not throw if setup service throws', async () => {
        mockSetupService.setupEmployeeComprehensive.mockRejectedValue(
          new Error('Unexpected error'),
        );

        const event = createTestEvent();

        // Should catch error and not throw
        await expect(handler.handleStaffCreated(event)).resolves.not.toThrow();
      });
    });

    describe('when SimplePay connection does not exist', () => {
      it('should skip setup when no connection found', async () => {
        mockSimplePayRepo.findConnection.mockResolvedValue(null);

        const event = createTestEvent();
        await handler.handleStaffCreated(event);

        expect(
          mockSetupService.setupEmployeeComprehensive,
        ).not.toHaveBeenCalled();
      });
    });

    describe('when SimplePay connection is inactive', () => {
      it('should skip setup when connection is inactive', async () => {
        mockSimplePayRepo.findConnection.mockResolvedValue({
          id: 'conn-123',
          tenantId: 'tenant-123',
          clientId: 'client-456',
          isActive: false,
        });

        const event = createTestEvent();
        await handler.handleStaffCreated(event);

        expect(
          mockSetupService.setupEmployeeComprehensive,
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleSetupCompleted', () => {
    it('should handle setup completed event', () => {
      const event = {
        tenantId: 'tenant-123',
        staffId: 'staff-456',
        simplePayEmployeeId: 'sp-emp-789',
        profileAssigned: 'Full-Time Teacher',
        setupLogId: 'log-123',
        triggeredBy: 'auto:staff.created:user-789',
      };

      // Should not throw
      expect(() => handler.handleSetupCompleted(event)).not.toThrow();
    });

    it('should handle event with null values', () => {
      const event = {
        tenantId: 'tenant-123',
        staffId: 'staff-456',
        simplePayEmployeeId: null,
        profileAssigned: null,
        setupLogId: 'log-123',
        triggeredBy: 'auto:staff.created:user-789',
      };

      expect(() => handler.handleSetupCompleted(event)).not.toThrow();
    });
  });

  describe('handleSetupFailed', () => {
    it('should handle setup failed event', () => {
      const event = {
        tenantId: 'tenant-123',
        staffId: 'staff-456',
        setupLogId: 'log-123',
        triggeredBy: 'auto:staff.created:user-789',
        errors: [
          {
            step: 'create_employee',
            code: 'API_ERROR',
            message: 'SimplePay API unavailable',
          },
        ],
      };

      // Should not throw
      expect(() => handler.handleSetupFailed(event)).not.toThrow();
    });

    it('should handle event with multiple errors', () => {
      const event = {
        tenantId: 'tenant-123',
        staffId: 'staff-456',
        setupLogId: 'log-123',
        triggeredBy: 'auto:staff.created:user-789',
        errors: [
          {
            step: 'create_employee',
            code: 'ERROR_1',
            message: 'First error',
          },
          {
            step: 'assign_profile',
            code: 'ERROR_2',
            message: 'Second error',
          },
          {
            step: 'setup_leave',
            code: 'ERROR_3',
            message: 'Third error',
          },
        ],
      };

      expect(() => handler.handleSetupFailed(event)).not.toThrow();
    });

    it('should handle event with empty errors array', () => {
      const event = {
        tenantId: 'tenant-123',
        staffId: 'staff-456',
        setupLogId: 'log-123',
        triggeredBy: 'auto:staff.created:user-789',
        errors: [],
      };

      expect(() => handler.handleSetupFailed(event)).not.toThrow();
    });
  });

  describe('SA Statutory Calculations', () => {
    beforeEach(() => {
      mockSimplePayRepo.findConnection.mockResolvedValue({
        id: 'conn-123',
        tenantId: 'tenant-123',
        clientId: 'client-456',
        isActive: true,
      });
    });

    it('should include PAYE calculation', async () => {
      mockSetupService.setupEmployeeComprehensive.mockResolvedValue({
        success: true,
        setupLogId: 'log-123',
        staffId: 'staff-456',
        simplePayEmployeeId: 'sp-emp-789',
        status: 'COMPLETED',
        stepsCompleted: 8,
        stepsFailed: 0,
        profileAssigned: null,
        leaveInitialized: false,
        taxConfigured: false,
        calculationsAdded: 4,
        errors: [],
        warnings: [],
        durationMs: 5000,
      });

      const event = createTestEvent();
      await handler.handleStaffCreated(event);

      const callArgs =
        mockSetupService.setupEmployeeComprehensive.mock.calls[0][1];
      const paye = callArgs.additionalCalculations.find(
        (c: { code: string }) => c.code === SA_PAYROLL_CODES.PAYE,
      );

      expect(paye).toBeDefined();
      expect(paye.type).toBe('DEDUCTION');
      expect(paye.isRecurring).toBe(true);
      expect(paye.amountCents).toBeNull(); // Auto-calculated
    });

    it('should include UIF Employee and Employer calculations', async () => {
      mockSetupService.setupEmployeeComprehensive.mockResolvedValue({
        success: true,
        setupLogId: 'log-123',
        staffId: 'staff-456',
        simplePayEmployeeId: 'sp-emp-789',
        status: 'COMPLETED',
        stepsCompleted: 8,
        stepsFailed: 0,
        profileAssigned: null,
        leaveInitialized: false,
        taxConfigured: false,
        calculationsAdded: 4,
        errors: [],
        warnings: [],
        durationMs: 5000,
      });

      const event = createTestEvent();
      await handler.handleStaffCreated(event);

      const callArgs =
        mockSetupService.setupEmployeeComprehensive.mock.calls[0][1];
      const uifEmployee = callArgs.additionalCalculations.find(
        (c: { code: string }) => c.code === SA_PAYROLL_CODES.UIF_EMPLOYEE,
      );
      const uifEmployer = callArgs.additionalCalculations.find(
        (c: { code: string }) => c.code === SA_PAYROLL_CODES.UIF_EMPLOYER,
      );

      expect(uifEmployee).toBeDefined();
      expect(uifEmployee.type).toBe('DEDUCTION');

      expect(uifEmployer).toBeDefined();
      expect(uifEmployer.type).toBe('COMPANY_CONTRIBUTION');
    });

    it('should include SDL calculation', async () => {
      mockSetupService.setupEmployeeComprehensive.mockResolvedValue({
        success: true,
        setupLogId: 'log-123',
        staffId: 'staff-456',
        simplePayEmployeeId: 'sp-emp-789',
        status: 'COMPLETED',
        stepsCompleted: 8,
        stepsFailed: 0,
        profileAssigned: null,
        leaveInitialized: false,
        taxConfigured: false,
        calculationsAdded: 4,
        errors: [],
        warnings: [],
        durationMs: 5000,
      });

      const event = createTestEvent();
      await handler.handleStaffCreated(event);

      const callArgs =
        mockSetupService.setupEmployeeComprehensive.mock.calls[0][1];
      const sdl = callArgs.additionalCalculations.find(
        (c: { code: string }) => c.code === SA_PAYROLL_CODES.SDL,
      );

      expect(sdl).toBeDefined();
      expect(sdl.name).toBe('Skills Development Levy');
      expect(sdl.type).toBe('COMPANY_CONTRIBUTION');
      expect(sdl.isRecurring).toBe(true);
    });
  });
});
