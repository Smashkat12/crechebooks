/**
 * Xero Transaction Split DTOs
 * TASK-RECON-037: Xero Transaction Splitting for Bank Reconciliation
 *
 * DTOs for splitting Xero transactions into net amount + accrued bank charge
 * to enable direct matching with bank statements.
 *
 * Use case:
 * - Xero transaction shows: R1,219.70 (GROSS deposited by customer)
 * - Bank statement shows: R1,200.00 (NET credited after bank fees)
 * - Difference: R19.70 is the bank fee (accrued, charged later)
 *
 * This feature splits the Xero transaction so:
 * - Net amount (R1,200.00) can match bank statement directly
 * - Fee (R19.70) is recorded as accrued bank charge
 */

import {
  IsUUID,
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Status of a Xero transaction split
 */
export enum XeroTransactionSplitStatusDto {
  PENDING = 'PENDING', // Split created but not confirmed
  CONFIRMED = 'CONFIRMED', // Split confirmed and ready for matching
  MATCHED = 'MATCHED', // Net amount matched to bank statement
  CANCELLED = 'CANCELLED', // Split cancelled/reverted
}

/**
 * DTO for requesting a Xero transaction split
 */
export class SplitXeroTransactionDto {
  @ApiProperty({ description: 'Xero transaction ID to split' })
  @IsString()
  xero_transaction_id!: string;

  @ApiProperty({
    description: 'Net amount in cents (amount that matches bank statement)',
    example: 120000,
  })
  @IsNumber()
  @Min(1)
  net_amount_cents!: number;

  @ApiProperty({
    description: 'Fee amount in cents (difference between gross and net)',
    example: 1970,
  })
  @IsNumber()
  @Min(1)
  fee_amount_cents!: number;

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

  @ApiPropertyOptional({
    description: 'Bank transaction ID to match the net amount with',
  })
  @IsOptional()
  @IsUUID()
  bank_transaction_id?: string;

  @ApiPropertyOptional({
    description:
      'Bank statement match ID if coming from reconciliation context',
  })
  @IsOptional()
  @IsUUID()
  bank_statement_match_id?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for auto-detecting split parameters from transaction mismatch
 */
export class DetectSplitParamsDto {
  @ApiProperty({ description: 'Xero transaction ID' })
  @IsString()
  xero_transaction_id!: string;

  @ApiProperty({ description: 'Xero transaction gross amount in cents' })
  @IsNumber()
  @Min(1)
  xero_amount_cents!: number;

  @ApiProperty({ description: 'Bank statement amount in cents (net)' })
  @IsNumber()
  @Min(1)
  bank_amount_cents!: number;

  @ApiPropertyOptional({
    description: 'Transaction description for fee detection',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Payee name for fee detection' })
  @IsOptional()
  @IsString()
  payee_name?: string;
}

/**
 * Response for split parameter detection
 */
export class DetectSplitParamsResponseDto {
  @ApiProperty({ description: 'Whether splitting is recommended' })
  is_split_recommended!: boolean;

  @ApiProperty({ description: 'Xero gross amount in cents' })
  xero_amount_cents!: number;

  @ApiProperty({ description: 'Suggested net amount in cents' })
  suggested_net_amount_cents!: number;

  @ApiProperty({ description: 'Suggested fee amount in cents' })
  suggested_fee_amount_cents!: number;

  @ApiProperty({ description: 'Detected fee type' })
  suggested_fee_type!: string;

  @ApiPropertyOptional({ description: 'Expected fee based on rules' })
  expected_fee_cents?: number;

  @ApiProperty({ description: 'Confidence score (0-1)' })
  confidence!: number;

  @ApiPropertyOptional({ description: 'Explanation for the recommendation' })
  explanation?: string;
}

/**
 * DTO for confirming a pending split
 */
export class ConfirmXeroSplitDto {
  @ApiProperty({ description: 'Split ID to confirm' })
  @IsUUID()
  split_id!: string;

  @ApiPropertyOptional({ description: 'Bank transaction ID to match' })
  @IsOptional()
  @IsUUID()
  bank_transaction_id?: string;

  @ApiPropertyOptional({ description: 'Also create matching record' })
  @IsOptional()
  @IsBoolean()
  create_match?: boolean;
}

/**
 * DTO for cancelling a split
 */
export class CancelXeroSplitDto {
  @ApiProperty({ description: 'Split ID to cancel' })
  @IsUUID()
  split_id!: string;

  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Response DTO for a Xero transaction split
 */
export class XeroTransactionSplitResponseDto {
  @ApiProperty({ description: 'Split ID' })
  id!: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenant_id!: string;

  @ApiProperty({ description: 'Original Xero transaction ID' })
  xero_transaction_id!: string;

  @ApiProperty({ description: 'Original gross amount in cents' })
  original_amount_cents!: number;

  @ApiProperty({ description: 'Net amount in cents (for bank matching)' })
  net_amount_cents!: number;

  @ApiProperty({ description: 'Fee amount in cents' })
  fee_amount_cents!: number;

  @ApiProperty({ description: 'Fee type' })
  fee_type!: string;

  @ApiPropertyOptional({ description: 'Fee description' })
  fee_description!: string | null;

  @ApiProperty({
    description: 'Split status',
    enum: XeroTransactionSplitStatusDto,
  })
  status!: XeroTransactionSplitStatusDto;

  @ApiPropertyOptional({ description: 'Linked accrued charge ID' })
  accrued_charge_id!: string | null;

  @ApiPropertyOptional({ description: 'Matched bank transaction ID' })
  bank_transaction_id!: string | null;

  @ApiPropertyOptional({ description: 'Bank statement match ID' })
  bank_statement_match_id!: string | null;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes!: string | null;

  @ApiPropertyOptional({ description: 'Created by user ID' })
  created_by!: string | null;

  @ApiPropertyOptional({ description: 'Confirmed by user ID' })
  confirmed_by!: string | null;

  @ApiPropertyOptional({ description: 'Confirmation timestamp' })
  confirmed_at!: string | null;

  @ApiProperty({ description: 'Created timestamp' })
  created_at!: string;

  @ApiProperty({ description: 'Updated timestamp' })
  updated_at!: string;
}

/**
 * Full response including linked accrued charge
 */
export class XeroSplitWithChargeResponseDto extends XeroTransactionSplitResponseDto {
  @ApiPropertyOptional({ description: 'Linked accrued bank charge details' })
  accrued_charge?: {
    id: string;
    status: string;
    fee_type: string;
    accrued_amount_cents: number;
    matched_at?: string | null;
  } | null;
}

/**
 * Filter DTO for listing Xero transaction splits
 */
export class XeroSplitFilterDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: XeroTransactionSplitStatusDto,
  })
  @IsOptional()
  @IsEnum(XeroTransactionSplitStatusDto)
  status?: XeroTransactionSplitStatusDto;

  @ApiPropertyOptional({ description: 'Filter by Xero transaction ID' })
  @IsOptional()
  @IsString()
  xero_transaction_id?: string;

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
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}

/**
 * Paginated response for Xero splits
 */
export class XeroSplitListResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: [XeroSplitWithChargeResponseDto] })
  data!: XeroSplitWithChargeResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;
}

/**
 * Summary of Xero transaction splits
 */
export class XeroSplitSummaryDto {
  @ApiProperty({ description: 'Total splits count' })
  total_count!: number;

  @ApiProperty({ description: 'Count by status' })
  by_status!: Record<XeroTransactionSplitStatusDto, number>;

  @ApiProperty({ description: 'Total original amount in cents' })
  total_original_cents!: number;

  @ApiProperty({ description: 'Total net amount in cents' })
  total_net_cents!: number;

  @ApiProperty({ description: 'Total fee amount in cents' })
  total_fee_cents!: number;

  @ApiProperty({ description: 'Count by fee type' })
  by_fee_type!: Record<string, { count: number; total_fee_cents: number }>;
}

/**
 * Response for a successful split operation
 */
export class SplitXeroTransactionResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: XeroSplitWithChargeResponseDto })
  split!: XeroSplitWithChargeResponseDto;

  @ApiProperty({ description: 'Message about the operation' })
  message!: string;
}
