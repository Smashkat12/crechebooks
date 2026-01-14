/**
 * Setup Leave Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Initializes pro-rata leave balances in SimplePay based on BCEA requirements.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PipelineStep,
  SetupPipelineContext,
  BCEA_LEAVE,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';
import { LeaveCalculator } from '../leave-calculator';
import { SimplePayLeaveService } from '../../simplepay-leave.service';

@Injectable()
export class SetupLeaveStep implements IPipelineStep {
  readonly name = PipelineStep.SETUP_LEAVE;
  readonly description = 'Initialize pro-rata leave balances';

  private readonly logger = new Logger(SetupLeaveStep.name);

  constructor(
    private readonly leaveCalculator: LeaveCalculator,
    private readonly leaveService: SimplePayLeaveService,
  ) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(`Setting up leave for staff ${context.staffId}`);

    if (!context.simplePayEmployeeId) {
      context.errors.push({
        step: this.name,
        code: 'NO_SIMPLEPAY_EMPLOYEE',
        message: 'SimplePay employee ID not available',
        details: {},
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    try {
      // Calculate leave entitlements if not provided
      let entitlements = context.leaveEntitlements;

      if (!entitlements) {
        const isPartTime = context.staff.employmentType === 'CASUAL';
        const hoursPerWeek =
          context.staff.payFrequency === 'WEEKLY'
            ? 40
            : context.staff.payFrequency === 'DAILY'
              ? 8 * 5
              : BCEA_LEAVE.WORKING_DAYS_PER_WEEK *
                BCEA_LEAVE.WORKING_HOURS_PER_DAY;

        const result = this.leaveCalculator.calculateProRataLeave({
          startDate: context.staff.startDate,
          referenceDate: new Date(),
          employmentType: context.staff.employmentType,
          isPartTime,
          hoursPerWeek,
          leaveYearStart: 3, // March (South African tax year)
        });

        entitlements = result.entitlements;
        context.leaveEntitlements = entitlements;

        this.logger.debug(
          `Calculated leave: annual=${entitlements.annualDays}, sick=${entitlements.sickDays}, family=${entitlements.familyResponsibilityDays}`,
        );
      }

      // Get leave types from SimplePay
      const leaveTypes = await this.leaveService.getLeaveTypes(
        context.tenantId,
      );

      // Map our entitlements to SimplePay leave type IDs
      const annualLeaveType = leaveTypes.find(
        (t) =>
          t.accrual_type === 'annual' ||
          t.name.toLowerCase().includes('annual'),
      );
      const sickLeaveType = leaveTypes.find(
        (t) =>
          t.accrual_type === 'sick' || t.name.toLowerCase().includes('sick'),
      );
      const familyLeaveType = leaveTypes.find(
        (t) =>
          t.accrual_type === 'family_responsibility' ||
          t.name.toLowerCase().includes('family'),
      );

      // Note: SimplePay manages leave accruals automatically based on profiles
      // We're logging what the employee should be entitled to, but SimplePay
      // will calculate actual balances based on their configuration

      const details: Record<string, unknown> = {
        calculatedEntitlements: {
          annualDays: entitlements.annualDays,
          sickDays: entitlements.sickDays,
          familyResponsibilityDays: entitlements.familyResponsibilityDays,
        },
        leaveTypesFound: {
          annual: annualLeaveType?.id || null,
          sick: sickLeaveType?.id || null,
          family: familyLeaveType?.id || null,
        },
        note: 'SimplePay manages accruals automatically. Initial balances depend on profile configuration.',
      };

      // Verify leave balances were initialized
      try {
        const balances = await this.leaveService.getLeaveBalances(
          context.tenantId,
          context.simplePayEmployeeId,
        );
        details.currentBalances = balances.map((b) => ({
          leaveType: b.leave_type_name,
          currentBalance: b.current_balance,
          units: b.units,
        }));
      } catch {
        // Balances may not be immediately available for new employees
        details.balancesNote =
          'Balances not yet available, will be calculated on first payroll';
        context.warnings.push({
          step: this.name,
          code: 'LEAVE_BALANCES_PENDING',
          message: 'Leave balances will be initialized on first payroll run',
          details: {},
          timestamp: new Date().toISOString(),
        });
      }

      // Update step result
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = details;
        stepResult.canRollback = false; // Leave setup can't be easily rolled back
      }

      this.logger.log(`Successfully set up leave for staff ${context.staffId}`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to setup leave: ${errorMessage}`);

      context.errors.push({
        step: this.name,
        code: 'SETUP_LEAVE_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  shouldSkip(context: SetupPipelineContext): boolean {
    // Skip for casual workers working less than 24 hours/month
    // as they don't qualify for BCEA leave
    if (context.staff.employmentType === 'CASUAL') {
      // Could add hours check here if available
      return false; // Still process but with zero entitlements
    }
    return false;
  }
}
