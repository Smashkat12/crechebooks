/**
 * Arrears Dashboard DTOs
 * TASK-PAY-033: Arrears Dashboard Endpoint
 *
 * API DTOs for arrears reporting endpoint.
 * Uses snake_case for external API, transforms to camelCase for internal services.
 * All monetary amounts: decimal in API, cents internally.
 */

import { IsOptional, IsUUID, IsDate, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query parameters for arrears report (API snake_case).
 */
export class ApiArrearsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by date from (ISO date string)',
    example: '2025-01-01',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_from?: Date;

  @ApiPropertyOptional({
    description: 'Filter by date to (ISO date string)',
    example: '2025-12-31',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date_to?: Date;

  @ApiPropertyOptional({
    description: 'Filter by parent ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @ApiPropertyOptional({
    description: 'Minimum outstanding amount in Rand (decimal)',
    example: 100.0,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  min_amount?: number;

  @ApiPropertyOptional({
    description: 'Limit number of top debtors returned',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  debtor_limit?: number;
}

/**
 * Aging buckets for arrears (API snake_case, amounts in Rand).
 */
export class ApiAgingBucketsDto {
  @ApiProperty({ example: 2500.0, description: '0-7 days overdue (Rand)' })
  current!: number;

  @ApiProperty({ example: 5000.0, description: '8-30 days overdue (Rand)' })
  days_30!: number;

  @ApiProperty({ example: 3000.0, description: '31-60 days overdue (Rand)' })
  days_60!: number;

  @ApiProperty({ example: 1500.0, description: '61+ days overdue (Rand)' })
  days_90_plus!: number;
}

/**
 * Summary statistics for arrears report (API snake_case).
 */
export class ApiArrearsSummaryDto {
  @ApiProperty({ example: 12000.0, description: 'Total outstanding (Rand)' })
  total_outstanding!: number;

  @ApiProperty({ example: 15, description: 'Total overdue invoices' })
  total_invoices!: number;

  @ApiProperty({ type: ApiAgingBucketsDto })
  aging!: ApiAgingBucketsDto;
}

/**
 * Top debtor summary (API snake_case).
 */
export class ApiDebtorSummaryDto {
  @ApiProperty({ example: 'parent-uuid' })
  parent_id!: string;

  @ApiProperty({ example: 'John Smith' })
  parent_name!: string;

  @ApiPropertyOptional({ example: 'john@example.com' })
  email!: string | null;

  @ApiPropertyOptional({ example: '+27123456789' })
  phone!: string | null;

  @ApiProperty({ example: 5000.0, description: 'Total outstanding (Rand)' })
  total_outstanding!: number;

  @ApiProperty({ example: '2025-01-15', description: 'Oldest invoice date' })
  oldest_invoice_date!: string;

  @ApiProperty({ example: 3, description: 'Number of overdue invoices' })
  invoice_count!: number;

  @ApiProperty({ example: 45, description: 'Maximum days overdue' })
  max_days_overdue!: number;
}

/**
 * Individual arrears invoice (API snake_case).
 */
export class ApiArrearsInvoiceDto {
  @ApiProperty({ example: 'invoice-uuid' })
  invoice_id!: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number!: string;

  @ApiProperty({ example: 'parent-uuid' })
  parent_id!: string;

  @ApiProperty({ example: 'John Smith' })
  parent_name!: string;

  @ApiProperty({ example: 'child-uuid' })
  child_id!: string;

  @ApiProperty({ example: 'Emma Smith' })
  child_name!: string;

  @ApiProperty({ example: '2025-01-01', description: 'Invoice issue date' })
  issue_date!: string;

  @ApiProperty({ example: '2025-01-15', description: 'Invoice due date' })
  due_date!: string;

  @ApiProperty({ example: 3450.0, description: 'Total invoice amount (Rand)' })
  total!: number;

  @ApiProperty({ example: 1000.0, description: 'Amount paid (Rand)' })
  amount_paid!: number;

  @ApiProperty({ example: 2450.0, description: 'Outstanding amount (Rand)' })
  outstanding!: number;

  @ApiProperty({ example: 30, description: 'Days overdue' })
  days_overdue!: number;

  @ApiProperty({ example: '30', enum: ['current', '30', '60', '90+'] })
  aging_bucket!: string;
}

/**
 * Complete arrears report data (API snake_case).
 */
export class ApiArrearsReportDataDto {
  @ApiProperty({ type: ApiArrearsSummaryDto })
  summary!: ApiArrearsSummaryDto;

  @ApiProperty({ type: [ApiDebtorSummaryDto] })
  top_debtors!: ApiDebtorSummaryDto[];

  @ApiProperty({ type: [ApiArrearsInvoiceDto] })
  invoices!: ApiArrearsInvoiceDto[];

  @ApiProperty({ example: '2025-12-22T10:00:00.000Z' })
  generated_at!: string;
}

/**
 * Full response for arrears report endpoint.
 */
export class ApiArrearsReportResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ApiArrearsReportDataDto })
  data!: ApiArrearsReportDataDto;
}
