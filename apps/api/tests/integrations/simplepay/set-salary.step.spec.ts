/**
 * Set Salary Step Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Unit tests for the SetSalaryStep which sets Basic Salary
 * via SimplePay bulk_input API.
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SetSalaryStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/set-salary.step';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import {
  PipelineStep,
  SetupPipelineContext,
  SetupStepStatus,
  createInitialStepResults,
} from '../../../src/database/entities/employee-setup-log.entity';

describe('SetSalaryStep', () => {
  let step: SetSalaryStep;

  const mockApiClient = {
    initializeForTenant: jest.fn().mockResolvedValue(undefined),
    getClientId: jest.fn().mockReturnValue('test-client-123'),
    post: jest.fn(),
    get: jest.fn(),
    patch: jest.fn(),
  };

  const createTestContext = (
    overrides: Partial<SetupPipelineContext> = {},
  ): SetupPipelineContext => ({
    tenantId: 'tenant-123',
    staffId: 'staff-123',
    staff: {
      firstName: 'Thabo',
      lastName: 'Modise',
      email: 'thabo@creche.co.za',
      phone: '+27821234567',
      idNumber: '8501015800084',
      taxNumber: '1234567890',
      dateOfBirth: new Date('1985-01-01'),
      startDate: new Date('2024-01-15'),
      endDate: null,
      employmentType: 'PERMANENT',
      position: 'TEACHER',
      payFrequency: 'MONTHLY',
      basicSalaryCents: 1500000, // R15,000
      bankName: null,
      bankAccount: null,
      bankBranchCode: null,
      paymentMethod: null,
    },
    setupLog: {
      id: 'log-123',
      tenantId: 'tenant-123',
      staffId: 'staff-123',
      simplePayEmployeeId: null,
      status: 'IN_PROGRESS',
      setupSteps: [],
      profileAssigned: null,
      leaveInitialized: false,
      taxConfigured: false,
      calculationsAdded: 0,
      triggeredBy: 'system',
      errors: null,
      warnings: null,
      startedAt: new Date(),
      completedAt: null,
    },
    simplePayEmployeeId: '12345',
    waveId: null,
    profileId: null,
    profileName: null,
    leaveEntitlements: null,
    taxSettings: null,
    additionalCalculations: [],
    stepResults: createInitialStepResults(),
    errors: [],
    warnings: [],
    ...overrides,
  });

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SetSalaryStep,
        {
          provide: SimplePayApiClient,
          useValue: mockApiClient,
        },
      ],
    }).compile();

    step = module.get<SetSalaryStep>(SetSalaryStep);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(step).toBeDefined();
    });

    it('should have correct name', () => {
      expect(step.name).toBe(PipelineStep.SET_SALARY);
    });

    it('should have description', () => {
      expect(step.description).toBe('Set Basic Salary in SimplePay');
    });
  });

  describe('shouldSkip', () => {
    it('should skip if no SimplePay employee ID', () => {
      const context = createTestContext({ simplePayEmployeeId: null });

      expect(step.shouldSkip(context)).toBe(true);
    });

    it('should not skip if SimplePay employee ID exists', () => {
      const context = createTestContext({ simplePayEmployeeId: '12345' });

      expect(step.shouldSkip(context)).toBe(false);
    });
  });

  describe('execute - success cases', () => {
    it('should set salary with object response format', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [{ index: 0, success: true, id: 12345 }],
        },
      });

      const context = createTestContext();

      // Execute with timer advancement
      const executePromise = step.execute(context);

      // Advance timers to handle retry delays
      await jest.advanceTimersByTimeAsync(2000);

      const result = await executePromise;

      expect(result).toBe(true);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/clients/test-client-123/bulk_input',
        {
          entities: [
            {
              id: '12345',
              attributes: {
                'calc.basic_salary.fixed_amount': '15000',
              },
            },
          ],
          validate_only: false,
        },
      );
    });

    it('should set salary with array response format', async () => {
      mockApiClient.post.mockResolvedValueOnce([
        { success: true, message: 'Updated successfully' },
      ]);

      const context = createTestContext();

      const executePromise = step.execute(context);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await executePromise;

      expect(result).toBe(true);
    });

    it('should update step result with correct details', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [],
        },
      });

      const context = createTestContext();

      const executePromise = step.execute(context);
      await jest.advanceTimersByTimeAsync(2000);

      await executePromise;

      const stepResult = context.stepResults.find(
        (s) => s.step === PipelineStep.SET_SALARY,
      );

      expect(stepResult?.details).toEqual({
        salaryCents: 1500000,
        salaryRands: 15000,
        simplePayEmployeeId: '12345',
        attributeUsed: 'calc.basic_salary.fixed_amount',
        responseFormat: 'object',
      });
      expect(stepResult?.canRollback).toBe(true);
    });

    it('should handle zero salary with warning', async () => {
      const context = createTestContext({
        staff: {
          ...createTestContext().staff,
          basicSalaryCents: 0,
        },
      });

      const result = await step.execute(context);

      expect(result).toBe(true);
      expect(context.warnings).toHaveLength(1);
      expect(context.warnings[0].code).toBe('NO_SALARY');
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('should handle null salary with warning', async () => {
      const context = createTestContext({
        staff: {
          ...createTestContext().staff,
          basicSalaryCents: null as unknown as number,
        },
      });

      const result = await step.execute(context);

      expect(result).toBe(true);
      expect(context.warnings).toHaveLength(1);
      expect(context.warnings[0].code).toBe('NO_SALARY');
    });
  });

  describe('execute - error handling', () => {
    it('should fail if no SimplePay employee ID', async () => {
      const context = createTestContext({ simplePayEmployeeId: null });

      const result = await step.execute(context);

      expect(result).toBe(false);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain(
        'SimplePay employee ID not found',
      );
    });

    it('should handle object response with failures', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        bulk_input: {
          processed: 1,
          successful: 0,
          failed: 1,
          results: [{ index: 0, success: false, error: 'Invalid amount' }],
          errors: [{ index: 0, error: 'Invalid amount' }],
        },
      });

      const context = createTestContext();

      const executePromise = step.execute(context);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await executePromise;

      expect(result).toBe(false);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain('Invalid amount');
    });

    it('should handle array response with failure', async () => {
      // Use a non-retryable error message (doesn't include 'not found', 'UNKNOWN EMPLOYEE', etc.)
      mockApiClient.post.mockResolvedValueOnce([
        { success: false, message: 'Invalid salary configuration' },
      ]);

      const context = createTestContext();

      const executePromise = step.execute(context);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await executePromise;

      expect(result).toBe(false);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain(
        'Invalid salary configuration',
      );
    });

    it('should not retry non-retryable errors (Invalid heading)', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Invalid heading'));

      const context = createTestContext();

      const executePromise = step.execute(context);
      await jest.advanceTimersByTimeAsync(2000);

      const result = await executePromise;

      expect(result).toBe(false);
      expect(mockApiClient.post).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('execute - retry logic', () => {
    it('should retry on UNKNOWN EMPLOYEE error', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('UNKNOWN EMPLOYEE'))
        .mockResolvedValueOnce({
          bulk_input: {
            processed: 1,
            successful: 1,
            failed: 0,
            results: [],
          },
        });

      const context = createTestContext();

      const executePromise = step.execute(context);

      // First attempt at 2s
      await jest.advanceTimersByTimeAsync(2000);
      // Second attempt at 4s
      await jest.advanceTimersByTimeAsync(4000);

      const result = await executePromise;

      expect(result).toBe(true);
      expect(mockApiClient.post).toHaveBeenCalledTimes(2);
    });

    it('should retry on not found error', async () => {
      mockApiClient.post
        .mockRejectedValueOnce(new Error('Employee not found'))
        .mockRejectedValueOnce(new Error('Employee not found'))
        .mockResolvedValueOnce({
          bulk_input: {
            processed: 1,
            successful: 1,
            failed: 0,
            results: [],
          },
        });

      const context = createTestContext();

      const executePromise = step.execute(context);

      // First attempt at 2s
      await jest.advanceTimersByTimeAsync(2000);
      // Second attempt at 4s
      await jest.advanceTimersByTimeAsync(4000);
      // Third attempt at 6s
      await jest.advanceTimersByTimeAsync(6000);

      const result = await executePromise;

      expect(result).toBe(true);
      expect(mockApiClient.post).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      mockApiClient.post.mockRejectedValue(new Error('UNKNOWN EMPLOYEE'));

      const context = createTestContext();

      const executePromise = step.execute(context);

      // All 3 attempts
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);
      await jest.advanceTimersByTimeAsync(6000);

      const result = await executePromise;

      expect(result).toBe(false);
      expect(mockApiClient.post).toHaveBeenCalledTimes(3);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].code).toBe('SET_SALARY_FAILED');
    });
  });

  describe('rollback', () => {
    it('should return true (salary cleanup handled by employee deletion)', async () => {
      const context = createTestContext();

      const result = await step.rollback(context);

      expect(result).toBe(true);
    });
  });

  describe('salary conversion', () => {
    it('should convert cents to Rands correctly', async () => {
      mockApiClient.post.mockResolvedValueOnce({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [],
        },
      });

      const context = createTestContext({
        staff: {
          ...createTestContext().staff,
          basicSalaryCents: 2500050, // R25,000.50
        },
      });

      const executePromise = step.execute(context);
      await jest.advanceTimersByTimeAsync(2000);

      await executePromise;

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entities: [
            {
              id: '12345',
              attributes: {
                'calc.basic_salary.fixed_amount': '25000.5',
              },
            },
          ],
        }),
      );
    });
  });
});
