/**
 * Bulk Operations DTOs
 * TASK-SPAY-007: SimplePay Bulk Operations Service
 */

import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  IsDate,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BulkOperationType,
  BulkOperationStatus,
  BonusType,
} from '../entities/bulk-operation-log.entity';

// =================================================
// Generic Bulk Input DTOs
// =================================================

/**
 * Single entity for generic bulk input
 */
export class BulkEntityDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  simplePayEmployeeId!: string;

  @IsString()
  @IsNotEmpty()
  itemCode!: string;

  @IsOptional()
  value?: number | string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  payslipId?: string;
}

/**
 * Request DTO for generic bulk input
 */
export class BulkInputRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkEntityDto)
  entities!: BulkEntityDto[];

  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;

  @IsString()
  @IsNotEmpty()
  executedBy!: string;
}

// =================================================
// Salary Adjustment DTOs
// =================================================

/**
 * Single salary adjustment entity
 */
export class SalaryAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  simplePayEmployeeId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  newSalaryCents?: number;

  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  adjustmentPercentage?: number;

  @IsOptional()
  @IsInt()
  adjustmentAmountCents?: number;

  @Type(() => Date)
  @IsDate()
  effectiveDate!: Date;
}

/**
 * Request DTO for bulk salary adjustments
 */
export class BulkSalaryAdjustmentRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryAdjustmentDto)
  adjustments!: SalaryAdjustmentDto[];

  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;

  @IsString()
  @IsNotEmpty()
  executedBy!: string;
}

// =================================================
// Bonus Distribution DTOs
// =================================================

/**
 * Single bonus distribution entity
 */
export class BonusDistributionDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  simplePayEmployeeId!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsEnum(BonusType)
  bonusType!: BonusType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  payslipId?: string;
}

/**
 * Request DTO for bulk bonus distribution
 */
export class BulkBonusDistributionRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusDistributionDto)
  bonuses!: BonusDistributionDto[];

  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;

  @IsOptional()
  @IsString()
  payslipId?: string;

  @IsString()
  @IsNotEmpty()
  executedBy!: string;
}

// =================================================
// Deduction Setup DTOs
// =================================================

/**
 * Single deduction entity
 */
export class BulkDeductionDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  simplePayEmployeeId!: string;

  @IsString()
  @IsNotEmpty()
  deductionCode!: string;

  @IsString()
  @IsNotEmpty()
  deductionName!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsBoolean()
  isRecurring!: boolean;
}

/**
 * Request DTO for bulk deduction setup
 */
export class BulkDeductionSetupRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkDeductionDto)
  deductions!: BulkDeductionDto[];

  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;

  @IsString()
  @IsNotEmpty()
  executedBy!: string;
}

// =================================================
// Employee Update DTOs
// =================================================

/**
 * Employee update fields
 */
export class EmployeeUpdateFieldsDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankBranchCode?: string;

  @IsOptional()
  @IsString()
  bankAccountType?: string;
}

/**
 * Single employee update entity
 */
export class BulkEmployeeUpdateDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  simplePayEmployeeId!: string;

  @ValidateNested()
  @Type(() => EmployeeUpdateFieldsDto)
  updates!: EmployeeUpdateFieldsDto;
}

/**
 * Request DTO for bulk employee updates
 */
export class BulkEmployeeUpdateRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkEmployeeUpdateDto)
  updates!: BulkEmployeeUpdateDto[];

  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;

  @IsString()
  @IsNotEmpty()
  executedBy!: string;
}

// =================================================
// Response DTOs
// =================================================

/**
 * Individual operation error
 */
export class BulkOperationErrorDto {
  entityIndex!: number;
  entityId!: string | null;
  errorCode!: string;
  errorMessage!: string;
  field!: string | null;
}

/**
 * Individual operation warning
 */
export class BulkOperationWarningDto {
  entityIndex!: number;
  entityId!: string | null;
  warningCode!: string;
  warningMessage!: string;
}

/**
 * Result for single entity
 */
export class BulkEntityResultDto {
  entityIndex!: number;
  entityId!: string;
  success!: boolean;
  simplePayId!: string | null;
  errorMessage!: string | null;
}

/**
 * Overall bulk operation result
 */
export class BulkOperationResultDto {
  operationId!: string;
  operationType!: BulkOperationType;
  status!: BulkOperationStatus;
  totalEntities!: number;
  successCount!: number;
  failureCount!: number;
  results!: BulkEntityResultDto[];
  errors!: BulkOperationErrorDto[];
  warnings!: BulkOperationWarningDto[];
  durationMs!: number;
}

// =================================================
// Query DTOs
// =================================================

/**
 * Query parameters for listing bulk operation logs
 */
export class BulkOperationLogQueryDto {
  @IsOptional()
  @IsEnum(BulkOperationType)
  operationType?: BulkOperationType;

  @IsOptional()
  @IsEnum(BulkOperationStatus)
  status?: BulkOperationStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * DTO for creating a bulk operation log
 */
export class CreateBulkOperationLogDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsEnum(BulkOperationType)
  operationType!: BulkOperationType;

  @IsInt()
  @Min(1)
  totalEntities!: number;

  requestData!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  executedBy!: string;
}

/**
 * DTO for updating a bulk operation log
 */
export class UpdateBulkOperationLogDto {
  @IsOptional()
  @IsEnum(BulkOperationStatus)
  status?: BulkOperationStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  successCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  failureCount?: number;

  @IsOptional()
  resultData?: Record<string, unknown>;

  @IsOptional()
  errors?: Record<string, unknown>[];

  @IsOptional()
  warnings?: Record<string, unknown>[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedAt?: Date;
}
