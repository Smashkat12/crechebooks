/**
 * Split Transaction Matching DTOs
 * TASK-RECON-035: Split Transaction Matching
 *
 * DTOs for matching single bank transactions to multiple invoices (1-to-many)
 * or multiple payments to single invoices (many-to-1).
 */

import {
  IsUUID,
  IsString,
  IsArray,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Status of a split match
 */
export enum SplitMatchStatusDto {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

/**
 * Type of split match
 */
export enum SplitMatchTypeDto {
  ONE_TO_MANY = 'ONE_TO_MANY',
  MANY_TO_ONE = 'MANY_TO_ONE',
}

/**
 * DTO for suggesting split matches
 */
export class SuggestSplitMatchDto {
  @ApiProperty({ description: 'Bank transaction ID to match' })
  @IsUUID()
  bank_transaction_id!: string;

  @ApiProperty({
    description: 'Amount to match in cents',
    example: 150000,
  })
  @IsNumber()
  @Min(1)
  amount_cents!: number;

  @ApiPropertyOptional({
    description: 'Tolerance in cents for matching (default: 100)',
    example: 100,
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  tolerance_cents?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of invoices to include in split (default: 10)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(2)
  max_components?: number;
}

/**
 * Component of a split match (invoice or payment)
 */
export class SplitMatchComponentDto {
  @ApiPropertyOptional({ description: 'Invoice ID (for ONE_TO_MANY)' })
  @IsOptional()
  @IsUUID()
  invoice_id?: string;

  @ApiPropertyOptional({ description: 'Payment ID (for MANY_TO_ONE)' })
  @IsOptional()
  @IsUUID()
  payment_id?: string;

  @ApiProperty({
    description: 'Amount in cents for this component',
    example: 50000,
  })
  @IsNumber()
  @Min(1)
  amount_cents!: number;
}

/**
 * DTO for confirming a split match
 */
export class ConfirmSplitMatchDto {
  @ApiProperty({ description: 'Split match ID to confirm' })
  @IsUUID()
  split_match_id!: string;

  @ApiPropertyOptional({
    description: 'Optional components to override the suggested match',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitMatchComponentDto)
  @ArrayMinSize(2)
  components?: SplitMatchComponentDto[];
}

/**
 * DTO for rejecting a split match
 */
export class RejectSplitMatchDto {
  @ApiProperty({ description: 'Split match ID to reject' })
  @IsUUID()
  split_match_id!: string;

  @ApiPropertyOptional({ description: 'Reason for rejection' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Response DTO for a split match component
 */
export class SplitMatchComponentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  invoice_id?: string | null;

  @ApiPropertyOptional()
  payment_id?: string | null;

  @ApiProperty()
  amount_cents!: number;

  @ApiPropertyOptional({ description: 'Invoice number if available' })
  invoice_number?: string | null;

  @ApiPropertyOptional({ description: 'Invoice description if available' })
  invoice_description?: string | null;
}

/**
 * Response DTO for a split match suggestion
 */
export class SplitMatchResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  bank_transaction_id!: string;

  @ApiProperty({ enum: SplitMatchTypeDto })
  match_type!: SplitMatchTypeDto;

  @ApiProperty({ description: 'Total amount of the bank transaction in cents' })
  total_amount_cents!: number;

  @ApiProperty({
    description: 'Sum of matched component amounts in cents',
  })
  matched_amount_cents!: number;

  @ApiProperty({ description: 'Unmatched remainder in cents' })
  remainder_cents!: number;

  @ApiProperty({ enum: SplitMatchStatusDto })
  status!: SplitMatchStatusDto;

  @ApiPropertyOptional({ description: 'User who confirmed the match' })
  confirmed_by?: string | null;

  @ApiPropertyOptional({ description: 'Timestamp of confirmation' })
  confirmed_at?: string | null;

  @ApiProperty({ type: [SplitMatchComponentResponseDto] })
  components!: SplitMatchComponentResponseDto[];

  @ApiProperty()
  created_at!: string;
}

/**
 * Response DTO for split match suggestions
 */
export class SuggestSplitMatchResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: [SplitMatchResponseDto] })
  suggestions!: SplitMatchResponseDto[];

  @ApiProperty({ description: 'Total number of suggestions found' })
  total_suggestions!: number;
}

/**
 * Response DTO for confirming a split match
 */
export class ConfirmSplitMatchResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: SplitMatchResponseDto })
  split_match!: SplitMatchResponseDto;

  @ApiProperty({ description: 'Number of invoices marked as paid' })
  invoices_paid!: number;

  @ApiProperty({ description: 'Number of payments created' })
  payments_created!: number;
}

/**
 * Filter DTO for listing split matches
 */
export class SplitMatchFilterDto {
  @ApiPropertyOptional({ enum: SplitMatchStatusDto })
  @IsOptional()
  @IsEnum(SplitMatchStatusDto)
  status?: SplitMatchStatusDto;

  @ApiPropertyOptional({ enum: SplitMatchTypeDto })
  @IsOptional()
  @IsEnum(SplitMatchTypeDto)
  match_type?: SplitMatchTypeDto;

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

/**
 * Paginated response for split matches
 */
export class SplitMatchListResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: [SplitMatchResponseDto] })
  data!: SplitMatchResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total_pages!: number;
}
