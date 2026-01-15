/**
 * SimplePay Employee Setup Service
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Main service for comprehensive employee setup in SimplePay.
 * Orchestrates the complete setup pipeline including:
 * - Employee creation
 * - Profile assignment
 * - Leave initialization
 * - Tax configuration
 * - Additional calculations
 * - Verification
 * - Notification
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { EmployeeSetupLogRepository } from '../../database/repositories/employee-setup-log.repository';
import {
  SetupPipelineContext,
  EmployeeSetupRequest,
  EmployeeSetupResult,
  SetupStatusSummary,
  PipelineStep,
  SetupStatus,
  SetupStepStatus,
  calculateProgress,
  getCurrentStep,
  canRetrySetup,
  createInitialStepResults,
} from '../../database/entities/employee-setup-log.entity';
import { SetupPipeline } from './setup-pipeline/setup-pipeline';
import { ProfileSelector } from './setup-pipeline/profile-selector';
import { LeaveCalculator } from './setup-pipeline/leave-calculator';
import { CreateEmployeeStep } from './setup-pipeline/steps/create-employee.step';
import { AssignProfileStep } from './setup-pipeline/steps/assign-profile.step';
import { SetupLeaveStep } from './setup-pipeline/steps/setup-leave.step';
import { ConfigureTaxStep } from './setup-pipeline/steps/configure-tax.step';
import { AddCalculationsStep } from './setup-pipeline/steps/add-calculations.step';
import { VerifySetupStep } from './setup-pipeline/steps/verify-setup.step';
import { SendNotificationStep } from './setup-pipeline/steps/send-notification.step';

@Injectable()
export class SimplePayEmployeeSetupService implements OnModuleInit {
  private readonly logger = new Logger(SimplePayEmployeeSetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepo: StaffRepository,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly setupLogRepo: EmployeeSetupLogRepository,
    private readonly pipeline: SetupPipeline,
    private readonly profileSelector: ProfileSelector,
    private readonly leaveCalculator: LeaveCalculator,
    private readonly createEmployeeStep: CreateEmployeeStep,
    private readonly assignProfileStep: AssignProfileStep,
    private readonly setupLeaveStep: SetupLeaveStep,
    private readonly configureTaxStep: ConfigureTaxStep,
    private readonly addCalculationsStep: AddCalculationsStep,
    private readonly verifySetupStep: VerifySetupStep,
    private readonly sendNotificationStep: SendNotificationStep,
  ) {}

  /**
   * Initialize pipeline steps on module init
   */
  onModuleInit() {
    // Register steps in order
    this.pipeline.registerStep(this.createEmployeeStep, 1);
    this.pipeline.registerStep(this.assignProfileStep, 2);
    this.pipeline.registerStep(this.setupLeaveStep, 3);
    this.pipeline.registerStep(this.configureTaxStep, 4);
    this.pipeline.registerStep(this.addCalculationsStep, 5);
    this.pipeline.registerStep(this.verifySetupStep, 6);
    this.pipeline.registerStep(this.sendNotificationStep, 7);

    this.logger.log('Setup pipeline initialized with 7 steps');
  }

  /**
   * Execute comprehensive employee setup
   */
  async setupEmployeeComprehensive(
    tenantId: string,
    request: EmployeeSetupRequest,
  ): Promise<EmployeeSetupResult> {
    const startTime = Date.now();
    this.logger.log(
      `Starting comprehensive setup for staff ${request.staffId}`,
    );

    // Get staff details
    const staff = await this.staffRepo.findById(request.staffId, tenantId);
    if (!staff) {
      throw new Error(
        `Staff ${request.staffId} not found in tenant ${tenantId}`,
      );
    }

    // Check for existing setup
    const existingSetup = await this.setupLogRepo.findByStaffId(
      request.staffId,
    );
    if (existingSetup) {
      if (existingSetup.status === SetupStatus.COMPLETED) {
        throw new Error(
          `Staff ${request.staffId} already has a completed setup. Use retrySetup to re-run.`,
        );
      }
      // Delete incomplete setup to start fresh
      await this.setupLogRepo.delete(existingSetup.id, tenantId);
    }

    // Create setup log
    const setupLog = await this.setupLogRepo.create({
      tenantId,
      staffId: request.staffId,
      triggeredBy: request.triggeredBy,
      setupSteps: createInitialStepResults(),
    });

    // Mark as in progress
    await this.setupLogRepo.markInProgress(setupLog.id);

    // Check if SimplePay connection exists
    const connection = await this.simplePayRepo.findConnection(tenantId);
    if (!connection || !connection.isActive) {
      const error = 'SimplePay connection not configured or inactive';
      await this.setupLogRepo.markFailed(setupLog.id, {
        errors: [
          {
            step: PipelineStep.CREATE_EMPLOYEE,
            code: 'NO_CONNECTION',
            message: error,
            details: {},
            timestamp: new Date().toISOString(),
          },
        ],
      });
      return this.createErrorResult(
        setupLog.id,
        request.staffId,
        error,
        startTime,
      );
    }

    // Build context
    const context: SetupPipelineContext = {
      tenantId,
      staffId: request.staffId,
      staff: {
        firstName: staff.firstName,
        lastName: staff.lastName,
        idNumber: staff.idNumber,
        email: staff.email,
        phone: staff.phone,
        dateOfBirth: staff.dateOfBirth,
        startDate: staff.startDate,
        endDate: staff.endDate,
        employmentType: staff.employmentType,
        position: staff.position,
        payFrequency: staff.payFrequency || 'MONTHLY',
        basicSalaryCents: staff.basicSalaryCents,
        taxNumber: staff.taxNumber,
        bankName: staff.bankName,
        bankAccount: staff.bankAccount,
        bankBranchCode: staff.bankBranchCode,
        paymentMethod: staff.paymentMethod,
      },
      setupLog,
      simplePayEmployeeId: null,
      waveId: null,
      profileId: request.profileId || null,
      profileName: null,
      leaveEntitlements: request.leaveEntitlements || null,
      taxSettings: request.taxSettings || null,
      additionalCalculations: request.additionalCalculations || [],
      errors: [],
      warnings: [],
      stepResults: createInitialStepResults(),
    };

    try {
      // Execute pipeline
      const result = await this.pipeline.execute(context);

      // Determine final status
      const finalStatus = this.pipeline.getFinalStatus(result);
      const counts = this.pipeline.getStepCounts(result);

      // Update setup log based on result
      if (finalStatus === SetupStatus.COMPLETED) {
        await this.setupLogRepo.markCompleted(setupLog.id, {
          simplePayEmployeeId: result.simplePayEmployeeId || undefined,
          profileAssigned: result.profileName || undefined,
          leaveInitialized: !!result.leaveEntitlements,
          taxConfigured: !!result.taxSettings?.taxNumber,
          calculationsAdded: result.additionalCalculations?.length || 0,
          setupSteps: result.stepResults,
          warnings: result.warnings,
        });
      } else {
        await this.setupLogRepo.markFailed(setupLog.id, {
          simplePayEmployeeId: result.simplePayEmployeeId || undefined,
          profileAssigned: result.profileName || undefined,
          leaveInitialized: !!result.leaveEntitlements,
          taxConfigured: !!result.taxSettings?.taxNumber,
          calculationsAdded: result.additionalCalculations?.length || 0,
          setupSteps: result.stepResults,
          errors: result.errors,
          warnings: result.warnings,
        });
      }

      const setupResult: EmployeeSetupResult = {
        success: finalStatus === SetupStatus.COMPLETED,
        setupLogId: setupLog.id,
        staffId: request.staffId,
        simplePayEmployeeId: result.simplePayEmployeeId,
        status: finalStatus,
        stepsCompleted: counts.completed,
        stepsFailed: counts.failed,
        profileAssigned: result.profileName,
        leaveInitialized: !!result.leaveEntitlements,
        taxConfigured: !!result.taxSettings?.taxNumber,
        calculationsAdded: result.additionalCalculations?.length || 0,
        errors: result.errors,
        warnings: result.warnings,
        durationMs: Date.now() - startTime,
      };

      this.logger.log(
        `Setup ${setupResult.success ? 'completed' : 'failed'} for staff ${request.staffId} in ${setupResult.durationMs}ms`,
      );

      return setupResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Setup failed with exception: ${errorMessage}`);

      await this.setupLogRepo.markFailed(setupLog.id, {
        errors: [
          {
            step: PipelineStep.CREATE_EMPLOYEE,
            code: 'UNEXPECTED_ERROR',
            message: errorMessage,
            details: {},
            timestamp: new Date().toISOString(),
          },
        ],
      });

      return this.createErrorResult(
        setupLog.id,
        request.staffId,
        errorMessage,
        startTime,
      );
    }
  }

  /**
   * Retry a failed setup
   */
  async retrySetup(
    tenantId: string,
    setupLogId: string,
    fromStep?: PipelineStep,
    force = false,
  ): Promise<EmployeeSetupResult> {
    const startTime = Date.now();

    // Get existing setup log with tenant isolation
    const setupLog = await this.setupLogRepo.findById(setupLogId, tenantId);
    if (!setupLog) {
      throw new Error(`Setup log ${setupLogId} not found`);
    }

    // Check if can retry
    if (!force && !canRetrySetup(setupLog.status as SetupStatus)) {
      throw new Error(
        `Cannot retry setup with status ${setupLog.status}. Use force=true to override.`,
      );
    }

    // Get staff
    const staff = await this.staffRepo.findById(setupLog.staffId, tenantId);
    if (!staff) {
      throw new Error(`Staff ${setupLog.staffId} not found`);
    }

    // Mark as in progress
    await this.setupLogRepo.markInProgress(setupLog.id);

    // Get existing step results
    const existingSteps = setupLog.setupSteps as unknown as Array<{
      step: PipelineStep;
      status: SetupStepStatus;
    }>;

    // Determine from which step to restart
    let restartFromStep = fromStep;
    if (!restartFromStep) {
      // Find first failed or pending step
      const failedStep = existingSteps?.find(
        (s) => s.status === SetupStepStatus.FAILED,
      );
      restartFromStep = failedStep?.step || PipelineStep.CREATE_EMPLOYEE;
    }

    // Build context
    const context: SetupPipelineContext = {
      tenantId,
      staffId: setupLog.staffId,
      staff: {
        firstName: staff.firstName,
        lastName: staff.lastName,
        idNumber: staff.idNumber,
        email: staff.email,
        phone: staff.phone,
        dateOfBirth: staff.dateOfBirth,
        startDate: staff.startDate,
        endDate: staff.endDate,
        employmentType: staff.employmentType,
        position: staff.position,
        payFrequency: staff.payFrequency || 'MONTHLY',
        basicSalaryCents: staff.basicSalaryCents,
        taxNumber: staff.taxNumber,
        bankName: staff.bankName,
        bankAccount: staff.bankAccount,
        bankBranchCode: staff.bankBranchCode,
        paymentMethod: staff.paymentMethod,
      },
      setupLog,
      simplePayEmployeeId: setupLog.simplePayEmployeeId,
      waveId: null,
      profileId: null,
      profileName: setupLog.profileAssigned,
      leaveEntitlements: null,
      taxSettings: null,
      additionalCalculations: [],
      errors: [],
      warnings: [],
      stepResults:
        (existingSteps as unknown as typeof context.stepResults) ||
        createInitialStepResults(),
    };

    // Execute pipeline from step
    const result = await this.pipeline.executeFromStep(
      context,
      restartFromStep,
    );

    // Determine final status and update
    const finalStatus = this.pipeline.getFinalStatus(result);
    const counts = this.pipeline.getStepCounts(result);

    if (finalStatus === SetupStatus.COMPLETED) {
      await this.setupLogRepo.markCompleted(setupLog.id, {
        simplePayEmployeeId: result.simplePayEmployeeId || undefined,
        profileAssigned: result.profileName || undefined,
        leaveInitialized: !!result.leaveEntitlements,
        taxConfigured: !!result.taxSettings?.taxNumber,
        calculationsAdded: result.additionalCalculations?.length || 0,
        setupSteps: result.stepResults,
        warnings: result.warnings,
      });
    } else {
      await this.setupLogRepo.markFailed(setupLog.id, {
        setupSteps: result.stepResults,
        errors: result.errors,
        warnings: result.warnings,
      });
    }

    return {
      success: finalStatus === SetupStatus.COMPLETED,
      setupLogId: setupLog.id,
      staffId: setupLog.staffId,
      simplePayEmployeeId: result.simplePayEmployeeId,
      status: finalStatus,
      stepsCompleted: counts.completed,
      stepsFailed: counts.failed,
      profileAssigned: result.profileName,
      leaveInitialized: !!result.leaveEntitlements,
      taxConfigured: !!result.taxSettings?.taxNumber,
      calculationsAdded: result.additionalCalculations?.length || 0,
      errors: result.errors,
      warnings: result.warnings,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Get setup status
   */
  async getSetupStatus(
    tenantId: string,
    staffId: string,
  ): Promise<SetupStatusSummary | null> {
    const setupLog = await this.setupLogRepo.findByStaffId(staffId);
    if (!setupLog || setupLog.tenantId !== tenantId) {
      return null;
    }

    const staff = await this.staffRepo.findById(staffId, tenantId);
    const staffName = staff
      ? `${staff.firstName} ${staff.lastName}`
      : 'Unknown';

    const stepResults =
      (setupLog.setupSteps as unknown as Array<{
        step: PipelineStep;
        status: SetupStepStatus;
      }>) || [];

    const completedCount = stepResults.filter(
      (s) =>
        s.status === SetupStepStatus.COMPLETED ||
        s.status === SetupStepStatus.SKIPPED,
    ).length;

    const durationMs = setupLog.completedAt
      ? setupLog.completedAt.getTime() - setupLog.startedAt.getTime()
      : null;

    const errors =
      (setupLog.errors as unknown as Array<{ message: string }>) || [];
    const warnings =
      (setupLog.warnings as unknown as Array<{ message: string }>) || [];

    return {
      setupLogId: setupLog.id,
      staffId,
      staffName,
      status: setupLog.status as SetupStatus,
      progress: calculateProgress(
        stepResults as unknown as Parameters<typeof calculateProgress>[0],
      ),
      currentStep: getCurrentStep(
        stepResults as unknown as Parameters<typeof getCurrentStep>[0],
      ),
      stepsCompleted: completedCount,
      totalSteps: stepResults.length,
      simplePayEmployeeId: setupLog.simplePayEmployeeId,
      profileAssigned: setupLog.profileAssigned,
      leaveInitialized: setupLog.leaveInitialized,
      taxConfigured: setupLog.taxConfigured,
      calculationsAdded: setupLog.calculationsAdded,
      hasErrors: errors.length > 0,
      hasWarnings: warnings.length > 0,
      startedAt: setupLog.startedAt,
      completedAt: setupLog.completedAt,
      durationMs,
    };
  }

  /**
   * Get setup statistics for a tenant
   */
  async getSetupStatistics(tenantId: string) {
    return this.setupLogRepo.getStatistics(tenantId);
  }

  /**
   * Create error result helper
   */
  private createErrorResult(
    setupLogId: string,
    staffId: string,
    error: string,
    startTime: number,
  ): EmployeeSetupResult {
    return {
      success: false,
      setupLogId,
      staffId,
      simplePayEmployeeId: null,
      status: SetupStatus.FAILED,
      stepsCompleted: 0,
      stepsFailed: 1,
      profileAssigned: null,
      leaveInitialized: false,
      taxConfigured: false,
      calculationsAdded: 0,
      errors: [
        {
          step: PipelineStep.CREATE_EMPLOYEE,
          code: 'SETUP_FAILED',
          message: error,
          details: {},
          timestamp: new Date().toISOString(),
        },
      ],
      warnings: [],
      durationMs: Date.now() - startTime,
    };
  }
}
