/**
 * Assign Profile Step Tests
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Unit tests for the AssignProfileStep which assigns
 * SimplePay profiles based on staff role and employment type.
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AssignProfileStep } from '../../../src/integrations/simplepay/setup-pipeline/steps/assign-profile.step';
import { ProfileSelector } from '../../../src/integrations/simplepay/setup-pipeline/profile-selector';
import { SimplePayProfileService } from '../../../src/integrations/simplepay/simplepay-profile.service';
import {
  PipelineStep,
  SetupPipelineContext,
  SetupStepStatus,
  createInitialStepResults,
} from '../../../src/database/entities/employee-setup-log.entity';

describe('AssignProfileStep', () => {
  let step: AssignProfileStep;

  const mockProfileSelector = {
    selectProfile: jest.fn(),
    selectProfileWithId: jest.fn(),
    getProfileId: jest.fn(),
    normalizeRole: jest.fn(),
    normalizeEmploymentType: jest.fn(),
    getAvailableProfiles: jest.fn(),
  };

  const mockProfileService = {
    assignProfile: jest.fn(),
    removeProfileMapping: jest.fn(),
    getAvailableProfiles: jest.fn(),
    getEmployeeProfileMappings: jest.fn(),
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
      basicSalaryCents: 1500000,
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
        AssignProfileStep,
        {
          provide: ProfileSelector,
          useValue: mockProfileSelector,
        },
        {
          provide: SimplePayProfileService,
          useValue: mockProfileService,
        },
      ],
    }).compile();

    step = module.get<AssignProfileStep>(AssignProfileStep);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(step).toBeDefined();
    });

    it('should have correct name', () => {
      expect(step.name).toBe(PipelineStep.ASSIGN_PROFILE);
    });

    it('should have description', () => {
      expect(step.description).toBe('Assign appropriate profile based on role');
    });
  });

  describe('shouldSkip', () => {
    it('should never skip - profiles always need assignment', () => {
      const context = createTestContext();

      expect(step.shouldSkip(context)).toBe(false);
    });

    it('should not skip even with existing profile ID', () => {
      const context = createTestContext({ profileId: 123 });

      expect(step.shouldSkip(context)).toBe(false);
    });
  });

  describe('execute - auto-select profile', () => {
    it('should auto-select profile based on role when no profileId provided', async () => {
      mockProfileSelector.selectProfileWithId.mockReturnValue({
        profileName: 'Full-Time Teacher',
        profileId: 380795,
        confidence: 0.95,
        matchedRule: {
          role: 'TEACHER',
          employmentType: 'PERMANENT',
          profileName: 'Full-Time Teacher',
          priority: 2,
        },
      });

      mockProfileService.assignProfile.mockResolvedValue({
        success: true,
        simplePayMappingId: 12345,
        profileName: 'Full-Time Teacher',
      });

      const context = createTestContext();
      const result = await step.execute(context);

      expect(result).toBe(true);
      expect(mockProfileSelector.selectProfileWithId).toHaveBeenCalledWith(
        'TEACHER',
        'PERMANENT',
      );
      expect(context.profileId).toBe(380795);
      expect(context.profileName).toBe('Full-Time Teacher');
    });

    it('should use provided profileId when available', async () => {
      mockProfileService.assignProfile.mockResolvedValue({
        success: true,
        simplePayMappingId: 12345,
        profileName: 'Principal/Manager',
      });

      const context = createTestContext({ profileId: 380797 });
      const result = await step.execute(context);

      expect(result).toBe(true);
      expect(mockProfileSelector.selectProfileWithId).not.toHaveBeenCalled();
      expect(mockProfileService.assignProfile).toHaveBeenCalledWith(
        'tenant-123',
        {
          staffId: 'staff-123',
          profileId: 380797,
        },
      );
    });

    it('should fall back to General Staff when profile ID not configured', async () => {
      mockProfileSelector.selectProfileWithId.mockReturnValue({
        profileName: 'Custom Profile',
        profileId: null, // Not configured
        confidence: 0.5,
        matchedRule: {
          role: 'OTHER',
          employmentType: 'PERMANENT',
          profileName: 'Custom Profile',
          priority: 50,
        },
      });

      mockProfileSelector.getProfileId.mockReturnValue(380792); // General Staff

      mockProfileService.assignProfile.mockResolvedValue({
        success: true,
        simplePayMappingId: 12345,
        profileName: 'General Staff',
      });

      const context = createTestContext({
        staff: {
          ...createTestContext().staff,
          position: 'Random Position',
        },
      });

      const result = await step.execute(context);

      expect(result).toBe(true);
      expect(context.warnings).toHaveLength(2);
      expect(context.warnings[0].code).toBe('PROFILE_NOT_CONFIGURED');
      expect(context.warnings[1].code).toBe('PROFILE_FALLBACK_TO_GENERAL');
    });
  });

  describe('execute - error handling', () => {
    it('should fail when no profiles configured at all', async () => {
      mockProfileSelector.selectProfileWithId.mockReturnValue({
        profileName: 'Custom Profile',
        profileId: null,
        confidence: 0.5,
        matchedRule: {
          role: 'OTHER',
          employmentType: 'PERMANENT',
          profileName: 'Custom Profile',
          priority: 50,
        },
      });

      mockProfileSelector.getProfileId.mockReturnValue(null); // No fallback

      const context = createTestContext();
      const result = await step.execute(context);

      expect(result).toBe(false);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].code).toBe('ASSIGN_PROFILE_FAILED');
    });

    it('should fail when profile assignment API fails', async () => {
      mockProfileSelector.selectProfileWithId.mockReturnValue({
        profileName: 'Full-Time Teacher',
        profileId: 380795,
        confidence: 0.95,
        matchedRule: {
          role: 'TEACHER',
          employmentType: 'PERMANENT',
          profileName: 'Full-Time Teacher',
          priority: 2,
        },
      });

      mockProfileService.assignProfile.mockResolvedValue({
        success: false,
        error: 'SimplePay API unavailable',
      });

      const context = createTestContext();
      const result = await step.execute(context);

      expect(result).toBe(false);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain('SimplePay API unavailable');
    });

    it('should handle exception during assignment', async () => {
      mockProfileSelector.selectProfileWithId.mockReturnValue({
        profileName: 'Full-Time Teacher',
        profileId: 380795,
        confidence: 0.95,
        matchedRule: {
          role: 'TEACHER',
          employmentType: 'PERMANENT',
          profileName: 'Full-Time Teacher',
          priority: 2,
        },
      });

      mockProfileService.assignProfile.mockRejectedValue(
        new Error('Network timeout'),
      );

      const context = createTestContext();
      const result = await step.execute(context);

      expect(result).toBe(false);
      expect(context.errors).toHaveLength(1);
      expect(context.errors[0].message).toContain('Network timeout');
    });
  });

  describe('execute - step result update', () => {
    it('should update step result with assignment details', async () => {
      mockProfileSelector.selectProfileWithId.mockReturnValue({
        profileName: 'Full-Time Teacher',
        profileId: 380795,
        confidence: 0.95,
        matchedRule: {
          role: 'TEACHER',
          employmentType: 'PERMANENT',
          profileName: 'Full-Time Teacher',
          priority: 2,
        },
      });

      mockProfileService.assignProfile.mockResolvedValue({
        success: true,
        simplePayMappingId: 67890,
        profileName: 'Full-Time Teacher',
      });

      const context = createTestContext();
      await step.execute(context);

      const stepResult = context.stepResults.find(
        (s) => s.step === PipelineStep.ASSIGN_PROFILE,
      );

      expect(stepResult?.details).toEqual({
        profileId: 380795,
        profileName: 'Full-Time Teacher',
        mappingId: 67890,
      });
      expect(stepResult?.canRollback).toBe(true);
      expect(stepResult?.rollbackData).toEqual({
        mappingId: 67890,
      });
    });
  });

  describe('rollback', () => {
    it('should remove profile mapping on rollback', async () => {
      mockProfileService.removeProfileMapping.mockResolvedValue({
        success: true,
      });

      const context = createTestContext();
      const stepResult = context.stepResults.find(
        (s) => s.step === PipelineStep.ASSIGN_PROFILE,
      );
      if (stepResult) {
        stepResult.rollbackData = { mappingId: 67890 };
      }

      const result = await step.rollback(context);

      expect(result).toBe(true);
      expect(mockProfileService.removeProfileMapping).toHaveBeenCalledWith(
        'tenant-123',
        'staff-123',
        67890,
      );
    });

    it('should return true if no rollback data', async () => {
      const context = createTestContext();

      const result = await step.rollback(context);

      expect(result).toBe(true);
      expect(mockProfileService.removeProfileMapping).not.toHaveBeenCalled();
    });

    it('should return false if rollback fails', async () => {
      mockProfileService.removeProfileMapping.mockRejectedValue(
        new Error('Rollback failed'),
      );

      const context = createTestContext();
      const stepResult = context.stepResults.find(
        (s) => s.step === PipelineStep.ASSIGN_PROFILE,
      );
      if (stepResult) {
        stepResult.rollbackData = { mappingId: 67890 };
      }

      const result = await step.rollback(context);

      expect(result).toBe(false);
    });
  });

  describe('profile selection for different roles', () => {
    const testCases = [
      {
        position: 'Principal',
        employmentType: 'PERMANENT',
        expectedProfile: 'Principal/Manager',
        profileId: 380797,
      },
      {
        position: 'Teacher',
        employmentType: 'PERMANENT',
        expectedProfile: 'Full-Time Teacher',
        profileId: 380795,
      },
      {
        position: 'Teacher',
        employmentType: 'CONTRACT',
        expectedProfile: 'Part-Time Teacher',
        profileId: 380796,
      },
      {
        position: 'Assistant',
        employmentType: 'PERMANENT',
        expectedProfile: 'Part-Time Teacher',
        profileId: 380796,
      },
      {
        position: 'Cook',
        employmentType: 'PERMANENT',
        expectedProfile: 'General Staff',
        profileId: 380792,
      },
      {
        position: 'Cleaner',
        employmentType: 'CASUAL',
        expectedProfile: 'General Staff',
        profileId: 380792,
      },
    ];

    testCases.forEach(
      ({ position, employmentType, expectedProfile, profileId }) => {
        it(`should select ${expectedProfile} for ${position} (${employmentType})`, async () => {
          mockProfileSelector.selectProfileWithId.mockReturnValue({
            profileName: expectedProfile,
            profileId,
            confidence: 0.95,
            matchedRule: {
              role: position.toUpperCase(),
              employmentType,
              profileName: expectedProfile,
              priority: 1,
            },
          });

          mockProfileService.assignProfile.mockResolvedValue({
            success: true,
            simplePayMappingId: 12345,
            profileName: expectedProfile,
          });

          const context = createTestContext({
            staff: {
              ...createTestContext().staff,
              position,
              employmentType,
            },
          });

          const result = await step.execute(context);

          expect(result).toBe(true);
          expect(mockProfileSelector.selectProfileWithId).toHaveBeenCalledWith(
            position,
            employmentType,
          );
        });
      },
    );
  });
});
