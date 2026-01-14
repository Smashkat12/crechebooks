/**
 * Calculation DTOs
 * TASK-SPAY-003: SimplePay Calculation Items Retrieval with Caching
 */

import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDate,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CalculationType } from '@prisma/client';

/**
 * DTO for creating a calculation item cache entry
 */
export class CreateCalculationItemCacheDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEnum(CalculationType)
  type!: CalculationType;

  @IsBoolean()
  taxable!: boolean;

  @IsBoolean()
  affectsUif!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

/**
 * DTO for updating a calculation item cache entry
 */
export class UpdateCalculationItemCacheDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEnum(CalculationType)
  type?: CalculationType;

  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @IsOptional()
  @IsBoolean()
  affectsUif?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

/**
 * DTO for filtering calculation item cache entries
 */
export class CalculationItemCacheFilterDto {
  @IsOptional()
  @IsEnum(CalculationType)
  type?: CalculationType;

  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @IsOptional()
  @IsBoolean()
  affectsUif?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * DTO for creating a payroll adjustment
 */
export class CreatePayrollAdjustmentDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  staffId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  itemCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  itemName!: string;

  @IsEnum(CalculationType)
  type!: CalculationType;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @Type(() => Date)
  @IsDate()
  effectiveDate!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

/**
 * DTO for updating a payroll adjustment
 */
export class UpdatePayrollAdjustmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  itemCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  itemName?: string;

  @IsOptional()
  @IsEnum(CalculationType)
  type?: CalculationType;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsString()
  simplePayCalcId?: string;

  @IsOptional()
  @IsBoolean()
  syncedToSimplePay?: boolean;
}

/**
 * DTO for filtering payroll adjustments
 */
export class PayrollAdjustmentFilterDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsString()
  itemCode?: string;

  @IsOptional()
  @IsEnum(CalculationType)
  type?: CalculationType;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsBoolean()
  syncedToSimplePay?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveDate?: Date;
}

/**
 * DTO for bulk upsert of calculation items
 */
export class BulkUpsertCalculationItemsDto {
  @IsUUID()
  tenantId!: string;

  items!: Array<{
    code: string;
    name: string;
    type: CalculationType;
    taxable: boolean;
    affectsUif: boolean;
    category?: string;
  }>;
}

/**
 * DTO for sync request
 */
export class SyncCalculationItemsDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;
}

/**
 * Response DTO for cache status
 */
export class CacheStatusResponseDto {
  isValid!: boolean;
  itemCount!: number;
  cachedAt!: Date | null;
  needsRefresh!: boolean;
}

/**
 * Response DTO for calculation sync result
 */
export class CalculationSyncResultDto {
  success!: boolean;
  synced!: number;
  failed!: number;
  errors!: Array<{ code: string; error: string }>;
}
