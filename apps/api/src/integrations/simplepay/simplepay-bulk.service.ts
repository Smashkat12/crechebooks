/**
 * SimplePay Bulk Operations Service
 * TASK-SPAY-007: Bulk Operations for Salary Adjustments, Bonuses, Deductions, Updates
 *
 * Reduces API calls by 95-99% through bulk_input endpoint
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { BulkOperationLogRepository } from '../../database/repositories/bulk-operation-log.repository';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import {
  BulkOperationType,
  BulkOperationStatus,
  BulkOperationResult,
  BulkEntityResult,
  BulkOperationError,
  BulkOperationWarning,
  BulkValidationResult,
  BulkInputEntity,
  SimplePayBulkInputResponse,
  BonusType,
} from '../../database/entities/bulk-operation-log.entity';
import {
  BulkInputRequestDto,
  BulkSalaryAdjustmentRequestDto,
  BulkBonusDistributionRequestDto,
  BulkDeductionSetupRequestDto,
  BulkEmployeeUpdateRequestDto,
} from '../../database/dto/bulk-operations.dto';
import { Prisma } from '@prisma/client';

// SimplePay item codes for common operations
const SIMPLEPAY_ITEM_CODES = {
  BASIC_SALARY: 'BASIC',
  BONUS_ANNUAL: 'BONUS',
  BONUS_13TH_CHEQUE: '13THC',
  BONUS_PERFORMANCE: 'PERF_BONUS',
  BONUS_DISCRETIONARY: 'DISC_BONUS',
  SALARY_ADJUSTMENT: 'SAL_ADJ',
};

// Map bonus types to SimplePay item codes
const BONUS_TYPE_TO_ITEM_CODE: Record<BonusType, string> = {
  [BonusType.ANNUAL]: SIMPLEPAY_ITEM_CODES.BONUS_ANNUAL,
  [BonusType.THIRTEENTH_CHEQUE]: SIMPLEPAY_ITEM_CODES.BONUS_13TH_CHEQUE,
  [BonusType.PERFORMANCE]: SIMPLEPAY_ITEM_CODES.BONUS_PERFORMANCE,
  [BonusType.DISCRETIONARY]: SIMPLEPAY_ITEM_CODES.BONUS_DISCRETIONARY,
  [BonusType.ONE_OFF]: SIMPLEPAY_ITEM_CODES.BONUS_DISCRETIONARY,
};

/**
 * Helper to convert typed arrays to Prisma JSON compatible format
 */
function toJsonArray<T>(arr: T[]): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(arr)) as Prisma.InputJsonValue;
}

/**
 * Helper to convert typed objects to Prisma JSON compatible format
 */
function toJsonObject<T extends object>(obj: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
}

@Injectable()
export class SimplePayBulkService {
  private readonly logger = new Logger(SimplePayBulkService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly bulkOperationRepo: BulkOperationLogRepository,
    private readonly simplePayRepo: SimplePayRepository,
  ) {}

