/**
 * Verify Setup Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Verifies the employee setup in SimplePay is complete and correct.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PipelineStep,
  SetupPipelineContext,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';
import { SimplePayEmployeeService } from '../../simplepay-employee.service';
import { SimplePayProfileService } from '../../simplepay-profile.service';
import { SimplePayLeaveService } from '../../simplepay-leave.service';

/**
 * Verification result for each component
 */
interface VerificationResult {
  component: string;
  verified: boolean;
  details: Record<string, unknown>;
  issues: string[];
}

@Injectable()
export class VerifySetupStep implements IPipelineStep {
  readonly name = PipelineStep.VERIFY_SETUP;
  readonly description = 'Verify setup completion in SimplePay';

  private readonly logger = new Logger(VerifySetupStep.name);

  constructor(
    private readonly employeeService: SimplePayEmployeeService,
    private readonly profileService: SimplePayProfileService,
    private readonly leaveService: SimplePayLeaveService,
  ) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(`Verifying setup for staff ${context.staffId}`);

    if (!context.simplePayEmployeeId) {
      context.errors.push({
        step: this.name,
        code: 'NO_SIMPLEPAY_EMPLOYEE',
        message: 'SimplePay employee ID not available for verification',
        details: {},
        timestamp: new Date().toISOString(),
      });
      return false;
    }

    const verificationResults: VerificationResult[] = [];
    let allVerified = true;

    try {
      // 1. Verify employee exists and data is correct
      const employeeVerification = await this.verifyEmployee(context);
      verificationResults.push(employeeVerification);
      if (!employeeVerification.verified) {
        allVerified = false;
      }

      // 2. Verify profile assignment
      const profileVerification = await this.verifyProfile(context);
      verificationResults.push(profileVerification);
      if (!profileVerification.verified) {
        allVerified = false;
      }

      // 3. Verify leave setup (if applicable)
      const leaveVerification = await this.verifyLeave(context);
      verificationResults.push(leaveVerification);
      if (!leaveVerification.verified && leaveVerification.issues.length > 0) {
        // Leave verification issues are warnings, not failures
        for (const issue of leaveVerification.issues) {
          context.warnings.push({
            step: this.name,
            code: 'LEAVE_VERIFICATION_WARNING',
            message: issue,
            details: {},
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Update step result
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = {
          verificationResults,
          allVerified,
          simplePayEmployeeId: context.simplePayEmployeeId,
          profileAssigned: context.profileName,
          leaveInitialized: leaveVerification.verified,
        };
      }

      // Collect all issues
      const allIssues = verificationResults.flatMap((r) => r.issues);
      if (allIssues.length > 0 && allVerified) {
        // Some warnings but no failures
        this.logger.log(
          `Verification completed with ${allIssues.length} warnings`,
        );
      }

      this.logger.log(
        `Verification ${allVerified ? 'passed' : 'failed'} for staff ${context.staffId}`,
      );
      return allVerified;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Verification failed: ${errorMessage}`);

      context.errors.push({
        step: this.name,
        code: 'VERIFY_SETUP_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  /**
   * Verify employee exists and basic data is correct
   */
  private async verifyEmployee(
    context: SetupPipelineContext,
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      component: 'employee',
      verified: false,
      details: {},
      issues: [],
    };

    try {
      const employee = await this.employeeService.fetchEmployee(
        context.tenantId,
        context.simplePayEmployeeId!,
      );

      result.details = {
        id: employee.id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        idNumber: employee.id_number
          ? '***' + employee.id_number.slice(-4)
          : null,
        appointmentDate: employee.appointment_date,
      };

      // Verify key fields match
      if (employee.first_name !== context.staff.firstName) {
        result.issues.push(
          `First name mismatch: expected "${context.staff.firstName}", got "${employee.first_name}"`,
        );
      }

      if (employee.last_name !== context.staff.lastName) {
        result.issues.push(
          `Last name mismatch: expected "${context.staff.lastName}", got "${employee.last_name}"`,
        );
      }

      if (employee.id_number !== context.staff.idNumber) {
        result.issues.push('ID number mismatch');
      }

      result.verified = result.issues.length === 0;
    } catch (error) {
      result.issues.push(`Failed to fetch employee: ${error}`);
    }

    return result;
  }

  /**
   * Verify profile is assigned
   */
  private async verifyProfile(
    context: SetupPipelineContext,
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      component: 'profile',
      verified: false,
      details: {},
      issues: [],
    };

    try {
      const mappings = await this.profileService.getEmployeeProfileMappings(
        context.tenantId,
        context.staffId,
      );

      result.details = {
        profileCount: mappings.length,
        profiles: mappings.map((m) => ({
          id: m.id,
          profileName: m.profile_name,
        })),
      };

      if (mappings.length === 0) {
        result.issues.push('No profiles assigned to employee');
      } else {
        result.verified = true;
        if (context.profileName) {
          const hasExpectedProfile = mappings.some(
            (m) => m.profile_name === context.profileName,
          );
          if (!hasExpectedProfile) {
            result.issues.push(
              `Expected profile "${context.profileName}" not found`,
            );
            result.verified = false;
          }
        }
      }
    } catch (error) {
      result.issues.push(`Failed to verify profile: ${error}`);
    }

    return result;
  }

  /**
   * Verify leave setup
   */
  private async verifyLeave(
    context: SetupPipelineContext,
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      component: 'leave',
      verified: false,
      details: {},
      issues: [],
    };

    try {
      const balances = await this.leaveService.getLeaveBalances(
        context.tenantId,
        context.simplePayEmployeeId!,
      );

      result.details = {
        leaveTypes: balances.length,
        balances: balances.map((b) => ({
          type: b.leave_type_name,
          balance: b.current_balance,
          units: b.units,
        })),
      };

      if (balances.length === 0) {
        result.issues.push(
          'No leave balances found - may be pending first payroll',
        );
      } else {
        result.verified = true;
      }
    } catch {
      // Leave balances may not be immediately available
      result.issues.push('Leave balances not yet available');
      result.details.note =
        'Leave balances typically become available after first payroll';
      // This is not a failure condition
      result.verified = true;
    }

    return result;
  }

  shouldSkip(_context: SetupPipelineContext): boolean {
    // Never skip verification
    return false;
  }
}
