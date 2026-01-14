/**
 * Send Notification Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Emits completion event and optionally sends notifications.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PipelineStep,
  SetupPipelineContext,
  SetupStepStatus,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';

/**
 * Employee setup completed event payload
 */
export interface EmployeeSetupCompletedEvent {
  tenantId: string;
  staffId: string;
  simplePayEmployeeId: string | null;
  profileAssigned: string | null;
  leaveInitialized: boolean;
  taxConfigured: boolean;
  calculationsAdded: number;
  setupLogId: string;
  triggeredBy: string;
  completedAt: Date;
  hasErrors: boolean;
  hasWarnings: boolean;
}

/**
 * Employee setup failed event payload
 */
export interface EmployeeSetupFailedEvent {
  tenantId: string;
  staffId: string;
  setupLogId: string;
  triggeredBy: string;
  failedAt: Date;
  lastSuccessfulStep: PipelineStep | null;
  errors: Array<{
    step: PipelineStep;
    code: string;
    message: string;
  }>;
}

@Injectable()
export class SendNotificationStep implements IPipelineStep {
  readonly name = PipelineStep.SEND_NOTIFICATION;
  readonly description = 'Emit completion event';

  private readonly logger = new Logger(SendNotificationStep.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(`Sending notification for staff ${context.staffId}`);

    try {
      const hasErrors = context.errors.length > 0;
      const hasWarnings = context.warnings.length > 0;

      // Determine if setup was successful (all previous steps completed)
      const completedSteps = context.stepResults.filter(
        (s) =>
          s.step !== this.name &&
          (s.status === SetupStepStatus.COMPLETED ||
            s.status === SetupStepStatus.SKIPPED),
      );
      const totalSteps = context.stepResults.filter(
        (s) => s.step !== this.name,
      ).length;
      const setupSuccessful =
        completedSteps.length === totalSteps && !hasErrors;

      if (setupSuccessful) {
        // Emit success event
        const successEvent: EmployeeSetupCompletedEvent = {
          tenantId: context.tenantId,
          staffId: context.staffId,
          simplePayEmployeeId: context.simplePayEmployeeId,
          profileAssigned: context.profileName,
          leaveInitialized: !!context.leaveEntitlements,
          taxConfigured: !!context.taxSettings?.taxNumber,
          calculationsAdded: context.additionalCalculations?.length || 0,
          setupLogId: context.setupLog.id,
          triggeredBy: context.setupLog.triggeredBy,
          completedAt: new Date(),
          hasErrors,
          hasWarnings,
        };

        await this.eventEmitter.emitAsync(
          'employee.setup.completed',
          successEvent,
        );

        this.logger.log(
          `Emitted employee.setup.completed for staff ${context.staffId}`,
        );
      } else {
        // Emit failure event
        const lastSuccessfulStep = this.getLastSuccessfulStep(context);
        const failureEvent: EmployeeSetupFailedEvent = {
          tenantId: context.tenantId,
          staffId: context.staffId,
          setupLogId: context.setupLog.id,
          triggeredBy: context.setupLog.triggeredBy,
          failedAt: new Date(),
          lastSuccessfulStep,
          errors: context.errors.map((e) => ({
            step: e.step,
            code: e.code,
            message: e.message,
          })),
        };

        await this.eventEmitter.emitAsync(
          'employee.setup.failed',
          failureEvent,
        );

        this.logger.log(
          `Emitted employee.setup.failed for staff ${context.staffId}`,
        );
      }

      // Update step result
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = {
          eventEmitted: setupSuccessful
            ? 'employee.setup.completed'
            : 'employee.setup.failed',
          hasErrors,
          hasWarnings,
          stepsCompleted: completedSteps.length,
          totalSteps,
        };
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send notification: ${errorMessage}`);

      // This step failing shouldn't roll back the whole setup
      context.warnings.push({
        step: this.name,
        code: 'NOTIFICATION_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      // Return true anyway - notification is not critical
      return true;
    }
  }

  /**
   * Get the last successfully completed step
   */
  private getLastSuccessfulStep(
    context: SetupPipelineContext,
  ): PipelineStep | null {
    const completedSteps = context.stepResults
      .filter((s) => s.status === SetupStepStatus.COMPLETED)
      .sort((a, b) => {
        // Sort by step order
        const stepOrder = Object.values(PipelineStep);
        return stepOrder.indexOf(a.step) - stepOrder.indexOf(b.step);
      });

    return completedSteps.length > 0
      ? completedSteps[completedSteps.length - 1].step
      : null;
  }

  shouldSkip(_context: SetupPipelineContext): boolean {
    // Never skip notification
    return false;
  }
}
