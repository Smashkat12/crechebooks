/**
 * Pay Run DTOs
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 */

import {
  IsString,
  IsOptional,
  IsDate,
  IsInt,
  Min,
  IsEnum,
  IsUUID,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayRunSyncStatus } from '../entities/payrun-sync.entity';

// Create Pay Run Sync DTO
export class CreatePayRunSyncDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'SimplePay Pay Run ID' })
  @IsString()
  simplePayPayRunId: string;

  @ApiProperty({ description: 'Wave ID' })
  @IsInt()
  @Min(1)
  waveId: number;

  @ApiProperty({ description: 'Wave name' })
  @IsString()
  waveName: string;

  @ApiProperty({ description: 'Period start date' })
  @IsDate()
  @Type(() => Date)
  periodStart: Date;

  @ApiProperty({ description: 'Period end date' })
  @IsDate()
  @Type(() => Date)
  periodEnd: Date;

  @ApiProperty({ description: 'Pay date' })
  @IsDate()
  @Type(() => Date)
  payDate: Date;

  @ApiProperty({ description: 'Pay run status in SimplePay' })
  @IsString()
  status: string;

  @ApiProperty({ description: 'Number of employees in pay run' })
  @IsInt()
  @Min(0)
  employeeCount: number;

  @ApiProperty({ description: 'Total gross amount in cents' })
  @IsInt()
  @Min(0)
  totalGrossCents: number;

  @ApiProperty({ description: 'Total net amount in cents' })
  @IsInt()
  @Min(0)
  totalNetCents: number;

  @ApiProperty({ description: 'Total PAYE in cents' })
  @IsInt()
  @Min(0)
  totalPayeCents: number;

  @ApiProperty({ description: 'Total UIF employee contribution in cents' })
  @IsInt()
  @Min(0)
  totalUifEmployeeCents: number;

  @ApiProperty({ description: 'Total UIF employer contribution in cents' })
  @IsInt()
  @Min(0)
  totalUifEmployerCents: number;

  @ApiProperty({ description: 'Total SDL in cents' })
  @IsInt()
  @Min(0)
  totalSdlCents: number;

  @ApiPropertyOptional({ description: 'Total ETI in cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalEtiCents?: number;

  @ApiPropertyOptional({ description: 'Accounting data from SimplePay' })
  @IsOptional()
  @IsObject()
  accountingData?: Record<string, unknown>;
}

// Pay Run Filter DTO
export class PayRunFilterDto {
  @ApiPropertyOptional({ description: 'Filter by wave ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  waveId?: number;

  @ApiPropertyOptional({ description: 'Filter by pay run status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by sync status' })
  @IsOptional()
  @IsEnum(PayRunSyncStatus)
  syncStatus?: PayRunSyncStatus;

  @ApiPropertyOptional({ description: 'Period start from date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  periodStartFrom?: Date;

  @ApiPropertyOptional({ description: 'Period start to date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  periodStartTo?: Date;

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
  @Type(() => Number)
  limit?: number = 20;
}

// Pay Run Response DTO
export class PayRunResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  simplePayPayRunId: string;

  @ApiProperty()
  waveId: number;

  @ApiProperty()
  waveName: string;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty()
  payDate: Date;

  @ApiProperty()
  status: string;

  @ApiProperty()
  employeeCount: number;

  @ApiProperty()
  totalGrossCents: number;

  @ApiProperty()
  totalNetCents: number;

  @ApiProperty()
  totalPayeCents: number;

  @ApiProperty()
  totalUifEmployeeCents: number;

  @ApiProperty()
  totalUifEmployerCents: number;

  @ApiProperty()
  totalSdlCents: number;

  @ApiProperty()
  totalEtiCents: number;

  @ApiProperty({ enum: PayRunSyncStatus })
  syncStatus: PayRunSyncStatus;

  @ApiPropertyOptional()
  xeroJournalId: string | null;

  @ApiPropertyOptional()
  xeroSyncedAt: Date | null;

  @ApiPropertyOptional()
  xeroSyncError: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Wave Response DTO
export class WaveResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  payFrequency: string;

  @ApiProperty()
  payDay: number;

  @ApiProperty()
  isActive: boolean;
}

// Accounting Entry DTO
export class AccountingEntryDto {
  @ApiProperty()
  accountCode: string;

  @ApiProperty()
  accountName: string;

  @ApiProperty()
  debit: number;

  @ApiProperty()
  credit: number;

  @ApiProperty()
  description: string;
}

// Pay Run Accounting Response DTO
export class PayRunAccountingResponseDto {
  @ApiProperty()
  payRunId: string;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty({ type: [AccountingEntryDto] })
  entries: AccountingEntryDto[];

  @ApiProperty()
  totals: {
    gross: number;
    nett: number;
    paye: number;
    uifEmployee: number;
    uifEmployer: number;
    sdl: number;
    eti: number;
  };
}

// Xero Journal Config DTO
export class XeroJournalConfigDto {
  @ApiProperty({ description: 'Salary expense account code' })
  @IsString()
  salaryExpenseCode: string;

  @ApiProperty({ description: 'Salary payable account code' })
  @IsString()
  salaryPayableCode: string;

  @ApiProperty({ description: 'PAYE payable account code' })
  @IsString()
  payePayableCode: string;

  @ApiProperty({ description: 'UIF payable account code' })
  @IsString()
  uifPayableCode: string;

  @ApiProperty({ description: 'SDL payable account code' })
  @IsString()
  sdlPayableCode: string;

  @ApiPropertyOptional({ description: 'ETI receivable account code' })
  @IsOptional()
  @IsString()
  etiReceivableCode?: string;

  @ApiPropertyOptional({ description: 'Narration prefix for journal' })
  @IsOptional()
  @IsString()
  narrationPrefix?: string;
}

// Post to Xero DTO
export class PostToXeroDto {
  @ApiProperty({ description: 'Pay run ID to post' })
  @IsUUID()
  payRunId: string;

  @ApiPropertyOptional({
    description: 'Custom Xero journal configuration',
    type: XeroJournalConfigDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => XeroJournalConfigDto)
  journalConfig?: XeroJournalConfigDto;
}

// Pay Run Sync Status Response DTO
export class PayRunSyncStatusResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  simplePayPayRunId: string;

  @ApiProperty({ enum: PayRunSyncStatus })
  syncStatus: PayRunSyncStatus;

  @ApiPropertyOptional()
  xeroJournalId: string | null;

  @ApiPropertyOptional()
  xeroSyncedAt: Date | null;

  @ApiPropertyOptional()
  xeroSyncError: string | null;

  @ApiProperty()
  updatedAt: Date;
}

// Sync Pay Run DTO (for manual sync trigger)
export class SyncPayRunDto {
  @ApiProperty({ description: 'SimplePay Pay Run ID to sync' })
  @IsString()
  simplePayPayRunId: string;
}

// Bulk Sync Result DTO
export class PayRunSyncResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  payRunId: string;

  @ApiProperty()
  simplePayPayRunId: string;

  @ApiPropertyOptional()
  xeroJournalId: string | null;

  @ApiProperty({ type: [String] })
  errors: string[];
}

// Sync All Pay Runs Result DTO
export class SyncAllPayRunsResultDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  synced: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [PayRunSyncResultDto] })
  results: PayRunSyncResultDto[];
}
