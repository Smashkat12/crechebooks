/**
 * Setup Pipeline
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Orchestrates the employee setup process with step-by-step execution,
 * error handling, and rollback capabilities.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  SetupPipelineContext,
  SetupStepResult,
  SetupError,
  SetupWarning,
  PipelineStep,
  SetupStepStatus,
  SetupStatus,
  createInitialStepResults,
  determineOverallStatus,
} from '../../../database/entities/employee-setup-log.entity';

/**
 * Pipeline step interface - each step must implement this
 */
export interface IPipelineStep {
  readonly name: PipelineStep;
  readonly description: string;

  /**
   * Execute the step
   * Returns true if successful, false if failed
   */
  execute(context: SetupPipelineContext): Promise<boolean>;

  /**
   * Rollback the step (if applicable)
   * Called when subsequent steps fail
   */
  rollback?(context: SetupPipelineContext): Promise<boolean>;

  /**
   * Check if step should be skipped
   */
  shouldSkip?(context: SetupPipelineContext): boolean;
}

/**
 * Step registry entry
 */
interface StepRegistryEntry {
  step: IPipelineStep;
  order: number;
}

/**
 * Setup Pipeline - orchestrates the employee setup process
 */
@Injectable()
export class SetupPipeline {
  private readonly logger = new Logger(SetupPipeline.name);
  private readonly steps: Map<PipelineStep, StepRegistryEntry> = new Map();

  /**
   * Register a step with the pipeline
   */
  registerStep(step: IPipelineStep, order: number): void {
    this.steps.set(step.name, { step, order });
    this.logger.debug(`Registered step: ${step.name} (order: ${order})`);
  }

  /**
   * Get ordered steps
   */
  getOrderedSteps(): IPipelineStep[] {
    return Array.from(this.steps.values())
      .sort((a, b) => a.order - b.order)
      .map((entry) => entry.step);
  }

