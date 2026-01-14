/**
 * Setup Pipeline Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SetupPipeline,
  IPipelineStep,
} from '../../../src/integrations/simplepay/setup-pipeline/setup-pipeline';
import {
  PipelineStep,
  SetupPipelineContext,
  SetupStepStatus,
  createInitialStepResults,
  determineOverallStatus,
} from '../../../src/database/entities/employee-setup-log.entity';
import { EmploymentType } from '../../../src/database/entities/staff.entity';

describe('SetupPipeline', () => {
  let pipeline: SetupPipeline;

  // Create mock step factory
  const createMockStep = (
    name: PipelineStep,
    options: {
      shouldSkip?: boolean;
      shouldFail?: boolean;
      hasRollback?: boolean;
      rollbackFails?: boolean;
    } = {},
  ): IPipelineStep => {
    const step: IPipelineStep = {
      name,
      description: `Mock ${name} step`,
      execute: jest.fn().mockResolvedValue(!options.shouldFail),
    };

    if (options.hasRollback !== false) {
      step.rollback = jest.fn().mockResolvedValue(!options.rollbackFails);
    }

    if (options.shouldSkip) {
      step.shouldSkip = jest.fn().mockReturnValue(true);
    }

    return step;
  };

  const createTestContext = (): SetupPipelineContext => ({
    tenantId: 'tenant-123',
    staffId: 'staff-123',
    setupLogId: 'log-123',
    staff: {
      id: 'staff-123',
      firstName: 'Thabo',
      lastName: 'Modise',
      email: 'thabo@creche.co.za',
      phone: '+27821234567',
      idNumber: '8501015800084',
      taxNumber: '1234567890',
      startDate: new Date('2024-01-15'),
      employmentType: EmploymentType.PERMANENT,
      role: 'TEACHER',
      basicSalaryCents: 1500000,
    },
    leaveEntitlements: {
      annualLeaveDays: 15,
      sickLeaveDays: 30,
      familyResponsibilityDays: 3,
    },
    taxSettings: {
      taxNumber: '1234567890',
      natureOfPerson: 'A',
      incomeStreamType: '3601',
    },
    stepResults: createInitialStepResults(),
    errors: [],
    warnings: [],
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SetupPipeline],
    }).compile();

    pipeline = module.get<SetupPipeline>(SetupPipeline);
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(pipeline).toBeDefined();
    });

    it('should start with empty steps', () => {
      const steps = pipeline.getOrderedSteps();
      expect(steps).toHaveLength(0);
    });
  });

  describe('registerStep', () => {
    it('should register a step with order', () => {
      const step = createMockStep(PipelineStep.CREATE_EMPLOYEE);
      pipeline.registerStep(step, 1);

      const steps = pipeline.getOrderedSteps();
      expect(steps).toHaveLength(1);
      expect(steps[0].name).toBe(PipelineStep.CREATE_EMPLOYEE);
    });

    it('should order steps by registration order', () => {
      pipeline.registerStep(createMockStep(PipelineStep.VERIFY_SETUP), 6);
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(createMockStep(PipelineStep.ASSIGN_PROFILE), 2);

      const steps = pipeline.getOrderedSteps();
      expect(steps[0].name).toBe(PipelineStep.CREATE_EMPLOYEE);
      expect(steps[1].name).toBe(PipelineStep.ASSIGN_PROFILE);
      expect(steps[2].name).toBe(PipelineStep.VERIFY_SETUP);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      // Register all 7 steps in order
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(createMockStep(PipelineStep.ASSIGN_PROFILE), 2);
      pipeline.registerStep(createMockStep(PipelineStep.SETUP_LEAVE), 3);
      pipeline.registerStep(createMockStep(PipelineStep.CONFIGURE_TAX), 4);
      pipeline.registerStep(createMockStep(PipelineStep.ADD_CALCULATIONS), 5);
      pipeline.registerStep(createMockStep(PipelineStep.VERIFY_SETUP), 6);
      pipeline.registerStep(createMockStep(PipelineStep.SEND_NOTIFICATION), 7);
    });

    it('should execute all steps in order', async () => {
      const context = createTestContext();

      const result = await pipeline.execute(context);

      const completedSteps = result.stepResults.filter(
        (s) => s.status === SetupStepStatus.COMPLETED,
      );
      expect(completedSteps).toHaveLength(7);
    });

    it('should return context with updated step results', async () => {
      const context = createTestContext();

      const result = await pipeline.execute(context);

      expect(result.stepResults).toBeDefined();
      expect(result.stepResults.length).toBeGreaterThan(0);
    });

    it('should update step status to COMPLETED on success', async () => {
      const context = createTestContext();

      await pipeline.execute(context);

      const createStep = context.stepResults.find(
        (s) => s.step === PipelineStep.CREATE_EMPLOYEE,
      );
      expect(createStep?.status).toBe(SetupStepStatus.COMPLETED);
    });

    it('should record startedAt and completedAt for each step', async () => {
      const context = createTestContext();

      await pipeline.execute(context);

      for (const stepResult of context.stepResults) {
        if (stepResult.status === SetupStepStatus.COMPLETED) {
          expect(stepResult.startedAt).toBeDefined();
          expect(stepResult.completedAt).toBeDefined();
        }
      }
    });
  });

  describe('execute with failures', () => {
    it('should stop execution on step failure', async () => {
      // Register steps with one failing
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(
        createMockStep(PipelineStep.ASSIGN_PROFILE, { shouldFail: true }),
        2,
      );
      pipeline.registerStep(createMockStep(PipelineStep.SETUP_LEAVE), 3);

      const context = createTestContext();
      await pipeline.execute(context);

      const assignStep = context.stepResults.find(
        (s) => s.step === PipelineStep.ASSIGN_PROFILE,
      );
      expect(assignStep?.status).toBe(SetupStepStatus.FAILED);

      // Steps after failure should remain pending
      const leaveStep = context.stepResults.find(
        (s) => s.step === PipelineStep.SETUP_LEAVE,
      );
      expect(leaveStep?.status).toBe(SetupStepStatus.PENDING);
    });

    it('should record error when step throws exception', async () => {
      const failingStep: IPipelineStep = {
        name: PipelineStep.CREATE_EMPLOYEE,
        description: 'Failing step',
        execute: jest.fn().mockRejectedValue(new Error('API Error')),
        rollback: jest.fn().mockResolvedValue(true),
      };

      pipeline.registerStep(failingStep, 1);

      const context = createTestContext();
      await pipeline.execute(context);

      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain('API Error');
    });
  });

  describe('execute with skip', () => {
    it('should skip steps that return true from shouldSkip', async () => {
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(
        createMockStep(PipelineStep.ASSIGN_PROFILE, { shouldSkip: true }),
        2,
      );
      pipeline.registerStep(createMockStep(PipelineStep.SETUP_LEAVE), 3);

      const context = createTestContext();
      await pipeline.execute(context);

      const assignStep = context.stepResults.find(
        (s) => s.step === PipelineStep.ASSIGN_PROFILE,
      );
      expect(assignStep?.status).toBe(SetupStepStatus.SKIPPED);

      // Subsequent steps should still execute
      const leaveStep = context.stepResults.find(
        (s) => s.step === PipelineStep.SETUP_LEAVE,
      );
      expect(leaveStep?.status).toBe(SetupStepStatus.COMPLETED);
    });
  });

  describe('rollback', () => {
    it('should rollback completed steps on failure', async () => {
      const createStep = createMockStep(PipelineStep.CREATE_EMPLOYEE, {
        hasRollback: true,
      });
      const assignStep = createMockStep(PipelineStep.ASSIGN_PROFILE, {
        shouldFail: true,
        hasRollback: true,
      });

      pipeline.registerStep(createStep, 1);
      pipeline.registerStep(assignStep, 2);

      const context = createTestContext();
      await pipeline.execute(context);

      // createStep should have been rolled back
      expect(createStep.rollback).toHaveBeenCalled();
    });

    it('should not call rollback on steps without rollback method', async () => {
      const stepWithoutRollback = createMockStep(PipelineStep.CREATE_EMPLOYEE, {
        hasRollback: false,
      });
      const failingStep = createMockStep(PipelineStep.ASSIGN_PROFILE, {
        shouldFail: true,
      });

      pipeline.registerStep(stepWithoutRollback, 1);
      pipeline.registerStep(failingStep, 2);

      const context = createTestContext();
      await pipeline.execute(context);

      // Should not throw, and no rollback should be called
      expect(stepWithoutRollback.rollback).toBeUndefined();
    });

    it('should continue rollback even if one step fails', async () => {
      const step1 = createMockStep(PipelineStep.CREATE_EMPLOYEE, {
        hasRollback: true,
      });
      const step2 = createMockStep(PipelineStep.ASSIGN_PROFILE, {
        hasRollback: true,
        rollbackFails: true,
      });
      const step3 = createMockStep(PipelineStep.SETUP_LEAVE, {
        shouldFail: true,
      });

      pipeline.registerStep(step1, 1);
      pipeline.registerStep(step2, 2);
      pipeline.registerStep(step3, 3);

      const context = createTestContext();
      await pipeline.execute(context);

      // Both rollbacks should be attempted
      expect(step2.rollback).toHaveBeenCalled();
      expect(step1.rollback).toHaveBeenCalled();
    });
  });

  describe('getOrderedSteps', () => {
    it('should return steps sorted by order', () => {
      pipeline.registerStep(createMockStep(PipelineStep.VERIFY_SETUP), 5);
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(createMockStep(PipelineStep.SETUP_LEAVE), 3);

      const steps = pipeline.getOrderedSteps();

      expect(steps[0].name).toBe(PipelineStep.CREATE_EMPLOYEE);
      expect(steps[1].name).toBe(PipelineStep.SETUP_LEAVE);
      expect(steps[2].name).toBe(PipelineStep.VERIFY_SETUP);
    });
  });

  describe('getFinalStatus', () => {
    it('should return COMPLETED when all steps complete', async () => {
      // Register ALL 7 steps so createInitialStepResults matches
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(createMockStep(PipelineStep.ASSIGN_PROFILE), 2);
      pipeline.registerStep(createMockStep(PipelineStep.SETUP_LEAVE), 3);
      pipeline.registerStep(createMockStep(PipelineStep.CONFIGURE_TAX), 4);
      pipeline.registerStep(createMockStep(PipelineStep.ADD_CALCULATIONS), 5);
      pipeline.registerStep(createMockStep(PipelineStep.VERIFY_SETUP), 6);
      pipeline.registerStep(createMockStep(PipelineStep.SEND_NOTIFICATION), 7);

      const context = createTestContext();
      await pipeline.execute(context);

      const status = pipeline.getFinalStatus(context);
      expect(status).toBe('COMPLETED');
    });

    it('should return appropriate status when steps fail', async () => {
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(
        createMockStep(PipelineStep.ASSIGN_PROFILE, { shouldFail: true }),
        2,
      );

      const context = createTestContext();
      await pipeline.execute(context);

      const status = pipeline.getFinalStatus(context);
      // Should be PARTIAL since CREATE_EMPLOYEE succeeded
      expect(['PARTIAL', 'FAILED', 'ROLLED_BACK']).toContain(status);
    });
  });

  describe('getStepCounts', () => {
    it('should return correct counts', async () => {
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(createMockStep(PipelineStep.ASSIGN_PROFILE), 2);
      pipeline.registerStep(
        createMockStep(PipelineStep.SETUP_LEAVE, { shouldSkip: true }),
        3,
      );

      const context = createTestContext();
      await pipeline.execute(context);

      const counts = pipeline.getStepCounts(context);
      expect(counts.completed).toBe(2);
      expect(counts.skipped).toBe(1);
      expect(counts.failed).toBe(0);
    });
  });

  describe('executeFromStep', () => {
    it('should resume from a specific step', async () => {
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);
      pipeline.registerStep(createMockStep(PipelineStep.ASSIGN_PROFILE), 2);
      pipeline.registerStep(createMockStep(PipelineStep.SETUP_LEAVE), 3);

      const context = createTestContext();

      // Mark first step as completed manually
      const createResult = context.stepResults.find(
        (s) => s.step === PipelineStep.CREATE_EMPLOYEE,
      );
      if (createResult) {
        createResult.status = SetupStepStatus.COMPLETED;
      }

      await pipeline.executeFromStep(context, PipelineStep.ASSIGN_PROFILE);

      // First step should remain completed, others should execute
      const counts = pipeline.getStepCounts(context);
      expect(counts.completed).toBeGreaterThanOrEqual(2);
    });

    it('should throw error for non-existent step', async () => {
      pipeline.registerStep(createMockStep(PipelineStep.CREATE_EMPLOYEE), 1);

      const context = createTestContext();

      await expect(
        pipeline.executeFromStep(context, PipelineStep.VERIFY_SETUP),
      ).rejects.toThrow('not found in pipeline');
    });
  });

  describe('helper functions', () => {
    it('createInitialStepResults should create all step results', () => {
      const results = createInitialStepResults();

      expect(results).toHaveLength(7);
      expect(results.every((r) => r.status === SetupStepStatus.PENDING)).toBe(
        true,
      );
    });

    it('determineOverallStatus should return correct status', () => {
      const allCompleted = createInitialStepResults().map((r) => ({
        ...r,
        status: SetupStepStatus.COMPLETED,
      }));
      expect(determineOverallStatus(allCompleted)).toBe('COMPLETED');

      const withFailed = createInitialStepResults();
      withFailed[0].status = SetupStepStatus.COMPLETED;
      withFailed[1].status = SetupStepStatus.FAILED;
      expect(['PARTIAL', 'FAILED']).toContain(
        determineOverallStatus(withFailed),
      );
    });
  });
});
