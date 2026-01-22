/**
 * Set Salary Step
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Sets the Basic Salary Regular Input Fixed Amount for the employee in SimplePay.
 * Uses the bulk_input API endpoint with calc.basic_salary.fixed_amount attribute
 * to properly set the salary that appears on payslips.
 *
 * This step MUST run after CREATE_EMPLOYEE to ensure the employee exists in SimplePay.
 *
 * NOTE: Using PATCH employee with basic_salary only sets a reference field,
 * it does NOT set the Regular Input Fixed Amount needed for payslip generation.
 *
 * API Format (discovered through testing):
 * POST /clients/{clientId}/bulk_input
 * { "entities": [{ "id": "employee_id", "attributes": { "calc.basic_salary.fixed_amount": "amount" }}]}
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  PipelineStep,
  SetupPipelineContext,
} from '../../../../database/entities/employee-setup-log.entity';
import { IPipelineStep } from '../setup-pipeline';
import { SimplePayApiClient } from '../../simplepay-api.client';

/**
 * SimplePay bulk_input API response structure
 * SimplePay may return either:
 * 1. Object format: { bulk_input: { processed, successful, failed, results, errors, warnings } }
 * 2. Array format: [{ success: boolean, message?: string, errors?: object }]
 */
interface SimplePayBulkInputResponseObject {
  bulk_input: {
    processed: number;
    successful: number;
    failed: number;
    results: Array<{
      index?: number;
      success: boolean;
      id?: number;
      error?: string;
    }>;
    errors?: Array<{
      index: number;
      error: string;
      field?: string;
    }>;
    warnings?: Array<{
      index: number;
      warning: string;
    }>;
  };
}

interface SimplePayBulkInputResponseArray {
  id?: number;
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
}

type SimplePayBulkInputResponse =
  | SimplePayBulkInputResponseObject
  | SimplePayBulkInputResponseArray[];

@Injectable()
export class SetSalaryStep implements IPipelineStep {
  readonly name = PipelineStep.SET_SALARY;
  readonly description = 'Set Basic Salary in SimplePay';

  private readonly logger = new Logger(SetSalaryStep.name);

  constructor(private readonly apiClient: SimplePayApiClient) {}

