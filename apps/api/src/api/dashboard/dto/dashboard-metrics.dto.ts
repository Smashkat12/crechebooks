import { ApiProperty } from '@nestjs/swagger';

class RevenueMetricsDto {
  @ApiProperty({ description: 'Total revenue in cents' })
  total: number;

  @ApiProperty({ description: 'Total invoiced amount in cents' })
  invoiced: number;

  @ApiProperty({ description: 'Total collected amount in cents' })
  collected: number;

  @ApiProperty({ description: 'Outstanding amount in cents' })
  outstanding: number;
}

class ExpenseMetricsDto {
  @ApiProperty({ description: 'Total expenses in cents' })
  total: number;

  @ApiProperty({ description: 'Categorized expenses in cents' })
  categorized: number;

  @ApiProperty({ description: 'Uncategorized expenses in cents' })
  uncategorized: number;
}

class ArrearsMetricsDto {
  @ApiProperty({ description: 'Total arrears amount in cents' })
  total: number;

  @ApiProperty({ description: 'Number of accounts in arrears' })
  count: number;

  @ApiProperty({ description: 'Amount overdue by 30+ days in cents' })
  overdueBy30: number;

  @ApiProperty({ description: 'Amount overdue by 60+ days in cents' })
  overdueBy60: number;

  @ApiProperty({ description: 'Amount overdue by 90+ days in cents' })
  overdueBy90: number;
}

class EnrollmentMetricsDto {
  @ApiProperty({ description: 'Total enrolled children' })
  total: number;

  @ApiProperty({ description: 'Active enrollments' })
  active: number;

  @ApiProperty({ description: 'Inactive enrollments' })
  inactive: number;
}

class PaymentMetricsDto {
  @ApiProperty({ description: 'Matched payment count' })
  matched: number;

  @ApiProperty({ description: 'Unmatched payment count' })
  unmatched: number;

  @ApiProperty({ description: 'Pending payment count' })
  pending: number;
}

export class DashboardMetricsResponseDto {
  @ApiProperty({
    description: 'Period for the metrics (e.g., "current_month")',
  })
  period: string;

  @ApiProperty({ type: RevenueMetricsDto })
  revenue: RevenueMetricsDto;

  @ApiProperty({ type: ExpenseMetricsDto })
  expenses: ExpenseMetricsDto;

  @ApiProperty({ type: ArrearsMetricsDto })
  arrears: ArrearsMetricsDto;

  @ApiProperty({ type: EnrollmentMetricsDto })
  enrollment: EnrollmentMetricsDto;

  @ApiProperty({ type: PaymentMetricsDto })
  payments: PaymentMetricsDto;
}
