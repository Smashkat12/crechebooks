/**
 * Create Employee Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Creates the employee in SimplePay payroll system.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PipelineStep,
  SetupPipelineContext,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';
import { SimplePayEmployeeService } from '../../simplepay-employee.service';

@Injectable()
export class CreateEmployeeStep implements IPipelineStep {
  readonly name = PipelineStep.CREATE_EMPLOYEE;
  readonly description = 'Create employee in SimplePay';

  private readonly logger = new Logger(CreateEmployeeStep.name);

  constructor(private readonly employeeService: SimplePayEmployeeService) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(
      `Creating employee in SimplePay for staff ${context.staffId}`,
    );

    try {
      // Sync employee to SimplePay (creates or updates)
      const mapping = await this.employeeService.syncEmployee(
        context.tenantId,
        context.staffId,
      );

      if (!mapping || !mapping.simplePayEmployeeId) {
        throw new Error('Failed to get SimplePay employee ID');
      }

      // Update context with SimplePay employee ID
      context.simplePayEmployeeId = mapping.simplePayEmployeeId;

      // Get wave ID for subsequent steps
      const waveId = await this.employeeService.getDefaultWaveId(
        context.tenantId,
      );
      context.waveId = waveId;

      // Update step result details
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = {
          simplePayEmployeeId: mapping.simplePayEmployeeId,
          waveId,
          syncStatus: mapping.syncStatus,
        };
        stepResult.rollbackData = {
          simplePayEmployeeId: mapping.simplePayEmployeeId,
        };
        stepResult.canRollback = true;
      }

      this.logger.log(
        `Successfully created SimplePay employee ${mapping.simplePayEmployeeId}`,
      );
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create employee: ${errorMessage}`);

      // Add error to context
      context.errors.push({
        step: this.name,
        code: 'CREATE_EMPLOYEE_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  /**
   * Rollback is not implemented for employee creation
   * Deleting employees from SimplePay is generally not recommended
   */
  shouldSkip(context: SetupPipelineContext): boolean {
    // Skip if already has a SimplePay employee ID
    return !!context.simplePayEmployeeId;
  }
}
