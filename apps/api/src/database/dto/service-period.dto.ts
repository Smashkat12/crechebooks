/**
 * Service Period Management DTOs
 * TASK-SPAY-004: SimplePay Service Period Management
 *
 * DTOs for service period tracking, termination processing,
 * and reinstatement operations with SA UI-19 termination codes.
 */

import {
  IsString,
  IsOptional,
  IsDate,
  IsBoolean,
  IsUUID,
  IsIn,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { TerminationCode } from '@prisma/client';
import {
  TERMINATION_CODE_DESCRIPTIONS,
  UIF_ELIGIBILITY,
} from '../entities/service-period.entity';

/**
 * Valid termination code values for validation
 */
const TERMINATION_CODES = [
  'RESIGNATION',
  'DISMISSAL_MISCONDUCT',
  'DISMISSAL_INCAPACITY',
  'RETRENCHMENT',
  'CONTRACT_EXPIRY',
  'RETIREMENT',
  'DEATH',
  'ABSCONDED',
  'TRANSFER',
] as const;

// ============================================
// Request DTOs
// ============================================

/**
 * Create Service Period Sync DTO
 */
export class CreateServicePeriodSyncDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'Staff ID' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ description: 'SimplePay employee ID' })
  @IsString()
  @MaxLength(50)
  simplePayEmployeeId: string;

  @ApiProperty({ description: 'SimplePay service period ID' })
  @IsString()
  @MaxLength(50)
  simplePayPeriodId: string;

  @ApiProperty({ description: 'Service period start date' })
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiPropertyOptional({
    description: 'Service period end date (null if active)',
  })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date | null;

  @ApiPropertyOptional({
    description: 'SA UI-19 termination code',
    enum: TERMINATION_CODES,
  })
  @IsOptional()
  @IsIn(TERMINATION_CODES)
  terminationCode?: TerminationCode | null;

  @ApiPropertyOptional({ description: 'Termination reason/notes' })
  @IsOptional()
  @IsString()
  terminationReason?: string | null;

  @ApiPropertyOptional({ description: 'Last working day' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  lastWorkingDay?: Date | null;

  @ApiPropertyOptional({ description: 'Final payslip ID from SimplePay' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  finalPayslipId?: string | null;

  @ApiPropertyOptional({
    description: 'Whether service period is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Update Service Period Sync DTO
 */
export class UpdateServicePeriodSyncDto {
  @ApiPropertyOptional({ description: 'Service period end date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date | null;

  @ApiPropertyOptional({
    description: 'SA UI-19 termination code',
    enum: TERMINATION_CODES,
  })
  @IsOptional()
  @IsIn(TERMINATION_CODES)
  terminationCode?: TerminationCode | null;

  @ApiPropertyOptional({ description: 'Termination reason/notes' })
  @IsOptional()
  @IsString()
  terminationReason?: string | null;

  @ApiPropertyOptional({ description: 'Last working day' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  lastWorkingDay?: Date | null;

  @ApiPropertyOptional({ description: 'Final payslip ID from SimplePay' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  finalPayslipId?: string | null;

  @ApiPropertyOptional({ description: 'Whether service period is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Terminate Employee DTO
 */
export class TerminateEmployeeDto {
  @ApiProperty({ description: 'Staff ID to terminate' })
  @IsUUID()
  staffId: string;

  @ApiProperty({
    description: 'SA UI-19 termination code',
    enum: TERMINATION_CODES,
  })
  @IsIn(TERMINATION_CODES)
  terminationCode: TerminationCode;

  @ApiProperty({ description: 'Last working day' })
  @IsDate()
  @Type(() => Date)
  lastWorkingDay: Date;

  @ApiProperty({ description: 'Service period end date' })
  @IsDate()
  @Type(() => Date)
  endDate: Date;

  @ApiPropertyOptional({ description: 'Termination reason/notes' })
  @IsOptional()
  @IsString()
  terminationReason?: string | null;

  @ApiPropertyOptional({
    description: 'Whether to generate final payslip',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  generateFinalPayslip?: boolean;
}

/**
 * Reinstate Employee DTO
 */
export class ReinstateEmployeeDto {
  @ApiProperty({ description: 'Staff ID to reinstate' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ description: 'Effective date of reinstatement' })
  @IsDate()
  @Type(() => Date)
  effectiveDate: Date;

  @ApiPropertyOptional({ description: 'Reason for reinstatement' })
  @IsOptional()
  @IsString()
  reason?: string | null;

  @ApiPropertyOptional({
    description: 'Whether to preserve employment history',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  preserveHistory?: boolean;
}

/**
 * Undo Termination DTO
 */
export class UndoTerminationDto {
  @ApiProperty({ description: 'Staff ID' })
  @IsUUID()
  staffId: string;

  @ApiPropertyOptional({ description: 'Reason for undoing termination' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Service Period Filter DTO
 */
export class ServicePeriodFilterDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by staff ID' })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiPropertyOptional({
    description: 'Filter by termination code',
    enum: TERMINATION_CODES,
  })
  @IsOptional()
  @IsIn(TERMINATION_CODES)
  terminationCode?: TerminationCode;

  @ApiPropertyOptional({ description: 'Start date from filter' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDateFrom?: Date;

  @ApiPropertyOptional({ description: 'Start date to filter' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDateTo?: Date;

  @ApiPropertyOptional({ description: 'End date from filter' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDateFrom?: Date;

  @ApiPropertyOptional({ description: 'End date to filter' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDateTo?: Date;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

// ============================================
// Response DTOs
// ============================================

/**
 * Service Period Response DTO
 */
export class ServicePeriodResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayEmployeeId: string;

  @ApiProperty()
  simplePayPeriodId: string;

  @ApiProperty()
  startDate: Date;

  @ApiPropertyOptional()
  endDate: Date | null;

  @ApiPropertyOptional({ enum: TERMINATION_CODES })
  terminationCode: TerminationCode | null;

  @ApiPropertyOptional()
  terminationCodeDescription: string | null;

  @ApiPropertyOptional()
  terminationReason: string | null;

  @ApiPropertyOptional()
  lastWorkingDay: Date | null;

  @ApiPropertyOptional()
  finalPayslipId: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  uifEligible: boolean | null;

  @ApiPropertyOptional()
  uifWaitingPeriod: boolean | null;

  @ApiProperty()
  syncedAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

/**
 * Service Periods List Response DTO
 */
export class ServicePeriodsListResponseDto {
  @ApiProperty({ type: [ServicePeriodResponseDto] })
  data: ServicePeriodResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

/**
 * Termination Result DTO
 */
export class TerminationResultDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  servicePeriodId: string | null;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayEmployeeId: string;

  @ApiProperty({ enum: TERMINATION_CODES })
  terminationCode: TerminationCode;

  @ApiProperty()
  terminationCodeDescription: string;

  @ApiProperty()
  lastWorkingDay: Date;

  @ApiProperty()
  endDate: Date;

  @ApiPropertyOptional()
  finalPayslipId: string | null;

  @ApiProperty()
  uifEligible: boolean;

  @ApiProperty()
  uifWaitingPeriod: boolean;

  @ApiProperty()
  uifNotes: string;

  @ApiPropertyOptional()
  error: string | null;
}

/**
 * Reinstatement Result DTO
 */
export class ReinstatementResultDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  servicePeriodId: string | null;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayEmployeeId: string;

  @ApiPropertyOptional()
  newServicePeriodId: string | null;

  @ApiProperty()
  startDate: Date;

  @ApiPropertyOptional()
  error: string | null;
}

/**
 * Undo Termination Result DTO
 */
export class UndoTerminationResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  staffId: string;

  @ApiPropertyOptional()
  servicePeriodId: string | null;

  @ApiPropertyOptional()
  message: string | null;

  @ApiPropertyOptional()
  error: string | null;
}

/**
 * Termination Code Info DTO
 */
export class TerminationCodeInfoDto {
  @ApiProperty({ enum: TERMINATION_CODES })
  code: TerminationCode;

  @ApiProperty()
  simplePayCode: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  uifEligible: boolean;

  @ApiProperty()
  uifWaitingPeriod: boolean;

  @ApiProperty()
  uifNotes: string;
}

/**
 * All Termination Codes Response DTO
 */
export class TerminationCodesResponseDto {
  @ApiProperty({ type: [TerminationCodeInfoDto] })
  codes: TerminationCodeInfoDto[];
}

// ============================================
// Helper Functions for DTO Mapping
// ============================================

/**
 * Map service period sync entity to response DTO
 */
export function mapServicePeriodToResponseDto(entity: {
  id: string;
  tenantId: string;
  staffId: string;
  simplePayEmployeeId: string;
  simplePayPeriodId: string;
  startDate: Date;
  endDate: Date | null;
  terminationCode: TerminationCode | null;
  terminationReason: string | null;
  lastWorkingDay: Date | null;
  finalPayslipId: string | null;
  isActive: boolean;
  syncedAt: Date;
  updatedAt: Date;
}): ServicePeriodResponseDto {
  const terminationCode = entity.terminationCode;

  return {
    id: entity.id,
    tenantId: entity.tenantId,
    staffId: entity.staffId,
    simplePayEmployeeId: entity.simplePayEmployeeId,
    simplePayPeriodId: entity.simplePayPeriodId,
    startDate: entity.startDate,
    endDate: entity.endDate,
    terminationCode,
    terminationCodeDescription: terminationCode
      ? TERMINATION_CODE_DESCRIPTIONS[terminationCode]
      : null,
    terminationReason: entity.terminationReason,
    lastWorkingDay: entity.lastWorkingDay,
    finalPayslipId: entity.finalPayslipId,
    isActive: entity.isActive,
    uifEligible: terminationCode
      ? UIF_ELIGIBILITY[terminationCode].eligible
      : null,
    uifWaitingPeriod: terminationCode
      ? UIF_ELIGIBILITY[terminationCode].waitingPeriod
      : null,
    syncedAt: entity.syncedAt,
    updatedAt: entity.updatedAt,
  };
}
