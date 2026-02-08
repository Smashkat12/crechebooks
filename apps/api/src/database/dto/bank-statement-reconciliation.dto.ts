/**
 * Bank Statement Reconciliation DTOs
 * TASK-RECON-019: Bank Statement to Xero Reconciliation
 */

import {
  IsUUID,
  IsString,
  IsDate,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BankStatementMatchStatus } from '../entities/bank-statement-match.entity';

export class ReconcileBankStatementDto {
  @ApiProperty({ description: 'Bank account identifier' })
  @IsString()
  bank_account!: string;

  @ApiPropertyOptional({
    description: 'Period start date (auto-detected from PDF if not provided)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  period_start?: Date;

  @ApiPropertyOptional({
    description: 'Period end date (auto-detected from PDF if not provided)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  period_end?: Date;
}

export class BankStatementMatchResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  bank_date!: string;

  @ApiProperty()
  bank_description!: string;

  @ApiProperty()
  bank_amount!: number;

  @ApiProperty()
  bank_is_credit!: boolean;

  @ApiPropertyOptional()
  transaction_id?: string | null;

  @ApiPropertyOptional()
  xero_date?: string | null;

  @ApiPropertyOptional()
  xero_description?: string | null;

  @ApiPropertyOptional()
  xero_amount?: number | null;

  @ApiPropertyOptional()
  xero_is_credit?: boolean | null;

  @ApiProperty({ enum: BankStatementMatchStatus })
  status!: BankStatementMatchStatus;

  @ApiPropertyOptional()
  match_confidence?: number | null;

  @ApiPropertyOptional()
  discrepancy_reason?: string | null;
}

export class BankStatementReconciliationResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  data!: {
    reconciliation_id: string;
    period_start: string;
    period_end: string;
    opening_balance: number;
    closing_balance: number;
    calculated_balance: number;
    discrepancy: number;
    match_summary: {
      matched: number;
      in_bank_only: number;
      in_xero_only: number;
      amount_mismatch: number;
      date_mismatch: number;
      fee_adjusted_match: number;
      total: number;
    };
    status: 'RECONCILED' | 'DISCREPANCY';
    matches: BankStatementMatchResponseDto[];
  };
}

export class BankStatementMatchFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reconciliation_id?: string;

  @ApiPropertyOptional({ enum: BankStatementMatchStatus })
  @IsOptional()
  @IsEnum(BankStatementMatchStatus)
  status?: BankStatementMatchStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
