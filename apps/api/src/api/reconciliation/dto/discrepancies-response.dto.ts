/**
 * Discrepancies Response DTOs
 * TASK-RECON-UI: Discrepancies Endpoint
 *
 * Response DTOs for discrepancy listing endpoint.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DiscrepancySeverityLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export class DiscrepancyItemDto {
  @ApiProperty({
    example: 'uuid-here',
    description: 'Unique identifier for the discrepancy (transaction ID)',
  })
  id!: string;

  @ApiProperty({
    example: 'recon-uuid-here',
    description: 'Associated reconciliation ID',
  })
  reconciliation_id!: string;

  @ApiProperty({
    example: 'IN_BANK_NOT_XERO',
    description: 'Type of discrepancy',
    enum: [
      'IN_BANK_NOT_XERO',
      'IN_XERO_NOT_BANK',
      'AMOUNT_MISMATCH',
      'DATE_MISMATCH',
    ],
  })
  type!: string;

  @ApiProperty({
    example: 'Transaction in bank but not in Xero: Payment from ABC Corp',
    description: 'Human-readable description of the discrepancy',
  })
  description!: string;

  @ApiProperty({
    example: 1250.5,
    description: 'Amount in Rands',
  })
  amount!: number;

  @ApiProperty({
    example: 'medium',
    enum: DiscrepancySeverityLevel,
    description: 'Severity level based on amount',
  })
  severity!: 'low' | 'medium' | 'high';

  @ApiProperty({
    example: '2025-01-01',
    description: 'Period start date',
  })
  period_start!: string;

  @ApiProperty({
    example: '2025-01-31',
    description: 'Period end date',
  })
  period_end!: string;

  @ApiPropertyOptional({
    example: 'FNB Business Current',
    description: 'Bank account associated with the discrepancy',
  })
  bank_account?: string;

  @ApiPropertyOptional({
    example: '2025-01-15',
    description: 'Transaction date',
  })
  transaction_date?: string | null;

  @ApiPropertyOptional({
    example: 'xero-tx-id-here',
    description: 'Xero transaction ID if applicable',
  })
  xero_transaction_id?: string | null;
}

export class DiscrepancySummaryDto {
  @ApiProperty({
    example: 5,
    description: 'Number of transactions in bank but not in Xero',
  })
  in_bank_not_xero!: number;

  @ApiProperty({
    example: 3,
    description: 'Number of transactions in Xero but not in bank',
  })
  in_xero_not_bank!: number;

  @ApiProperty({
    example: 2,
    description: 'Number of amount mismatches',
  })
  amount_mismatches!: number;

  @ApiProperty({
    example: 1,
    description: 'Number of date mismatches',
  })
  date_mismatches!: number;

  @ApiProperty({
    example: 11,
    description: 'Total discrepancy count',
  })
  total_count!: number;

  @ApiProperty({
    example: 15750.25,
    description: 'Total discrepancy amount in Rands',
  })
  total_amount!: number;
}

export class DiscrepanciesResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: [DiscrepancyItemDto] })
  data!: DiscrepancyItemDto[];

  @ApiProperty({ type: DiscrepancySummaryDto })
  summary!: DiscrepancySummaryDto;
}
