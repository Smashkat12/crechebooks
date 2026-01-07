/**
 * Staff Offboarding DTOs
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 *
 * Data Transfer Objects for staff offboarding operations including:
 * - Initiation and updates
 * - Asset return tracking
 * - Exit interview recording
 * - Final pay calculation queries
 */

import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsBoolean,
  IsInt,
  IsUUID,
  MaxLength,
  Min,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  OffboardingReason,
  StaffOffboardingStatus,
  AssetReturnStatus,
} from '../entities/staff-offboarding.entity';

/**
 * DTO for initiating a staff offboarding process
 */
export class InitiateOffboardingDto {
  @IsUUID()
  staffId!: string;

  @IsEnum(OffboardingReason)
  reason!: OffboardingReason;

  @Type(() => Date)
  @IsDate()
  lastWorkingDay!: Date;

  @IsOptional()
  @IsInt()
  @Min(0)
  noticePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  noticePeriodWaived?: boolean;

  @IsOptional()
  @IsUUID()
  initiatedBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for updating an existing offboarding record
 */
export class UpdateOffboardingDto {
  @IsOptional()
  @IsEnum(StaffOffboardingStatus)
  status?: StaffOffboardingStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastWorkingDay?: Date;

  @IsOptional()
  @IsInt()
  @Min(0)
  noticePeriodDays?: number;

  @IsOptional()
  @IsBoolean()
  noticePeriodWaived?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for updating final pay amounts
 */
export class UpdateFinalPayDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  outstandingSalaryCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leavePayoutCents?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leaveBalanceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  noticePayCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  proRataBonusCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  otherEarningsCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  deductionsCents?: number;
}

/**
 * DTO for adding an asset to the return checklist
 */
export class AddAssetReturnDto {
  @IsString()
  @MaxLength(100)
  assetType!: string;

  @IsString()
  @MaxLength(255)
  assetDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for marking an asset as returned
 */
export class MarkAssetReturnedDto {
  @IsUUID()
  checkedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for updating an asset return record
 */
export class UpdateAssetReturnDto {
  @IsOptional()
  @IsEnum(AssetReturnStatus)
  status?: AssetReturnStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for recording exit interview details
 */
export class RecordExitInterviewDto {
  @Type(() => Date)
  @IsDate()
  interviewDate!: Date;

  @IsString()
  notes!: string;
}

/**
 * DTO for completing the offboarding process
 */
export class CompleteOffboardingDto {
  @IsUUID()
  completedBy!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Query DTO for settlement preview
 */
export class SettlementPreviewQueryDto {
  @Type(() => Date)
  @IsDate()
  lastWorkingDay!: Date;
}

/**
 * DTO for filtering offboarding records
 */
export class OffboardingFilterDto {
  @IsOptional()
  @IsEnum(StaffOffboardingStatus)
  status?: StaffOffboardingStatus;

  @IsOptional()
  @IsEnum(OffboardingReason)
  reason?: OffboardingReason;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;

  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Response DTO for offboarding with full details
 */
export interface OffboardingDetailResponse {
  id: string;
  staffId: string;
  staffName: string;
  employeeNumber: string | null;
  status: StaffOffboardingStatus;
  reason: OffboardingReason;
  initiatedAt: Date;
  lastWorkingDay: Date;
  noticePeriodDays: number;
  noticePeriodWaived: boolean;
  finalPayGrossCents: number;
  finalPayNetCents: number;
  assets: AssetReturnResponse[];
  documentsGenerated: {
    ui19: boolean;
    certificate: boolean;
    irp5: boolean;
    exitPack: boolean;
  };
  exitInterviewCompleted: boolean;
  completedAt: Date | null;
}

/**
 * Response DTO for asset return records
 */
export interface AssetReturnResponse {
  id: string;
  assetType: string;
  assetDescription: string;
  serialNumber: string | null;
  status: AssetReturnStatus;
  returnedAt: Date | null;
  checkedBy: string | null;
  notes: string | null;
}

/**
 * Response DTO for offboarding progress tracking
 */
export interface OffboardingProgressResponse {
  offboardingId: string;
  status: StaffOffboardingStatus;
  steps: {
    initiated: boolean;
    assetsChecked: boolean;
    exitInterviewDone: boolean;
    finalPayCalculated: boolean;
    documentsGenerated: boolean;
    completed: boolean;
  };
  progress: {
    assetsReturned: number;
    totalAssets: number;
    documentsReady: number;
    totalDocuments: number;
  };
  nextAction: string;
}

/**
 * Response DTO for offboarding statistics
 */
export interface OffboardingStatsResponse {
  total: number;
  initiated: number;
  inProgress: number;
  pendingFinalPay: number;
  completed: number;
  cancelled: number;
  byReason: Record<OffboardingReason, number>;
}
