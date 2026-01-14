/**
 * Reconciliation Response DTOs
 * TASK-RECON-031: Reconciliation Controller
 *
 * Response DTOs for reconciliation operations.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReconciliationDataDto {
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
    description: 'Detailed match summary breakdown',
    example: {
      matched: 45,
      in_bank_only: 2,
      in_xero_only: 0,
      amount_mismatch: 1,
      date_mismatch: 0,
      total: 48,
    },
  })
  match_summary?: {
    matched: number;
    in_bank_only: number;
    in_xero_only: number;
    amount_mismatch: number;
    date_mismatch: number;
    total: number;
  };
}

export class ApiReconciliationResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ReconciliationDataDto })
  data!: ReconciliationDataDto;
}