  /**
   * Process generic bulk input to SimplePay
   * This is the core method that other bulk operations use
   */
  async processBulkInput(
    tenantId: string,
    request: BulkInputRequestDto,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    let operationId: string;

    // Create operation log
    const log = await this.bulkOperationRepo.create({
      tenantId,
      operationType: BulkOperationType.GENERIC_INPUT,
      totalEntities: request.entities.length,
      requestData: toJsonObject({
        entities: request.entities,
        validateOnly: request.validateOnly,
      }),
      executedBy: request.executedBy,
    });
    operationId = log.id;

    try {
      // Mark as processing
      await this.bulkOperationRepo.markProcessing(operationId);

      // Initialize API client for tenant
      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      // Convert to SimplePay format
      const bulkInputEntities: BulkInputEntity[] = request.entities.map(
        (e) => ({
          employee_id: e.simplePayEmployeeId,
          item_code: e.itemCode,
          value: e.value,
          start_date: e.startDate,
          end_date: e.endDate,
          description: e.description,
          payslip_id: e.payslipId,
        }),
      );

      // Call SimplePay bulk_input API
      const response = await this.apiClient.post<SimplePayBulkInputResponse>(
        `/clients/${clientId}/bulk_input`,
        {
          entities: bulkInputEntities,
          validate_only: request.validateOnly ?? false,
        },
      );

      // Process response
      const result = this.processApiResponse(
        operationId,
        BulkOperationType.GENERIC_INPUT,
        request.entities.map((e) => e.employeeId),
        response,
        startTime,
      );

      // Update operation log
      await this.bulkOperationRepo.markCompleted(operationId, {
        successCount: result.successCount,
        failureCount: result.failureCount,
        resultData: toJsonObject({ results: result.results }),
        errors: toJsonArray(result.errors),
        warnings: toJsonArray(result.warnings),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      await this.bulkOperationRepo.markFailed(
        operationId,
        toJsonArray([
          {
            entityIndex: -1,
            entityId: null,
            errorCode: 'API_ERROR',
            errorMessage,
            field: null,
          },
        ]),
      );

      throw error;
    }
  }

  /**
   * Bulk adjust salaries for multiple employees
   * Supports percentage, absolute amount, or new salary value
   */
  async bulkAdjustSalaries(
    tenantId: string,
    request: BulkSalaryAdjustmentRequestDto,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    let operationId: string;

    // Create operation log
    const log = await this.bulkOperationRepo.create({
      tenantId,
      operationType: BulkOperationType.SALARY_ADJUSTMENT,
      totalEntities: request.adjustments.length,
      requestData: toJsonObject({
        adjustments: request.adjustments,
        validateOnly: request.validateOnly,
      }),
      executedBy: request.executedBy,
    });
    operationId = log.id;

    try {
      await this.bulkOperationRepo.markProcessing(operationId);

      // Validate adjustments
      const validationErrors = this.validateSalaryAdjustments(
        request.adjustments,
      );
      if (validationErrors.length > 0 && !request.validateOnly) {
        await this.bulkOperationRepo.markFailed(
          operationId,
          toJsonArray(validationErrors),
        );
        return {
          operationId,
          operationType: BulkOperationType.SALARY_ADJUSTMENT,
          status: BulkOperationStatus.FAILED,
          totalEntities: request.adjustments.length,
          successCount: 0,
          failureCount: validationErrors.length,
          results: [],
          errors: validationErrors,
          warnings: [],
          durationMs: Date.now() - startTime,
        };
      }

      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      // Convert to bulk input format
      const bulkInputEntities: BulkInputEntity[] = request.adjustments.map(
        (adj) => {
          let value: number;

          if (adj.newSalaryCents !== undefined) {
            // Direct salary value (convert cents to rands for API)
            value = adj.newSalaryCents / 100;
          } else if (adj.adjustmentPercentage !== undefined) {
            // Percentage adjustment - SimplePay handles this
            value = adj.adjustmentPercentage;
          } else if (adj.adjustmentAmountCents !== undefined) {
            // Absolute amount adjustment (convert cents to rands)
            value = adj.adjustmentAmountCents / 100;
          } else {
            value = 0;
          }

          return {
            employee_id: adj.simplePayEmployeeId,
            item_code: SIMPLEPAY_ITEM_CODES.BASIC_SALARY,
            value,
            start_date: adj.effectiveDate.toISOString().split('T')[0],
            description:
              adj.adjustmentPercentage !== undefined
                ? `Salary adjustment: ${adj.adjustmentPercentage > 0 ? '+' : ''}${adj.adjustmentPercentage}%`
                : 'Salary adjustment',
          };
        },
      );

      const response = await this.apiClient.post<SimplePayBulkInputResponse>(
        `/clients/${clientId}/bulk_input`,
        {
          entities: bulkInputEntities,
          validate_only: request.validateOnly ?? false,
        },
      );

      const result = this.processApiResponse(
        operationId,
        BulkOperationType.SALARY_ADJUSTMENT,
        request.adjustments.map((a) => a.employeeId),
        response,
        startTime,
      );

      await this.bulkOperationRepo.markCompleted(operationId, {
        successCount: result.successCount,
        failureCount: result.failureCount,
        resultData: toJsonObject({ results: result.results }),
        errors: toJsonArray(result.errors),
        warnings: toJsonArray(result.warnings),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      await this.bulkOperationRepo.markFailed(
        operationId,
        toJsonArray([
          {
            entityIndex: -1,
            entityId: null,
            errorCode: 'API_ERROR',
            errorMessage,
            field: null,
          },
        ]),
      );

      throw error;
    }
  }

  /**
   * Distribute bonuses to multiple employees
   * Can target specific payslip or be one-off
   */
  async distributeBonuses(
    tenantId: string,
    request: BulkBonusDistributionRequestDto,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    let operationId: string;

    const log = await this.bulkOperationRepo.create({
      tenantId,
      operationType: BulkOperationType.BONUS_DISTRIBUTION,
      totalEntities: request.bonuses.length,
      requestData: toJsonObject({
        bonuses: request.bonuses,
        validateOnly: request.validateOnly,
      }),
      executedBy: request.executedBy,
    });
    operationId = log.id;

    try {
      await this.bulkOperationRepo.markProcessing(operationId);

      // Validate bonuses
      const validationErrors = this.validateBonuses(request.bonuses);
      if (validationErrors.length > 0 && !request.validateOnly) {
        await this.bulkOperationRepo.markFailed(
          operationId,
          toJsonArray(validationErrors),
        );
        return {
          operationId,
          operationType: BulkOperationType.BONUS_DISTRIBUTION,
          status: BulkOperationStatus.FAILED,
          totalEntities: request.bonuses.length,
          successCount: 0,
          failureCount: validationErrors.length,
          results: [],
          errors: validationErrors,
          warnings: [],
          durationMs: Date.now() - startTime,
        };
      }

      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      // Convert to bulk input format
      const bulkInputEntities: BulkInputEntity[] = request.bonuses.map(
        (bonus) => ({
          employee_id: bonus.simplePayEmployeeId,
          item_code: BONUS_TYPE_TO_ITEM_CODE[bonus.bonusType],
          value: bonus.amountCents / 100, // Convert cents to rands
          description: bonus.description || `${bonus.bonusType} bonus`,
          payslip_id: bonus.payslipId || request.payslipId,
        }),
      );

      const response = await this.apiClient.post<SimplePayBulkInputResponse>(
        `/clients/${clientId}/bulk_input`,
        {
          entities: bulkInputEntities,
          validate_only: request.validateOnly ?? false,
        },
      );

      const result = this.processApiResponse(
        operationId,
        BulkOperationType.BONUS_DISTRIBUTION,
        request.bonuses.map((b) => b.employeeId),
        response,
        startTime,
      );

      await this.bulkOperationRepo.markCompleted(operationId, {
        successCount: result.successCount,
        failureCount: result.failureCount,
        resultData: toJsonObject({ results: result.results }),
        errors: toJsonArray(result.errors),
        warnings: toJsonArray(result.warnings),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      await this.bulkOperationRepo.markFailed(
        operationId,
        toJsonArray([
          {
            entityIndex: -1,
            entityId: null,
            errorCode: 'API_ERROR',
            errorMessage,
            field: null,
          },
        ]),
      );

      throw error;
    }
  }

  /**
   * Setup deductions for multiple employees
   * Supports recurring and one-time deductions with date ranges
   */
  async setupBulkDeductions(
    tenantId: string,
    request: BulkDeductionSetupRequestDto,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    let operationId: string;

    const log = await this.bulkOperationRepo.create({
      tenantId,
      operationType: BulkOperationType.DEDUCTION_SETUP,
      totalEntities: request.deductions.length,
      requestData: toJsonObject({
        deductions: request.deductions,
        validateOnly: request.validateOnly,
      }),
      executedBy: request.executedBy,
    });
    operationId = log.id;

    try {
      await this.bulkOperationRepo.markProcessing(operationId);

      // Validate deductions
      const validationErrors = this.validateDeductions(request.deductions);
      if (validationErrors.length > 0 && !request.validateOnly) {
        await this.bulkOperationRepo.markFailed(
          operationId,
          toJsonArray(validationErrors),
        );
        return {
          operationId,
          operationType: BulkOperationType.DEDUCTION_SETUP,
          status: BulkOperationStatus.FAILED,
          totalEntities: request.deductions.length,
          successCount: 0,
          failureCount: validationErrors.length,
          results: [],
          errors: validationErrors,
          warnings: [],
          durationMs: Date.now() - startTime,
        };
      }

      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      // Convert to bulk input format
      const bulkInputEntities: BulkInputEntity[] = request.deductions.map(
        (ded) => ({
          employee_id: ded.simplePayEmployeeId,
          item_code: ded.deductionCode,
          value:
            ded.amountCents !== undefined
              ? ded.amountCents / 100
              : ded.percentage,
          start_date: ded.startDate.toISOString().split('T')[0],
          end_date: ded.endDate?.toISOString().split('T')[0],
          description: ded.deductionName,
        }),
      );

      const response = await this.apiClient.post<SimplePayBulkInputResponse>(
        `/clients/${clientId}/bulk_input`,
        {
          entities: bulkInputEntities,
          validate_only: request.validateOnly ?? false,
        },
      );

      const result = this.processApiResponse(
        operationId,
        BulkOperationType.DEDUCTION_SETUP,
        request.deductions.map((d) => d.employeeId),
        response,
        startTime,
      );

      await this.bulkOperationRepo.markCompleted(operationId, {
        successCount: result.successCount,
        failureCount: result.failureCount,
        resultData: toJsonObject({ results: result.results }),
        errors: toJsonArray(result.errors),
        warnings: toJsonArray(result.warnings),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      await this.bulkOperationRepo.markFailed(
        operationId,
        toJsonArray([
          {
            entityIndex: -1,
            entityId: null,
            errorCode: 'API_ERROR',
            errorMessage,
            field: null,
          },
        ]),
      );

      throw error;
    }
  }

  /**
   * Bulk update employee details (contact, banking, address)
   */
  async bulkUpdateEmployees(
    tenantId: string,
    request: BulkEmployeeUpdateRequestDto,
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    let operationId: string;

    const log = await this.bulkOperationRepo.create({
      tenantId,
      operationType: BulkOperationType.EMPLOYEE_UPDATE,
      totalEntities: request.updates.length,
      requestData: toJsonObject({
        updates: request.updates,
        validateOnly: request.validateOnly,
      }),
      executedBy: request.executedBy,
    });
    operationId = log.id;

    try {
      await this.bulkOperationRepo.markProcessing(operationId);

      await this.apiClient.initializeForTenant(tenantId);
      const clientId = this.apiClient.getClientId();

      // For employee updates, we need to use PATCH on individual employees
      // SimplePay doesn't have a bulk employee update endpoint
      // So we batch them efficiently
      const results: BulkEntityResult[] = [];
      const errors: BulkOperationError[] = [];
      let successCount = 0;
      let failureCount = 0;

      // Process updates in batches to respect rate limits
      const batchSize = 10;
      for (let i = 0; i < request.updates.length; i += batchSize) {
        const batch = request.updates.slice(i, i + batchSize);

        const batchPromises = batch.map(async (update, batchIndex) => {
          const entityIndex = i + batchIndex;

          if (request.validateOnly) {
            // Validate only mode
            return {
              entityIndex,
              entityId: update.employeeId,
              success: true,
              simplePayId: update.simplePayEmployeeId,
              errorMessage: null,
            };
          }

          try {
            // Build update payload
            const updatePayload: Record<string, unknown> = {};

            if (update.updates.email) {
              updatePayload.email = update.updates.email;
            }
            if (update.updates.mobile) {
              updatePayload.mobile = update.updates.mobile;
            }
            if (update.updates.address) {
              updatePayload.address = update.updates.address;
            }
            if (
              update.updates.bankAccountNumber ||
              update.updates.bankBranchCode
            ) {
              updatePayload.bank_account = {
                account_number: update.updates.bankAccountNumber,
                branch_code: update.updates.bankBranchCode,
                account_type: update.updates.bankAccountType || 'Current',
              };
            }

            await this.apiClient.patch(
              `/clients/${clientId}/employees/${update.simplePayEmployeeId}`,
              { employee: updatePayload },
            );

            successCount++;
            return {
              entityIndex,
              entityId: update.employeeId,
              success: true,
              simplePayId: update.simplePayEmployeeId,
              errorMessage: null,
            };
          } catch (error) {
            failureCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';

            errors.push({
              entityIndex,
              entityId: update.employeeId,
              errorCode: 'UPDATE_FAILED',
              errorMessage,
              field: null,
            });

            return {
              entityIndex,
              entityId: update.employeeId,
              success: false,
              simplePayId: update.simplePayEmployeeId,
              errorMessage,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      const status =
        failureCount === 0
          ? BulkOperationStatus.COMPLETED
          : successCount > 0
            ? BulkOperationStatus.PARTIAL_FAILURE
            : BulkOperationStatus.FAILED;

      const result: BulkOperationResult = {
        operationId,
        operationType: BulkOperationType.EMPLOYEE_UPDATE,
        status,
        totalEntities: request.updates.length,
        successCount,
        failureCount,
        results,
        errors,
        warnings: [],
        durationMs: Date.now() - startTime,
      };

      await this.bulkOperationRepo.markCompleted(operationId, {
        successCount,
        failureCount,
        resultData: toJsonObject({ results }),
        errors: toJsonArray(errors),
        warnings: toJsonArray([]),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

      await this.bulkOperationRepo.markFailed(
        operationId,
        toJsonArray([
          {
            entityIndex: -1,
            entityId: null,
            errorCode: 'API_ERROR',
            errorMessage,
            field: null,
          },
        ]),
      );

      throw error;
    }
  }

  /**
   * Validate a bulk operation without executing it (dry run)
   */
  async validateBulkOperation(
    tenantId: string,
    operationType: BulkOperationType,
    request:
      | BulkInputRequestDto
      | BulkSalaryAdjustmentRequestDto
      | BulkBonusDistributionRequestDto
      | BulkDeductionSetupRequestDto
      | BulkEmployeeUpdateRequestDto,
  ): Promise<BulkValidationResult[]> {
    // Set validate only flag
    const validateRequest = { ...request, validateOnly: true };

    switch (operationType) {
      case BulkOperationType.GENERIC_INPUT:
        await this.processBulkInput(
          tenantId,
          validateRequest as BulkInputRequestDto,
        );
        break;
      case BulkOperationType.SALARY_ADJUSTMENT:
        await this.bulkAdjustSalaries(
          tenantId,
          validateRequest as BulkSalaryAdjustmentRequestDto,
        );
        break;
      case BulkOperationType.BONUS_DISTRIBUTION:
        await this.distributeBonuses(
          tenantId,
          validateRequest as BulkBonusDistributionRequestDto,
        );
        break;
      case BulkOperationType.DEDUCTION_SETUP:
        await this.setupBulkDeductions(
          tenantId,
          validateRequest as BulkDeductionSetupRequestDto,
        );
        break;
      case BulkOperationType.EMPLOYEE_UPDATE:
        await this.bulkUpdateEmployees(
          tenantId,
          validateRequest as BulkEmployeeUpdateRequestDto,
        );
        break;
    }

    // Return validation results (simplified)
    return [];
  }

  /**
   * Get operation history for a tenant
   */
  async getOperationHistory(
    tenantId: string,
    options?: {
      operationType?: BulkOperationType;
      status?: BulkOperationStatus;
      fromDate?: Date;
      toDate?: Date;
      page?: number;
      limit?: number;
    },
  ) {
    return this.bulkOperationRepo.findByTenant(tenantId, options);
  }

  /**
   * Get a specific operation log
   */
  async getOperationLog(operationId: string) {
    return this.bulkOperationRepo.findByIdOrThrow(operationId);
  }

  /**
   * Get operation statistics
   */
  async getOperationStats(tenantId: string, fromDate?: Date, toDate?: Date) {
    return this.bulkOperationRepo.getStatsByTenant(tenantId, fromDate, toDate);
  }

  // Private helper methods

  private processApiResponse(
    operationId: string,
    operationType: BulkOperationType,
    entityIds: string[],
    response: SimplePayBulkInputResponse,
    startTime: number,
  ): BulkOperationResult {
    const bulkInput = response.bulk_input;

    const results: BulkEntityResult[] = bulkInput.results.map((r, index) => ({
      entityIndex: r.index ?? index,
      entityId: entityIds[r.index ?? index] || '',
      success: r.success,
      simplePayId: r.id?.toString() || null,
      errorMessage: r.error || null,
    }));

    const errors: BulkOperationError[] = (bulkInput.errors || []).map((e) => ({
      entityIndex: e.index,
      entityId: entityIds[e.index] || null,
      errorCode: 'SIMPLEPAY_ERROR',
      errorMessage: e.error,
      field: e.field || null,
    }));

    const warnings: BulkOperationWarning[] = (bulkInput.warnings || []).map(
      (w) => ({
        entityIndex: w.index,
        entityId: entityIds[w.index] || null,
        warningCode: 'SIMPLEPAY_WARNING',
        warningMessage: w.warning,
      }),
    );

    const status =
      bulkInput.failed === 0
        ? BulkOperationStatus.COMPLETED
        : bulkInput.successful > 0
          ? BulkOperationStatus.PARTIAL_FAILURE
          : BulkOperationStatus.FAILED;

    return {
      operationId,
      operationType,
      status,
      totalEntities: bulkInput.processed,
      successCount: bulkInput.successful,
      failureCount: bulkInput.failed,
      results,
      errors,
      warnings,
      durationMs: Date.now() - startTime,
    };
  }

  private validateSalaryAdjustments(
    adjustments: BulkSalaryAdjustmentRequestDto['adjustments'],
  ): BulkOperationError[] {
    const errors: BulkOperationError[] = [];

    adjustments.forEach((adj, index) => {
      // Check that at least one adjustment type is specified
      const hasAdjustment =
        adj.newSalaryCents !== undefined ||
        adj.adjustmentPercentage !== undefined ||
        adj.adjustmentAmountCents !== undefined;

      if (!hasAdjustment) {
        errors.push({
          entityIndex: index,
          entityId: adj.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage:
            'At least one of newSalaryCents, adjustmentPercentage, or adjustmentAmountCents must be specified',
          field: null,
        });
      }

      // Check that only one adjustment type is specified
      const adjustmentCount = [
        adj.newSalaryCents,
        adj.adjustmentPercentage,
        adj.adjustmentAmountCents,
      ].filter((v) => v !== undefined).length;

      if (adjustmentCount > 1) {
        errors.push({
          entityIndex: index,
          entityId: adj.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage:
            'Only one of newSalaryCents, adjustmentPercentage, or adjustmentAmountCents should be specified',
          field: null,
        });
      }

      // Validate percentage range
      if (
        adj.adjustmentPercentage !== undefined &&
        (adj.adjustmentPercentage < -100 || adj.adjustmentPercentage > 100)
      ) {
        errors.push({
          entityIndex: index,
          entityId: adj.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: 'adjustmentPercentage must be between -100 and 100',
          field: 'adjustmentPercentage',
        });
      }
    });

    return errors;
  }

  private validateBonuses(
    bonuses: BulkBonusDistributionRequestDto['bonuses'],
  ): BulkOperationError[] {
    const errors: BulkOperationError[] = [];

    bonuses.forEach((bonus, index) => {
      if (bonus.amountCents <= 0) {
        errors.push({
          entityIndex: index,
          entityId: bonus.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: 'Bonus amount must be greater than 0',
          field: 'amountCents',
        });
      }
    });

    return errors;
  }

  private validateDeductions(
    deductions: BulkDeductionSetupRequestDto['deductions'],
  ): BulkOperationError[] {
    const errors: BulkOperationError[] = [];

    deductions.forEach((ded, index) => {
      // Check that either amount or percentage is specified
      if (ded.amountCents === undefined && ded.percentage === undefined) {
        errors.push({
          entityIndex: index,
          entityId: ded.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: 'Either amountCents or percentage must be specified',
          field: null,
        });
      }

      // Check that not both amount and percentage are specified
      if (ded.amountCents !== undefined && ded.percentage !== undefined) {
        errors.push({
          entityIndex: index,
          entityId: ded.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage:
            'Only one of amountCents or percentage should be specified',
          field: null,
        });
      }

      // Validate end date is after start date
      if (ded.endDate && ded.endDate < ded.startDate) {
        errors.push({
          entityIndex: index,
          entityId: ded.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: 'End date must be after start date',
          field: 'endDate',
        });
      }
    });

    return errors;
  }
}
