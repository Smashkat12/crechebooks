import { ApiProperty } from '@nestjs/swagger';

/**
 * Age bucket DTO for arrears summary
 *
 * STANDARDIZED aging buckets (TASK-BILL-006):
 * - current: 1-30 days overdue (due but within grace period)
 * - days30: 31-60 days overdue
 * - days60: 61-90 days overdue
 * - days90Plus: >90 days overdue
 *
 * NOTE: Invoices not yet due (daysOverdue <= 0) are NOT included in arrears.
 */
export interface AgeBucketDto {
  current: number;
  days30: number;
  days60: number;
  days90Plus: number;
}

export interface TrendDto {
  previousMonth: number;
  change: number;
  changePercent: number;
}

export class ArrearsSummaryResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  totalOutstanding: number;

  @ApiProperty()
  totalAccounts: number;

  @ApiProperty()
  byAgeBucket: AgeBucketDto;

  @ApiProperty()
  trend: TrendDto;
}