  /**
   * Execute the complete pipeline
   */
  async execute(context: SetupPipelineContext): Promise<SetupPipelineContext> {
    this.logger.log(`Starting setup pipeline for staff ${context.staffId}`);
    const startTime = Date.now();

    // Initialize step results if not present
    if (!context.stepResults || context.stepResults.length === 0) {
      context.stepResults = createInitialStepResults();
    }

    const orderedSteps = this.getOrderedSteps();
    let lastSuccessfulStepIndex = -1;

    for (let i = 0; i < orderedSteps.length; i++) {
      const step = orderedSteps[i];
      const stepResult = context.stepResults.find((r) => r.step === step.name);

      if (!stepResult) {
        this.logger.warn(`No step result found for ${step.name}`);
        continue;
      }

      // Check if step should be skipped
      if (step.shouldSkip?.(context)) {
        this.updateStepResult(stepResult, {
          status: SetupStepStatus.SKIPPED,
          details: { reason: 'Step condition not met' },
        });
        this.logger.debug(`Skipping step: ${step.name}`);
        continue;
      }

      // Execute step
      const stepStartTime = Date.now();
      this.updateStepResult(stepResult, {
        status: SetupStepStatus.IN_PROGRESS,
        startedAt: new Date().toISOString(),
      });

      try {
        this.logger.debug(`Executing step: ${step.name}`);
        const success = await step.execute(context);

        if (success) {
          this.updateStepResult(stepResult, {
            status: SetupStepStatus.COMPLETED,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - stepStartTime,
            canRollback: !!step.rollback,
          });
          lastSuccessfulStepIndex = i;
        } else {
          this.updateStepResult(stepResult, {
            status: SetupStepStatus.FAILED,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - stepStartTime,
            error: 'Step returned false',
          });

          // Rollback previous steps
          await this.rollbackFromStep(context, lastSuccessfulStepIndex);
          break;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Step ${step.name} failed: ${errorMessage}`);

        this.updateStepResult(stepResult, {
          status: SetupStepStatus.FAILED,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - stepStartTime,
          error: errorMessage,
        });

        // Add error to context
        context.errors.push(this.createError(step.name, errorMessage));

        // Rollback previous steps
        await this.rollbackFromStep(context, lastSuccessfulStepIndex);
        break;
      }
    }

    const totalDuration = Date.now() - startTime;
    this.logger.log(
      `Pipeline completed for staff ${context.staffId} in ${totalDuration}ms`,
    );

    return context;
  }

  /**
   * Execute pipeline from a specific step
   */
  async executeFromStep(
    context: SetupPipelineContext,
    fromStep: PipelineStep,
  ): Promise<SetupPipelineContext> {
    this.logger.log(
      `Resuming pipeline from step ${fromStep} for staff ${context.staffId}`,
    );

    const orderedSteps = this.getOrderedSteps();
    const startIndex = orderedSteps.findIndex((s) => s.name === fromStep);

    if (startIndex === -1) {
      throw new Error(`Step ${fromStep} not found in pipeline`);
    }

    // Reset failed and subsequent step results
    for (let i = startIndex; i < orderedSteps.length; i++) {
      const step = orderedSteps[i];
      const stepResult = context.stepResults.find((r) => r.step === step.name);
      if (stepResult) {
        this.updateStepResult(stepResult, {
          status: SetupStepStatus.PENDING,
          startedAt: null,
          completedAt: null,
          durationMs: null,
          error: null,
        });
      }
    }

    // Execute remaining steps
    return this.execute(context);
  }

  /**
   * Rollback from a specific step index
   */
  private async rollbackFromStep(
    context: SetupPipelineContext,
    fromIndex: number,
  ): Promise<void> {
    if (fromIndex < 0) return;

    const orderedSteps = this.getOrderedSteps();
    this.logger.log(`Rolling back from step index ${fromIndex}`);

    // Rollback in reverse order
    for (let i = fromIndex; i >= 0; i--) {
      const step = orderedSteps[i];
      const stepResult = context.stepResults.find((r) => r.step === step.name);

      if (!stepResult || !stepResult.canRollback || !step.rollback) {
        continue;
      }

      try {
        this.logger.debug(`Rolling back step: ${step.name}`);
        await step.rollback(context);
        this.updateStepResult(stepResult, {
          status: SetupStepStatus.ROLLED_BACK,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(`Rollback failed for ${step.name}: ${errorMessage}`);
        context.warnings.push(
          this.createWarning(step.name, `Rollback failed: ${errorMessage}`),
        );
      }
    }
  }

  /**
   * Update step result
   */
  private updateStepResult(
    stepResult: SetupStepResult,
    updates: Partial<SetupStepResult>,
  ): void {
    Object.assign(stepResult, updates);
  }

  /**
   * Create error object
   */
  private createError(step: PipelineStep, message: string): SetupError {
    return {
      step,
      code: `${step.toUpperCase()}_FAILED`,
      message,
      details: {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create warning object
   */
  private createWarning(step: PipelineStep, message: string): SetupWarning {
    return {
      step,
      code: `${step.toUpperCase()}_WARNING`,
      message,
      details: {},
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get final status based on step results
   */
  getFinalStatus(context: SetupPipelineContext): SetupStatus {
    return determineOverallStatus(context.stepResults);
  }

  /**
   * Get step count summary
   */
  getStepCounts(context: SetupPipelineContext): {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    pending: number;
  } {
    const completed = context.stepResults.filter(
      (s) => s.status === SetupStepStatus.COMPLETED,
    ).length;
    const failed = context.stepResults.filter(
      (s) => s.status === SetupStepStatus.FAILED,
    ).length;
    const skipped = context.stepResults.filter(
      (s) => s.status === SetupStepStatus.SKIPPED,
    ).length;
    const pending = context.stepResults.filter(
      (s) => s.status === SetupStepStatus.PENDING,
    ).length;

    return {
      total: context.stepResults.length,
      completed,
      failed,
      skipped,
      pending,
    };
  }
}
