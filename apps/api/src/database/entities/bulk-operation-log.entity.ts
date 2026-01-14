/**
 * Bulk Operation Log Entity
 * TASK-SPAY-007: SimplePay Bulk Operations Service
 */

import type {
  BulkOperationLog as PrismaBulkOperationLog,
  Prisma,
} from '@prisma/client';

// Re-export enums from Prisma
export enum BulkOperationType {
  GENERIC_INPUT = 'GENERIC_INPUT',
  SALARY_ADJUSTMENT = 'SALARY_ADJUSTMENT',
  BONUS_DISTRIBUTION = 'BONUS_DISTRIBUTION',
  DEDUCTION_SETUP = 'DEDUCTION_SETUP',
  EMPLOYEE_UPDATE = 'EMPLOYEE_UPDATE',
}

export enum BulkOperationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL_FAILURE = 'PARTIAL_FAILURE',
  FAILED = 'FAILED',
}

// Type alias for the Prisma model
export type IBulkOperationLog = PrismaBulkOperationLog;

// Input type for JSON fields
export type BulkOperationJsonInput = Prisma.InputJsonValue;

/**
 * Error details for bulk operations
 */
export interface BulkOperationError {
  entityIndex: number;
  entityId: string | null;
  errorCode: string;
  errorMessage: string;
  field: string | null;
}

/**
 * Warning details for bulk operations
 */
export interface BulkOperationWarning {
  entityIndex: number;
  entityId: string | null;
  warningCode: string;
  warningMessage: string;
}

/**
 * Result for individual entity processing
 */
export interface BulkEntityResult {
  entityIndex: number;
  entityId: string;
  success: boolean;
  simplePayId: string | null;
  errorMessage: string | null;
}

/**
 * SimplePay bulk_input API response
 */
export interface SimplePayBulkInputResponse {
  bulk_input: {
    processed: number;
    successful: number;
    failed: number;
    results: Array<{
      index: number;
      id?: string | number;
      success: boolean;
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

/**
 * Bulk operation result summary
 */
export interface BulkOperationResult {
  operationId: string;
  operationType: BulkOperationType;
  status: BulkOperationStatus;
  totalEntities: number;
  successCount: number;
  failureCount: number;
  results: BulkEntityResult[];
  errors: BulkOperationError[];
  warnings: BulkOperationWarning[];
  durationMs: number;
}

/**
 * Bulk salary adjustment entity
 */
export interface BulkSalaryAdjustmentEntity {
  employeeId: string;
  simplePayEmployeeId: string;
  newSalaryCents: number | null;
  adjustmentPercentage: number | null;
  adjustmentAmountCents: number | null;
  effectiveDate: Date;
}

/**
 * Bonus distribution entity
 */
export interface BulkBonusEntity {
  employeeId: string;
  simplePayEmployeeId: string;
  amountCents: number;
  bonusType: BonusType;
  description: string | null;
  payslipId: string | null;
}

export enum BonusType {
  ANNUAL = 'ANNUAL',
  PERFORMANCE = 'PERFORMANCE',
  THIRTEENTH_CHEQUE = 'THIRTEENTH_CHEQUE',
  DISCRETIONARY = 'DISCRETIONARY',
  ONE_OFF = 'ONE_OFF',
}

/**
 * Bulk deduction entity
 */
export interface BulkDeductionEntity {
  employeeId: string;
  simplePayEmployeeId: string;
  deductionCode: string;
  deductionName: string;
  amountCents: number | null;
  percentage: number | null;
  startDate: Date;
  endDate: Date | null;
  isRecurring: boolean;
}

/**
 * Bulk employee update entity
 */
export interface BulkEmployeeUpdateEntity {
  employeeId: string;
  simplePayEmployeeId: string;
  updates: {
    email: string | null;
    mobile: string | null;
    address: string | null;
    bankAccountNumber: string | null;
    bankBranchCode: string | null;
    bankAccountType: string | null;
  };
}

/**
 * Generic bulk input entity for SimplePay API
 */
export interface BulkInputEntity {
  employee_id: string | number;
  item_code: string;
  value?: number | string;
  start_date?: string;
  end_date?: string;
  description?: string;
  payslip_id?: string | number;
}

/**
 * Validation result for bulk operations
 */
export interface BulkValidationResult {
  isValid: boolean;
  entityIndex: number;
  entityId: string;
  errors: string[];
  warnings: string[];
}
