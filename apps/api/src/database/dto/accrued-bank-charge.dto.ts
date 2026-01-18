/**
 * Accrued Bank Charge DTOs
 * TASK-RECON-036: Accrued Bank Charges
 *
 * DTOs for tracking bank fees shown on statements but charged in following period.
 * FNB shows fees next to transactions but charges them in the next billing cycle.
 *
 * Use case: Bank shows NET (R1,200), Xero shows GROSS (R1,219.70)
 * The difference (R19.70) is the accrued fee to be tracked.
 */

import {
  IsUUID,
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Status of an accrued bank charge
 */
export enum AccruedBankChargeStatusDto {
  ACCRUED = 'ACCRUED', // Fee shown on statement but not yet charged
  MATCHED = 'MATCHED', // Fee matched to actual charge transaction
  REVERSED = 'REVERSED', // Fee was reversed/waived
  WRITTEN_OFF = 'WRITTEN_OFF', // Fee written off (not expected to be charged)
}

/**
 * DTO for creating an accrued bank charge
 */
export class CreateAccruedBankChargeDto {
  @ApiProperty({ description: 'Source transaction description' })
  @IsString()
  source_description!: string;

  @ApiProperty({ description: 'Date of the source transaction' })
  @IsDateString()
  source_date!: string;

  @ApiProperty({
    description: 'NET amount credited to bank (in cents)',
    example: 120000,
  })
  @IsNumber()
  @Min(0)
  source_amount_cents!: number;

  @ApiProperty({
    description: 'Accrued fee amount in cents',
    example: 1970,
  })
  @IsNumber()
  @Min(1)
  accrued_amount_cents!: number;

  @ApiProperty({
    description: 'Type of bank fee',
    example: 'ADT_DEPOSIT_FEE',
  })
  @IsString()
  fee_type!: string;

  @ApiPropertyOptional({ description: 'Description of the fee' })
  @IsOptional()
  @IsString()
  fee_description?: string;

  @ApiPropertyOptional({ description: 'Source transaction ID' })
  @IsOptional()
  @IsUUID()
  source_transaction_id?: string;

  @ApiPropertyOptional({ description: 'Bank statement match ID' })
  @IsOptional()
  @IsUUID()
  bank_statement_match_id?: string;

  @ApiPropertyOptional({ description: 'Xero transaction ID' })
  @IsOptional()
  @IsString()
  xero_transaction_id?: string;

  @ApiPropertyOptional({
    description: 'GROSS amount from Xero (in cents)',
    example: 121970,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  xero_amount_cents?: number;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for matching an accrued charge to actual charge transaction
 */
export class MatchAccruedChargeDto {
  @ApiProperty({ description: 'Accrued bank charge ID' })
  @IsUUID()
  accrued_charge_id!: string;

  @ApiProperty({ description: 'Transaction ID of the actual charge' })
  @IsUUID()
  charge_transaction_id!: string;

  @ApiPropertyOptional({ description: 'Date of the actual charge' })
  @IsOptional()
  @IsDateString()
  charge_date?: string;
}

/**
 * DTO for updating an accrued charge status
 */
export class UpdateAccruedChargeStatusDto {
  @ApiProperty({ description: 'Accrued bank charge ID' })
  @IsUUID()
  accrued_charge_id!: string;

  @ApiProperty({
    description: 'New status',
    enum: AccruedBankChargeStatusDto,
  })
  @IsEnum(AccruedBankChargeStatusDto)
  status!: AccruedBankChargeStatusDto;

  @ApiPropertyOptional({ description: 'Reason for status change' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for filtering accrued charges
 */
export class AccruedChargeFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: AccruedBankChargeStatusDto,
  })
  @IsOptional()
  @IsEnum(AccruedBankChargeStatusDto)
  status?: AccruedBankChargeStatusDto;

  @ApiPropertyOptional({ description: 'Filter by fee type' })
  @IsOptional()
  @IsString()
  fee_type?: string;

  @ApiPropertyOptional({ description: 'Start date for filtering' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'End date for filtering' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

/**
 * Response DTO for an accrued bank charge
 */
export class AccruedBankChargeResponseDto {
  @ApiProperty({ description: 'Accrued charge ID' })
  id!: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenant_id!: string;

  @ApiPropertyOptional({ description: 'Source transaction ID' })
  source_transaction_id!: string | null;

  @ApiProperty({ description: 'Source transaction description' })
  source_description!: string;

  @ApiProperty({ description: 'Date of source transaction' })
  source_date!: string;

  @ApiProperty({ description: 'NET amount credited (cents)' })
  source_amount_cents!: number;

  @ApiProperty({ description: 'Accrued fee amount (cents)' })
  accrued_amount_cents!: number;

  @ApiProperty({ description: 'Fee type' })
  fee_type!: string;

  @ApiPropertyOptional({ description: 'Fee description' })
  fee_description!: string | null;

  @ApiProperty({ description: 'Status', enum: AccruedBankChargeStatusDto })
  status!: AccruedBankChargeStatusDto;

  @ApiPropertyOptional({ description: 'Bank statement match ID' })
  bank_statement_match_id!: string | null;

  @ApiPropertyOptional({ description: 'Xero transaction ID' })
  xero_transaction_id!: string | null;

  @ApiPropertyOptional({ description: 'GROSS amount from Xero (cents)' })
  xero_amount_cents!: number | null;

  @ApiPropertyOptional({ description: 'Actual charge transaction ID' })
  charge_transaction_id!: string | null;

  @ApiPropertyOptional({ description: 'Actual charge date' })
  charge_date!: string | null;

  @ApiPropertyOptional({ description: 'When matched' })
  matched_at!: string | null;

  @ApiPropertyOptional({ description: 'Matched by user ID' })
  matched_by!: string | null;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes!: string | null;

  @ApiProperty({ description: 'Created timestamp' })
  created_at!: string;

  @ApiProperty({ description: 'Updated timestamp' })
  updated_at!: string;
}

/**
 * DTO for fee-adjusted match detection result
 */
export class FeeAdjustedMatchResultDto {
  @ApiProperty({ description: 'Whether a fee-adjusted match was found' })
  is_fee_adjusted_match!: boolean;

  @ApiProperty({ description: 'Bank NET amount (cents)' })
  bank_amount_cents!: number;

  @ApiProperty({ description: 'Xero GROSS amount (cents)' })
  xero_amount_cents!: number;

  @ApiProperty({ description: 'Detected fee amount (cents)' })
  fee_amount_cents!: number;

  @ApiProperty({ description: 'Detected fee type' })
  fee_type!: string;

  @ApiPropertyOptional({ description: 'Expected fee based on configuration' })
  expected_fee_cents?: number;

  @ApiProperty({
    description: 'Confidence of the match (0-1)',
    example: 0.95,
  })
  confidence!: number;

  @ApiPropertyOptional({ description: 'Match explanation' })
  explanation?: string;
}

/**
 * Summary DTO for accrued charges
 */
export class AccruedChargeSummaryDto {
  @ApiProperty({ description: 'Total accrued charges count' })
  total_count!: number;

  @ApiProperty({ description: 'Count by status' })
  by_status!: Record<AccruedBankChargeStatusDto, number>;

  @ApiProperty({ description: 'Total accrued amount (cents)' })
  total_accrued_cents!: number;

  @ApiProperty({ description: 'Total matched amount (cents)' })
  total_matched_cents!: number;

  @ApiProperty({ description: 'Total pending amount (cents)' })
  total_pending_cents!: number;

  @ApiProperty({ description: 'Count by fee type' })
  by_fee_type!: Record<string, { count: number; total_cents: number }>;
}
