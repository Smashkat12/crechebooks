/**
 * Add Calculations Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Adds additional calculations (earnings/deductions) to the employee's profile.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PipelineStep,
  SetupPipelineContext,
  AdditionalCalculation,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';
import { SimplePayCalculationsService } from '../../simplepay-calculations.service';
import { PayrollAdjustmentRepository } from '../../../../database/repositories/payroll-adjustment.repository';
import { CalculationType } from '@prisma/client';

@Injectable()
export class AddCalculationsStep implements IPipelineStep {
  readonly name = PipelineStep.ADD_CALCULATIONS;
  readonly description = 'Add additional earnings/deductions';

  private readonly logger = new Logger(AddCalculationsStep.name);

  constructor(
    private readonly calculationsService: SimplePayCalculationsService,
    private readonly adjustmentRepo: PayrollAdjustmentRepository,
  ) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(`Adding calculations for staff ${context.staffId}`);

    try {
      const calculations = context.additionalCalculations || [];

      if (calculations.length === 0) {
        // No additional calculations to add
        const stepResult = context.stepResults.find(
          (s) => s.step === this.name,
        );
        if (stepResult) {
          stepResult.details = {
            message: 'No additional calculations provided',
            calculationsAdded: 0,
          };
        }
        return true;
      }

      // Verify calculation codes exist in SimplePay
      const cachedItems = await this.calculationsService.getCalculationItems(
        context.tenantId,
      );
      const validCodes = new Set(cachedItems.map((item) => item.code));

      const addedCalculations: Array<{
        code: string;
        name: string;
        type: string;
        adjustmentId: string;
      }> = [];
      const skippedCalculations: Array<{
        code: string;
        reason: string;
      }> = [];

      for (const calc of calculations) {
        // Validate calculation code
        if (!validCodes.has(calc.code)) {
          skippedCalculations.push({
            code: calc.code,
            reason: 'Calculation code not found in SimplePay',
          });
          context.warnings.push({
            step: this.name,
            code: 'INVALID_CALCULATION_CODE',
            message: `Calculation code "${calc.code}" not found in SimplePay`,
            details: { code: calc.code },
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        try {
          // Create payroll adjustment record
          const adjustment = await this.adjustmentRepo.create({
            tenantId: context.tenantId,
            staffId: context.staffId,
            itemCode: calc.code,
            itemName: calc.name,
            type: calc.type as CalculationType,
            amountCents: calc.amountCents ?? undefined,
            percentage: calc.percentage ?? undefined,
            isRecurring: calc.isRecurring ?? true,
            effectiveDate: context.staff.startDate,
          });

          addedCalculations.push({
            code: calc.code,
            name: calc.name,
            type: calc.type,
            adjustmentId: adjustment.id,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          skippedCalculations.push({
            code: calc.code,
            reason: errorMessage,
          });
          context.warnings.push({
            step: this.name,
            code: 'CALCULATION_ADD_FAILED',
            message: `Failed to add calculation "${calc.code}": ${errorMessage}`,
            details: { code: calc.code },
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Update step result
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = {
          calculationsRequested: calculations.length,
          calculationsAdded: addedCalculations.length,
          calculationsSkipped: skippedCalculations.length,
          added: addedCalculations,
          skipped: skippedCalculations,
        };
        stepResult.rollbackData = {
          adjustmentIds: addedCalculations.map((c) => c.adjustmentId),
          tenantId: context.tenantId,
        };
        stepResult.canRollback = addedCalculations.length > 0;
      }

      this.logger.log(
        `Added ${addedCalculations.length}/${calculations.length} calculations for staff ${context.staffId}`,
      );

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to add calculations: ${errorMessage}`);

      context.errors.push({
        step: this.name,
        code: 'ADD_CALCULATIONS_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  async rollback(context: SetupPipelineContext): Promise<boolean> {
    const stepResult = context.stepResults.find((s) => s.step === this.name);

    if (!stepResult?.rollbackData?.adjustmentIds) {
      return true;
    }

    const adjustmentIds = stepResult.rollbackData.adjustmentIds as string[];
    let rolledBack = 0;

    for (const adjustmentId of adjustmentIds) {
      try {
        await this.adjustmentRepo.delete(
          adjustmentId,
          stepResult.rollbackData.tenantId as string,
        );
        rolledBack++;
      } catch (error) {
        this.logger.warn(
          `Failed to rollback adjustment ${adjustmentId}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Rolled back ${rolledBack}/${adjustmentIds.length} adjustments`,
    );
    return rolledBack === adjustmentIds.length;
  }

  shouldSkip(context: SetupPipelineContext): boolean {
    // Skip if no additional calculations provided
    return (
      !context.additionalCalculations ||
      context.additionalCalculations.length === 0
    );
  }
}
