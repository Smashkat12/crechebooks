/**
 * SimplePay Integration DTOs
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 */

import {
  IsString,
  IsOptional,
  IsDate,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimplePaySyncStatus } from '@prisma/client';

// Connection DTOs
export class SetupConnectionDto {
  @ApiProperty({ description: 'SimplePay client ID' })
  @IsString()
  clientId: string;

  @ApiProperty({ description: 'SimplePay API key (will be encrypted)' })
  @IsString()
  apiKey: string;
}

export class ConnectionStatusDto {
  @ApiProperty()
  isConnected: boolean;

  @ApiPropertyOptional()
  clientId?: string;

  @ApiPropertyOptional()
  lastSyncAt?: Date;

  @ApiPropertyOptional()
  syncErrorMessage?: string;

  @ApiProperty()
  employeesSynced: number;

  @ApiProperty()
  employeesOutOfSync: number;
}

export class TestConnectionResultDto {
  @ApiProperty()
  success: boolean;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  clientName?: string;
}

// Employee Sync DTOs
export class EmployeeSyncStatusDto {
  @ApiProperty()
  staffId: string;

  @ApiPropertyOptional()
  simplePayEmployeeId?: string;

  @ApiProperty({ enum: SimplePaySyncStatus })
  syncStatus: SimplePaySyncStatus;

  @ApiPropertyOptional()
  lastSyncAt?: Date;

  @ApiPropertyOptional()
  lastSyncError?: string;
}

export class SyncEmployeeResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  staffId: string;

  @ApiPropertyOptional()
  simplePayEmployeeId?: string;

  @ApiPropertyOptional()
  message?: string;
}

export class SyncAllEmployeesResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  synced: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ type: [Object] })
  errors: Array<{ staffId: string; error: string }>;
}

export class EmployeeComparisonDto {
  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayEmployeeId: string;

  @ApiProperty()
  isInSync: boolean;

  @ApiProperty({ type: [Object] })
  differences: Array<{
    field: string;
    localValue: unknown;
    remoteValue: unknown;
  }>;
}

// Payslip Import DTOs
export class ImportPayslipsDto {
  @ApiProperty({ description: 'Start of pay period' })
  @IsDate()
  @Type(() => Date)
  payPeriodStart: Date;

  @ApiProperty({ description: 'End of pay period' })
  @IsDate()
  @Type(() => Date)
  payPeriodEnd: Date;

  @ApiPropertyOptional({
    description: 'Specific staff IDs to import (empty = all)',
  })
  @IsOptional()
  @IsString({ each: true })
  staffIds?: string[];
}

export class PayslipImportDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  simplePayPayslipId: string;

  @ApiProperty()
  payPeriodStart: Date;

  @ApiProperty()
  payPeriodEnd: Date;

  @ApiProperty()
  grossSalaryCents: number;

  @ApiProperty()
  netSalaryCents: number;

  @ApiProperty()
  payeCents: number;

  @ApiProperty()
  uifEmployeeCents: number;

  @ApiProperty()
  uifEmployerCents: number;

  @ApiProperty()
  importedAt: Date;
}

export class BulkImportResultDto {
  @ApiProperty()
  imported: number;

  @ApiProperty()
  skipped: number;

  @ApiProperty({ type: [Object] })
  errors: Array<{ staffId: string; error: string }>;
}

// Tax Document DTOs
export class Irp5CertificateDto {
  @ApiProperty()
  taxYear: number;

  @ApiProperty()
  certificateNumber: string;

  @ApiProperty()
  grossRemuneration: number;

  @ApiProperty()
  payeDeducted: number;
}

export class Emp201DataDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  totalPaye: number;

  @ApiProperty()
  totalSdl: number;

  @ApiProperty()
  totalUifEmployer: number;

  @ApiProperty()
  totalUifEmployee: number;

  @ApiProperty()
  totalEti: number;

  @ApiProperty()
  employeesCount: number;
}

export class Emp201ComparisonDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  local: {
    paye: number;
    uif: number;
    sdl: number;
  };

  @ApiProperty()
  remote: {
    paye: number;
    uif: number;
    sdl: number;
  };

  @ApiProperty()
  isMatch: boolean;
}

// List DTOs
export class ListEmployeeMappingsDto {
  @ApiPropertyOptional({ enum: SimplePaySyncStatus })
  @IsOptional()
  @IsEnum(SimplePaySyncStatus)
  syncStatus?: SimplePaySyncStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}

export class ListPayslipImportsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  toDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}
