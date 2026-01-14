/**
 * Employee Setup DTOs
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * DTOs for employee setup pipeline requests and responses.
 */

import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SetupStatus,
  PipelineStep,
  SetupStepStatus,
} from '../entities/employee-setup-log.entity';

/**
 * Leave entitlements DTO
 */
export class LeaveEntitlementsDto {
  @IsNumber()
  @Min(0)
  @Max(30)
  annualDays!: number;

  @IsNumber()
  @Min(0)
  @Max(30)
  sickDays!: number;

  @IsNumber()
  @Min(0)
  @Max(5)
  familyResponsibilityDays!: number;

  @IsNumber()
  @Min(0)
  @Max(6)
  @IsOptional()
  maternityMonths?: number;
}

/**
 * Tax settings DTO
 */
export class TaxSettingsDto {
  @IsString()
  @IsOptional()
  taxNumber?: string | null;

  @IsString()
  @IsOptional()
  taxStatus?: string; // 'RESIDENT', 'NON_RESIDENT', 'DIRECTIVE'

  @IsBoolean()
  @IsOptional()
  directorIndicator?: boolean;
}

/**
 * Additional calculation DTO
 */
export class AdditionalCalculationDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsEnum(['EARNING', 'DEDUCTION', 'COMPANY_CONTRIBUTION'])
  type!: 'EARNING' | 'DEDUCTION' | 'COMPANY_CONTRIBUTION';

  @IsNumber()
  @IsOptional()
  amountCents?: number | null;

  @IsNumber()
  @IsOptional()
  percentage?: number | null;

  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;
}

/**
 * Employee setup request DTO
 */
export class EmployeeSetupRequestDto {
  @IsString()
  staffId!: string;

  @IsString()
  triggeredBy!: string;

  @IsNumber()
  @IsOptional()
  profileId?: number;

  @ValidateNested()
  @Type(() => LeaveEntitlementsDto)
  @IsOptional()
  leaveEntitlements?: LeaveEntitlementsDto;

  @ValidateNested()
  @Type(() => TaxSettingsDto)
  @IsOptional()
  taxSettings?: TaxSettingsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalCalculationDto)
  @IsOptional()
  additionalCalculations?: AdditionalCalculationDto[];
}

/**
 * Setup step result DTO
 */
export class SetupStepResultDto {
  step!: PipelineStep;
  status!: SetupStepStatus;
  startedAt!: string | null;
  completedAt!: string | null;
  durationMs!: number | null;
  error!: string | null;
  details!: Record<string, unknown>;
  canRollback!: boolean;
}

/**
 * Setup error DTO
 */
export class SetupErrorDto {
  step!: PipelineStep;
  code!: string;
  message!: string;
  details!: Record<string, unknown>;
  timestamp!: string;
}

/**
 * Setup warning DTO
 */
export class SetupWarningDto {
  step!: PipelineStep;
  code!: string;
  message!: string;
  details!: Record<string, unknown>;
  timestamp!: string;
}

/**
 * Employee setup result DTO
 */
export class EmployeeSetupResultDto {
  success!: boolean;
  setupLogId!: string;
  staffId!: string;
  simplePayEmployeeId!: string | null;
  status!: SetupStatus;
  stepsCompleted!: number;
  stepsFailed!: number;
  profileAssigned!: string | null;
  leaveInitialized!: boolean;
  taxConfigured!: boolean;
  calculationsAdded!: number;
  errors!: SetupErrorDto[];
  warnings!: SetupWarningDto[];
  durationMs!: number;
}

/**
 * Setup status DTO
 */
export class SetupStatusDto {
  setupLogId!: string;
  staffId!: string;
  staffName!: string;
  status!: SetupStatus;
  progress!: number;
  currentStep!: PipelineStep | null;
  stepsCompleted!: number;
  totalSteps!: number;
  simplePayEmployeeId!: string | null;
  profileAssigned!: string | null;
  leaveInitialized!: boolean;
  taxConfigured!: boolean;
  calculationsAdded!: number;
  hasErrors!: boolean;
  hasWarnings!: boolean;
  startedAt!: Date;
  completedAt!: Date | null;
  durationMs!: number | null;
}

/**
 * Retry setup request DTO
 */
export class RetrySetupRequestDto {
  @IsString()
  setupLogId!: string;

  @IsString()
  @IsOptional()
  fromStep?: PipelineStep;

  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

/**
 * Setup filter DTO
 */
export class SetupFilterDto {
  @IsString()
  @IsOptional()
  status?: SetupStatus;

  @IsString()
  @IsOptional()
  staffId?: string;

  @IsString()
  @IsOptional()
  triggeredBy?: string;

  @IsNumber()
  @IsOptional()
  skip?: number;

  @IsNumber()
  @IsOptional()
  take?: number;
}

/**
 * Batch setup request DTO
 */
export class BatchSetupRequestDto {
  @IsArray()
  @IsString({ each: true })
  staffIds!: string[];

  @IsString()
  triggeredBy!: string;

  @IsNumber()
  @IsOptional()
  profileId?: number;
}

/**
 * Batch setup result DTO
 */
export class BatchSetupResultDto {
  totalRequested!: number;
  successful!: number;
  failed!: number;
  results!: EmployeeSetupResultDto[];
}