  async execute(context: SetupPipelineContext): Promise<boolean> {
    this.logger.log(`Setting salary for staff ${context.staffId}`);

    try {
      // Get SimplePay employee ID from context (set by CREATE_EMPLOYEE step)
      const simplePayEmployeeId = context.simplePayEmployeeId;
      if (!simplePayEmployeeId) {
        throw new Error(
          'SimplePay employee ID not found. CREATE_EMPLOYEE step must run first.',
        );
      }

      // Get salary from staff data
      const salaryCents = context.staff.basicSalaryCents;
      if (!salaryCents || salaryCents <= 0) {
        // No salary to set - skip with warning
        context.warnings.push({
          step: this.name,
          code: 'NO_SALARY',
          message: 'No salary configured for staff member',
          details: { basicSalaryCents: salaryCents },
          timestamp: new Date().toISOString(),
        });

        const stepResult = context.stepResults.find(
          (s) => s.step === this.name,
        );
        if (stepResult) {
          stepResult.details = {
            message: 'Skipped - no salary configured',
            salaryCents: 0,
          };
        }
        return true; // Continue pipeline even if no salary
      }

      // Convert cents to Rands for SimplePay API
      const salaryRands = salaryCents / 100;

      // Initialize API client for tenant
      await this.apiClient.initializeForTenant(context.tenantId);
      const clientId = this.apiClient.getClientId();

      // Retry logic with exponential backoff for bulk_input call
      // SimplePay needs time to propagate newly created employees before they're available
      const maxRetries = 3;
      const baseDelayMs = 2000; // Start with 2 seconds
      let lastError: Error | null = null;
      let response: SimplePayBulkInputResponse | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Delay before each attempt (increases with each retry)
        const delayMs = baseDelayMs * attempt; // 2s, 4s, 6s
        this.logger.log(
          `SET_SALARY attempt ${attempt}/${maxRetries}, waiting ${delayMs}ms for SimplePay propagation`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        try {
          // Call bulk_input endpoint to set Basic Salary Regular Input Fixed Amount
          // This properly sets the salary that appears on payslips, unlike PATCH employee
          // which only sets a reference field.
          //
          // SimplePay bulk_input API format (discovered through testing):
          // - id: employee ID as string
          // - attributes: object with calc.basic_salary.fixed_amount as string value
          // Note: Do NOT use type or employee_id - those cause "UNKNOWN EMPLOYEE" errors
          response = await this.apiClient.post<SimplePayBulkInputResponse>(
            `/clients/${clientId}/bulk_input`,
            {
              entities: [
                {
                  id: String(simplePayEmployeeId),
                  attributes: {
                    'calc.basic_salary.fixed_amount': String(salaryRands),
                  },
                },
              ],
              validate_only: false,
            },
          );

          // Handle both response formats from SimplePay
          // Format 1: { bulk_input: { processed, successful, failed, ... } }
          // Format 2: [{ success: boolean, message: string, ... }]
          if (Array.isArray(response)) {
            // Array format response
            const result = response[0];
            if (!result || !result.success) {
              const errorMsg =
                result?.message ||
                (result?.errors
                  ? Object.values(result.errors).join(', ')
                  : 'Unknown error setting salary via bulk_input');
              throw new Error(errorMsg);
            }
            this.logger.log(
              `Bulk input success (array format): ${result.message || 'OK'}`,
            );
          } else if (response.bulk_input) {
            // Object format response
            const bulkResult = response.bulk_input;
            if (bulkResult.failed > 0) {
              const errorMsg =
                bulkResult.errors?.[0]?.error ||
                bulkResult.results?.[0]?.error ||
                'Unknown error setting salary via bulk_input';
              throw new Error(errorMsg);
            }
            if (bulkResult.successful === 0) {
              throw new Error('Bulk input returned 0 successful updates');
            }
            this.logger.log(
              `Bulk input success (object format): ${bulkResult.successful} successful`,
            );
          } else {
            // Unknown format - log and continue
            this.logger.warn(
              `Unexpected bulk_input response format: ${JSON.stringify(response)}`,
            );
          }

          // Success! Break out of retry loop
          lastError = null;
          break;
        } catch (attemptError) {
          const errorMessage =
            attemptError instanceof Error
              ? attemptError.message
              : String(attemptError);
          lastError =
            attemptError instanceof Error
              ? attemptError
              : new Error(errorMessage);

          // Check if error is retryable (UNKNOWN EMPLOYEE suggests propagation delay)
          // "Invalid heading" errors are NOT retryable - they indicate wrong attribute names
          const isRetryable =
            (errorMessage.includes('UNKNOWN EMPLOYEE') ||
              errorMessage.includes('not found') ||
              errorMessage.includes('does not exist')) &&
            !errorMessage.includes('Invalid heading');

          if (isRetryable && attempt < maxRetries) {
            this.logger.warn(
              `SET_SALARY attempt ${attempt} failed (retryable): ${errorMessage}. Will retry...`,
            );
          } else if (!isRetryable) {
            // Non-retryable error, break immediately
            this.logger.error(
              `SET_SALARY failed with non-retryable error: ${errorMessage}`,
            );
            break;
          } else {
            // Last attempt failed
            this.logger.error(
              `SET_SALARY attempt ${attempt}/${maxRetries} failed: ${errorMessage}`,
            );
          }
        }
      }

      // If we exhausted retries with an error, throw it
      if (lastError) {
        throw lastError;
      }

      // Update step result
      const stepResult = context.stepResults.find((s) => s.step === this.name);
      if (stepResult) {
        stepResult.details = {
          salaryCents,
          salaryRands,
          simplePayEmployeeId: String(simplePayEmployeeId),
          attributeUsed: 'calc.basic_salary.fixed_amount',
          responseFormat:
            response && Array.isArray(response) ? 'array' : 'object',
        };
        stepResult.rollbackData = {
          simplePayEmployeeId: Number(simplePayEmployeeId),
          clientId,
          previousSalaryRands: 0, // Can set to 0 on rollback
        };
        stepResult.canRollback = true;
      }

      this.logger.log(
        `Successfully set Basic Salary Regular Input R${salaryRands.toFixed(2)} for employee ${simplePayEmployeeId} via bulk_input`,
      );
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to set salary: ${errorMessage}`);

      context.errors.push({
        step: this.name,
        code: 'SET_SALARY_FAILED',
        message: errorMessage,
        details: {},
        timestamp: new Date().toISOString(),
      });

      return false;
    }
  }

  rollback(_context: SetupPipelineContext): Promise<boolean> {
    // On rollback, we could set salary to 0, but that might cause issues
    // Better to leave the salary as-is since the employee record itself
    // will be deleted by CREATE_EMPLOYEE rollback
    this.logger.log(
      `Salary rollback skipped - employee deletion handles cleanup`,
    );
    return Promise.resolve(true);
  }

  shouldSkip(context: SetupPipelineContext): boolean {
    // Skip if no SimplePay employee ID (CREATE_EMPLOYEE failed/skipped)
    if (!context.simplePayEmployeeId) {
      this.logger.debug('Skipping SET_SALARY - no SimplePay employee ID');
      return true;
    }
    return false;
  }
}
