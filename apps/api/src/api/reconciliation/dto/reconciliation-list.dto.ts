/**
 * Reconciliation List DTOs
 * TASK-RECON-UI: Reconciliation List Endpoint
 *
 * Query and response DTOs for listing reconciliations with filtering and pagination.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReconciliationStatusFilter {
  IN_PROGRESS = 'IN_PROGRESS',
  RECONCILED = 'RECONCILED',
  DISCREPANCY = 'DISCREPANCY',
}

export class ReconciliationListQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by bank account identifier',
    example: 'FNB Business Current',
  })
  @IsOptional()
  @IsString()
  bank_account?: string;

  @ApiPropertyOptional({
    description: 'Filter by reconciliation status',
    enum: ReconciliationStatusFilter,
    example: 'IN_PROGRESS',
  })
  @IsOptional()
  @IsEnum(ReconciliationStatusFilter)
  status?: ReconciliationStatusFilter;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ReconciliationListItemDto {
  @ApiProperty({ example: 'uuid-here' })
  id!: string;

  @ApiProperty({
    example: 'RECONCILED',
    enum: ['IN_PROGRESS', 'RECONCILED', 'DISCREPANCY'],
  })
  status!: string;

  @ApiProperty({ example: 'FNB Business Current' })
  bank_account!: string;

  @ApiProperty({ example: '2025-01-01' })
  period_start!: string;

  @ApiProperty({ example: '2025-01-31' })
  period_end!: string;

  @ApiProperty({ example: 50000.0, description: 'Opening balance (Rands)' })
  opening_balance!: number;

  @ApiProperty({
    example: 62500.0,
    description: 'Closing balance from statement (Rands)',
  })
  closing_balance!: number;

  @ApiProperty({
    example: 62500.0,
    description: 'Calculated from opening + credits - debits (Rands)',
  })
  calculated_balance!: number;

  @ApiProperty({
    example: 0.0,
    description: 'closing_balance - calculated_balance (Rands)',
  })
  discrepancy!: number;

  @ApiProperty({
    example: 45,
    description: 'Transactions matched and marked as reconciled',
  })
  matched_count!: number;

  @ApiProperty({ example: 0, description: 'Transactions not matched' })
  unmatched_count!: number;

  @ApiPropertyOptional({
    example: '2025-01-31T14:30:00.000Z',
    description: 'When reconciliation was completed',
  })
  reconciled_at?: string | null;

  @ApiProperty({
    example: '2025-01-01T10:00:00.000Z',
    description: 'When reconciliation was created',
  })
  created_at!: string;
}

export class ReconciliationListResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: [ReconciliationListItemDto] })
  data!: ReconciliationListItemDto[];

  @ApiProperty({ example: 42, description: 'Total number of reconciliations' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Items per page' })
  limit!: number;
}
