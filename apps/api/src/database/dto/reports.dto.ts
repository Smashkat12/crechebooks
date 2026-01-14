/**
 * Reports DTOs
 * TASK-SPAY-005: SimplePay Reports Management
 */

import {
  IsString,
  IsOptional,
  IsDate,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsBoolean,
  IsUUID,
  IsArray,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus, ReportType } from '../entities/report-request.entity';
import { Prisma } from '@prisma/client';

// ============================================
// Base Request DTOs
// ============================================

export class BasePeriodDto {
  @ApiPropertyOptional({ description: 'Period start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  periodStart?: string;

  @ApiPropertyOptional({ description: 'Period end date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  periodEnd?: string;
}

// ============================================
// ETI Report DTOs
// ============================================

export class GenerateEtiReportDto extends BasePeriodDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiPropertyOptional({ description: 'Wave ID for pay run' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  waveId?: number;

  @ApiPropertyOptional({ description: 'Specific pay run ID' })
  @IsOptional()
  @IsString()
  payRunId?: string;

  @ApiPropertyOptional({ description: 'User requesting the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class EtiEntryResponseDto {
  @ApiProperty()
  employeeId: number;

  @ApiProperty()
  employeeName: string;

  @ApiProperty()
  idNumber: string;

  @ApiProperty()
  grossRemunerationCents: number;

  @ApiProperty()
  etiEligible: boolean;

  @ApiProperty()
  etiAmountCents: number;

  @ApiProperty()
  etiMonth: number;

  @ApiProperty()
  employmentStartDate: Date;

  @ApiProperty()
  ageAtMonthEnd: number;
}

export class EtiReportResponseDto {
  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty()
  totalEtiCents: number;

  @ApiProperty()
  eligibleEmployees: number;

  @ApiProperty({ type: [EtiEntryResponseDto] })
  entries: EtiEntryResponseDto[];
}

// ============================================
// Transaction History DTOs
// ============================================

export class GenerateTransactionHistoryDto extends BasePeriodDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiPropertyOptional({ description: 'Specific employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Transaction type filter',
    enum: ['earning', 'deduction', 'company_contribution', 'all'],
  })
  @IsOptional()
  @IsString()
  transactionType?: 'earning' | 'deduction' | 'company_contribution' | 'all';

  @ApiPropertyOptional({ description: 'User requesting the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class TransactionEntryResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  employeeId: number;

  @ApiProperty()
  employeeName: string;

  @ApiProperty()
  date: Date;

  @ApiProperty()
  code: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: ['earning', 'deduction', 'company_contribution'] })
  type: 'earning' | 'deduction' | 'company_contribution';

  @ApiProperty()
  amountCents: number;

  @ApiProperty()
  payRunId: string;
}

export class TransactionHistoryResponseDto {
  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty()
  totalEntries: number;

  @ApiProperty()
  totalAmountCents: number;

  @ApiProperty({ type: [TransactionEntryResponseDto] })
  entries: TransactionEntryResponseDto[];
}

// ============================================
// Variance Report DTOs
// ============================================

export class GenerateVarianceReportDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'Period 1 start date (YYYY-MM-DD)' })
  @IsString()
  periodStart1: string;

  @ApiProperty({ description: 'Period 1 end date (YYYY-MM-DD)' })
  @IsString()
  periodEnd1: string;

  @ApiProperty({ description: 'Period 2 start date (YYYY-MM-DD)' })
  @IsString()
  periodStart2: string;

  @ApiProperty({ description: 'Period 2 end date (YYYY-MM-DD)' })
  @IsString()
  periodEnd2: string;

  @ApiPropertyOptional({ description: 'Include employee-level details' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeEmployeeDetails?: boolean;

  @ApiPropertyOptional({ description: 'User requesting the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class VarianceEntryResponseDto {
  @ApiProperty()
  employeeId: number;

  @ApiProperty()
  employeeName: string;

  @ApiProperty()
  itemCode: string;

  @ApiProperty()
  itemDescription: string;

  @ApiProperty()
  period1AmountCents: number;

  @ApiProperty()
  period2AmountCents: number;

  @ApiProperty()
  varianceAmountCents: number;

  @ApiProperty()
  variancePercentage: number;
}

export class VarianceReportResponseDto {
  @ApiProperty()
  period1Start: Date;

  @ApiProperty()
  period1End: Date;

  @ApiProperty()
  period2Start: Date;

  @ApiProperty()
  period2End: Date;

  @ApiProperty()
  totalVarianceCents: number;

  @ApiProperty({ type: [VarianceEntryResponseDto] })
  entries: VarianceEntryResponseDto[];
}

// ============================================
// Leave Liability Report DTOs
// ============================================

export class GenerateLeaveLiabilityDto extends BasePeriodDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiPropertyOptional({ description: 'Specific leave type ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  leaveTypeId?: number;

  @ApiPropertyOptional({ description: 'Include projected accrual' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeProjectedAccrual?: boolean;

  @ApiPropertyOptional({ description: 'User requesting the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class LeaveLiabilityEntryResponseDto {
  @ApiProperty()
  employeeId: number;

  @ApiProperty()
  employeeName: string;

  @ApiProperty()
  leaveTypeId: number;

  @ApiProperty()
  leaveTypeName: string;

  @ApiProperty()
  balanceDays: number;

  @ApiProperty()
  balanceHours: number;

  @ApiProperty()
  dailyRateCents: number;

  @ApiProperty()
  liabilityAmountCents: number;
}

export class LeaveLiabilityResponseDto {
  @ApiProperty()
  asAtDate: Date;

  @ApiProperty()
  totalLiabilityCents: number;

  @ApiProperty({ type: [LeaveLiabilityEntryResponseDto] })
  entries: LeaveLiabilityEntryResponseDto[];
}

// ============================================
// Leave Comparison Report DTOs
// ============================================

export class GenerateLeaveComparisonDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'First year for comparison' })
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year1: number;

  @ApiProperty({ description: 'Second year for comparison' })
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year2: number;

  @ApiPropertyOptional({ description: 'Specific leave type ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  leaveTypeId?: number;

  @ApiPropertyOptional({ description: 'User requesting the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class LeaveComparisonEntryResponseDto {
  @ApiProperty()
  employeeId: number;

  @ApiProperty()
  employeeName: string;

  @ApiProperty()
  leaveTypeId: number;

  @ApiProperty()
  leaveTypeName: string;

  @ApiProperty()
  year1TakenDays: number;

  @ApiProperty()
  year2TakenDays: number;

  @ApiProperty()
  differenceDays: number;
}

export class LeaveComparisonResponseDto {
  @ApiProperty()
  year1: number;

  @ApiProperty()
  year2: number;

  @ApiProperty({ type: [LeaveComparisonEntryResponseDto] })
  entries: LeaveComparisonEntryResponseDto[];
}

// ============================================
// Tracked Balances Report DTOs
// ============================================

export class GenerateTrackedBalancesDto extends BasePeriodDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiPropertyOptional({ description: 'Balance types to include' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  balanceTypes?: string[];

  @ApiPropertyOptional({ description: 'Specific employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'User requesting the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class TrackedBalanceEntryResponseDto {
  @ApiProperty()
  employeeId: number;

  @ApiProperty()
  employeeName: string;

  @ApiProperty()
  balanceType: string;

  @ApiProperty()
  balanceName: string;

  @ApiProperty()
  openingBalanceCents: number;

  @ApiProperty()
  additionsCents: number;

  @ApiProperty()
  deductionsCents: number;

  @ApiProperty()
  closingBalanceCents: number;
}

export class TrackedBalancesResponseDto {
  @ApiProperty()
  asAtDate: Date;

  @ApiProperty({ type: [TrackedBalanceEntryResponseDto] })
  entries: TrackedBalanceEntryResponseDto[];
}

// ============================================
// Report Request DTOs
// ============================================

export class CreateReportRequestDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'Report type', enum: ReportType })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiProperty({ description: 'Report parameters' })
  @IsObject()
  params: Prisma.InputJsonValue;

  @ApiPropertyOptional({ description: 'User requesting the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class ReportRequestFilterDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({
    description: 'Filter by report type',
    enum: ReportType,
  })
  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @ApiPropertyOptional({ description: 'Filter by requester' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;

  @ApiPropertyOptional({ description: 'Filter from date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter to date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

export class ReportRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ enum: ReportType })
  reportType: ReportType;

  @ApiProperty()
  params: Prisma.JsonValue;

  @ApiProperty({ enum: ReportStatus })
  status: ReportStatus;

  @ApiPropertyOptional()
  asyncUuid: string | null;

  @ApiPropertyOptional()
  resultData: Prisma.JsonValue | null;

  @ApiPropertyOptional()
  errorMessage: string | null;

  @ApiPropertyOptional()
  requestedBy: string | null;

  @ApiProperty()
  requestedAt: Date;

  @ApiPropertyOptional()
  completedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// ============================================
// Async Report DTOs
// ============================================

export class AsyncReportStatusDto {
  @ApiProperty()
  uuid: string;

  @ApiProperty({ enum: ReportStatus })
  status: ReportStatus;

  @ApiPropertyOptional()
  progressPercentage: number | null;

  @ApiPropertyOptional()
  downloadUrl: string | null;

  @ApiPropertyOptional()
  errorMessage: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  completedAt: Date | null;
}

export class PollAsyncReportDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'Async report UUID' })
  @IsString()
  asyncUuid: string;
}

export class DownloadAsyncReportDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'Download URL' })
  @IsString()
  downloadUrl: string;
}

// ============================================
// Report Generation Result DTOs
// ============================================

export class ReportGenerationResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  reportRequestId: string;

  @ApiProperty({ enum: ReportType })
  reportType: ReportType;

  @ApiProperty({ enum: ReportStatus })
  status: ReportStatus;

  @ApiPropertyOptional()
  data: Prisma.JsonValue | null;

  @ApiPropertyOptional()
  errorMessage: string | null;
}
