import { ApiProperty } from '@nestjs/swagger';

export class ReconciliationSummaryResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  data: {
    total_reconciled: number;
    total_unreconciled: number;
    last_reconciliation_date: string | null;
    reconciliation_rate: number;
    discrepancy_amount: number;
    period_count: number;
  };
}
