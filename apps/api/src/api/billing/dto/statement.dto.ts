/**
 * Statement DTOs
 * TASK-STMT-004: Statement API Endpoints (Surface Layer)
 *
 * @module api/billing/dto/statement
 * @description Request and Response DTOs for Statement API endpoints.
 * All monetary values in API responses are in CENTS (integers).
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationMetaDto } from '../../../shared/dto';

// ============================================================================
// Enums
// ============================================================================

export enum StatementStatus {
  DRAFT = 'DRAFT',
  FINAL = 'FINAL',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

// ============================================================================
// Request DTOs
// ============================================================================

/**
 * DTO for generating a single statement
 */
export class GenerateStatementDto {
  @ApiProperty({
    description: 'Parent ID to generate statement for',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID('4')
  parent_id: string;

  @ApiProperty({
    description: 'Statement period start date (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsDateString()
  period_start: string;

  @ApiProperty({
    description: 'Statement period end date (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsDateString()
  period_end: string;
}

/**
 * DTO for bulk statement generation
 */
export class BulkGenerateStatementDto {
  @ApiProperty({
    description: 'Statement period start date (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsDateString()
  period_start: string;

  @ApiProperty({
    description: 'Statement period end date (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsDateString()
  period_end: string;

  @ApiPropertyOptional({
    description:
      'Specific parent IDs to generate statements for. If omitted, generates for all active parents.',
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  parent_ids?: string[];

  @ApiPropertyOptional({
    description:
      'Only generate statements for parents with activity in the period',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  only_with_activity?: boolean;

  @ApiPropertyOptional({
    description: 'Only generate statements for parents with a non-zero balance',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  only_with_balance?: boolean;
}

/**
 * DTO for listing statements with filters
 */
export class ListStatementsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by parent ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID('4')
  parent_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by statement status',
    enum: StatementStatus,
    example: 'DRAFT',
  })
  @IsOptional()
  @IsEnum(StatementStatus)
  status?: StatementStatus;

  @ApiPropertyOptional({
    description: 'Filter by period start date (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsDateString()
  period_start?: string;

  @ApiPropertyOptional({
    description: 'Filter by period end date (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsOptional()
  @IsDateString()
  period_end?: string;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

// ============================================================================
// Response DTOs
// ============================================================================

/**
 * Statement line response DTO
 */
export class StatementLineDto {
  @ApiProperty({
    description: 'Line ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Transaction date',
    example: '2025-01-15',
  })
  date: string;

  @ApiProperty({
    description: 'Line description',
    example: 'Invoice for billing period',
  })
  description: string;

  @ApiProperty({
    description: 'Line type',
    example: 'INVOICE',
    enum: [
      'OPENING_BALANCE',
      'INVOICE',
      'PAYMENT',
      'CREDIT_NOTE',
      'ADJUSTMENT',
      'CLOSING_BALANCE',
    ],
  })
  line_type: string;

  @ApiPropertyOptional({
    description: 'Reference number (e.g., invoice number)',
    example: 'INV-2025-0001',
  })
  reference_number?: string | null;

  @ApiProperty({
    description: 'Debit amount in cents',
    example: 500000,
  })
  debit_cents: number;

  @ApiProperty({
    description: 'Credit amount in cents',
    example: 0,
  })
  credit_cents: number;

  @ApiProperty({
    description: 'Running balance in cents after this line',
    example: 500000,
  })
  balance_cents: number;
}

/**
 * Parent summary for statement
 */
export class StatementParentDto {
  @ApiProperty({
    description: 'Parent ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Parent full name',
    example: 'John Smith',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Parent email address',
    example: 'john.smith@example.com',
  })
  email?: string | null;

  @ApiPropertyOptional({
    description: 'Parent phone number',
    example: '+27123456789',
  })
  phone?: string | null;
}

/**
 * Statement response DTO (without lines)
 */
export class StatementSummaryDto {
  @ApiProperty({
    description: 'Statement ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Statement number',
    example: 'STMT-2025-0001',
  })
  statement_number: string;

  @ApiProperty({
    description: 'Parent information',
    type: StatementParentDto,
  })
  parent: StatementParentDto;

  @ApiProperty({
    description: 'Period start date (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  period_start: string;

  @ApiProperty({
    description: 'Period end date (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  period_end: string;

  @ApiProperty({
    description: 'Opening balance in cents',
    example: 0,
  })
  opening_balance_cents: number;

  @ApiProperty({
    description: 'Total charges in cents',
    example: 500000,
  })
  total_charges_cents: number;

  @ApiProperty({
    description: 'Total payments in cents',
    example: 250000,
  })
  total_payments_cents: number;

  @ApiProperty({
    description: 'Total credits in cents',
    example: 0,
  })
  total_credits_cents: number;

  @ApiProperty({
    description: 'Closing balance in cents',
    example: 250000,
  })
  closing_balance_cents: number;

  @ApiProperty({
    description: 'Statement status',
    enum: StatementStatus,
    example: 'DRAFT',
  })
  status: StatementStatus;

  @ApiProperty({
    description: 'Statement generated timestamp',
    example: '2025-02-01T08:00:00Z',
  })
  generated_at: Date;
}

/**
 * Statement response DTO with lines
 */
export class StatementDetailDto extends StatementSummaryDto {
  @ApiProperty({
    description: 'Statement lines',
    type: [StatementLineDto],
  })
  lines: StatementLineDto[];
}

/**
 * List statements response
 */
export class StatementListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [StatementSummaryDto] })
  data: StatementSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

/**
 * Single statement detail response
 */
export class StatementDetailResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: StatementDetailDto })
  data: StatementDetailDto;
}

/**
 * Generate statement response
 */
export class GenerateStatementResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: StatementDetailDto })
  data: StatementDetailDto;
}

/**
 * Bulk generation error item
 */
export class BulkGenerationErrorDto {
  @ApiProperty({
    description: 'Parent ID that failed',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  parent_id: string;

  @ApiProperty({
    description: 'Error message',
    example: 'Parent has no transactions in period',
  })
  error: string;
}

/**
 * Bulk generation result
 */
export class BulkGenerationResultDto {
  @ApiProperty({
    description: 'Number of statements generated',
    example: 25,
  })
  generated: number;

  @ApiProperty({
    description: 'Number of parents skipped',
    example: 5,
  })
  skipped: number;

  @ApiProperty({
    description: 'Errors encountered during generation',
    type: [BulkGenerationErrorDto],
  })
  errors: BulkGenerationErrorDto[];

  @ApiProperty({
    description: 'IDs of generated statements',
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  statement_ids: string[];
}

/**
 * Bulk generate response
 */
export class BulkGenerateResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: BulkGenerationResultDto })
  data: BulkGenerationResultDto;
}

/**
 * Finalize statement response
 */
export class FinalizeStatementResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'Statement finalized successfully',
  })
  message: string;

  @ApiProperty({ type: StatementSummaryDto })
  data: StatementSummaryDto;
}

/**
 * Parent account summary DTO
 */
export class ParentAccountDto {
  @ApiProperty({
    description: 'Parent ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  parent_id: string;

  @ApiProperty({
    description: 'Parent full name',
    example: 'John Smith',
  })
  parent_name: string;

  @ApiPropertyOptional({
    description: 'Parent email address',
    example: 'john.smith@example.com',
  })
  email?: string | null;

  @ApiPropertyOptional({
    description: 'Parent phone number',
    example: '+27123456789',
  })
  phone?: string | null;

  @ApiProperty({
    description: 'Total outstanding amount in cents',
    example: 750000,
  })
  total_outstanding_cents: number;

  @ApiProperty({
    description: 'Credit balance in cents',
    example: 0,
  })
  credit_balance_cents: number;

  @ApiProperty({
    description: 'Net balance in cents (positive = owes, negative = credit)',
    example: 750000,
  })
  net_balance_cents: number;

  @ApiProperty({
    description: 'Number of active children',
    example: 2,
  })
  child_count: number;

  @ApiPropertyOptional({
    description: 'Oldest outstanding invoice date',
    example: '2024-12-01',
  })
  oldest_outstanding_date?: string | null;
}

/**
 * Parent account response
 */
export class ParentAccountResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: ParentAccountDto })
  data: ParentAccountDto;
}

/**
 * Statements for parent response
 */
export class ParentStatementsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [StatementSummaryDto] })
  data: StatementSummaryDto[];
}

// ============================================================================
// Delivery DTOs
// ============================================================================

/**
 * DTO for delivering a single statement
 */
export class DeliverStatementDto {
  @ApiPropertyOptional({
    description:
      'Specific channel to use (optional - uses parent preference if not specified)',
    enum: ['EMAIL', 'WHATSAPP', 'SMS'],
    example: 'EMAIL',
  })
  @IsOptional()
  @IsEnum(['EMAIL', 'WHATSAPP', 'SMS'] as const)
  channel?: 'EMAIL' | 'WHATSAPP' | 'SMS';
}

/**
 * DTO for bulk statement delivery
 */
export class BulkDeliverStatementDto {
  @ApiProperty({
    description: 'Statement IDs to deliver',
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  statement_ids: string[];

  @ApiPropertyOptional({
    description: 'Specific channel to use for all statements (optional)',
    enum: ['EMAIL', 'WHATSAPP', 'SMS'],
    example: 'EMAIL',
  })
  @IsOptional()
  @IsEnum(['EMAIL', 'WHATSAPP', 'SMS'] as const)
  channel?: 'EMAIL' | 'WHATSAPP' | 'SMS';
}

/**
 * Individual delivery result DTO
 */
export class StatementDeliveryResultDto {
  @ApiProperty({
    description: 'Statement ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  statement_id: string;

  @ApiProperty({
    description: 'Parent ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  parent_id: string;

  @ApiProperty({
    description: 'Whether delivery was successful',
    example: true,
  })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Channel used for delivery',
    enum: ['EMAIL', 'WHATSAPP', 'SMS'],
    example: 'EMAIL',
  })
  channel?: string;

  @ApiPropertyOptional({
    description: 'Message ID from delivery provider',
    example: 'msg_123456',
  })
  message_id?: string;

  @ApiPropertyOptional({
    description: 'Error message if delivery failed',
    example: 'Invalid email address',
  })
  error?: string;

  @ApiPropertyOptional({
    description: 'Timestamp when delivered',
    example: '2025-01-15T10:30:00Z',
  })
  delivered_at?: Date;
}

/**
 * Single statement delivery response
 */
export class DeliverStatementResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'Statement delivered successfully',
  })
  message: string;

  @ApiProperty({ type: StatementDeliveryResultDto })
  data: StatementDeliveryResultDto;
}

/**
 * Bulk delivery result DTO
 */
export class BulkDeliveryResultDto {
  @ApiProperty({
    description: 'Number of statements sent successfully',
    example: 25,
  })
  sent: number;

  @ApiProperty({
    description: 'Number of statements that failed to deliver',
    example: 2,
  })
  failed: number;

  @ApiProperty({
    description: 'Individual delivery results',
    type: [StatementDeliveryResultDto],
  })
  results: StatementDeliveryResultDto[];
}

/**
 * Bulk delivery response
 */
export class BulkDeliverResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: BulkDeliveryResultDto })
  data: BulkDeliveryResultDto;
}

// ============================================================================
// Scheduling DTOs
// ============================================================================

/**
 * DTO for scheduling monthly statement generation
 */
export class ScheduleStatementGenerationDto {
  @ApiProperty({
    description: 'Statement period month in YYYY-MM format',
    example: '2025-01',
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'statement_month must be in YYYY-MM format (e.g., 2025-01)',
  })
  statement_month: string;

  @ApiPropertyOptional({
    description:
      'Specific parent IDs to generate statements for. If omitted, generates for all active parents.',
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  parent_ids?: string[];

  @ApiPropertyOptional({
    description:
      'Only generate statements for parents with activity in the period',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  only_with_activity?: boolean;

  @ApiPropertyOptional({
    description: 'Only generate statements for parents with a non-zero balance',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  only_with_balance?: boolean;

  @ApiPropertyOptional({
    description: 'Perform a dry run (validate only, no actual generation)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;

  @ApiPropertyOptional({
    description: 'Automatically finalize generated statements',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  auto_finalize?: boolean;

  @ApiPropertyOptional({
    description: 'Automatically deliver finalized statements',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  auto_deliver?: boolean;
}

/**
 * Scheduled job response DTO
 */
export class ScheduledJobDto {
  @ApiProperty({
    description: 'Job ID',
    example: '123',
  })
  job_id: string;

  @ApiProperty({
    description: 'Queue name',
    example: 'statement-generation',
  })
  queue: string;

  @ApiProperty({
    description: 'Job status',
    example: 'waiting',
    enum: ['waiting', 'active', 'completed', 'failed', 'delayed'],
  })
  status: string;

  @ApiProperty({
    description: 'Statement month being processed',
    example: '2025-01',
  })
  statement_month: string;

  @ApiProperty({
    description: 'Timestamp when job was scheduled',
    example: '2025-01-15T10:00:00Z',
  })
  scheduled_at: Date;
}

/**
 * Schedule statement generation response
 */
export class ScheduleStatementResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'Success message',
    example: 'Statement generation job scheduled',
  })
  message: string;

  @ApiProperty({ type: ScheduledJobDto })
  data: ScheduledJobDto;
}
