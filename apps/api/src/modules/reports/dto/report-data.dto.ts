/**
 * Report Data DTOs
 * TASK-REPORTS-002: Reports API Module
 *
 * @module modules/reports/dto/report-data.dto
 * @description DTOs for report data responses with Swagger documentation.
 * All amounts are in CENTS as integers. Use Decimal.js for calculations.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ReportType } from '../../../agents/report-synthesis';

/**
 * Query parameters for fetching report data.
 */
export class ReportQueryDto {
  @ApiProperty({
    description: 'Start date of the report period (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDateString()
  @Transform(({ value }: { value: string }) => new Date(value))
  start!: Date;

  @ApiProperty({
    description: 'End date of the report period (ISO 8601)',
    example: '2025-12-31T23:59:59.999Z',
  })
  @IsDateString()
  @Transform(({ value }: { value: string }) => new Date(value))
  end!: Date;

  @ApiPropertyOptional({
    description: 'Include historical comparison data (default: true)',
    default: true,
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: string | boolean | undefined }) =>
      value === undefined ? true : value === 'true' || value === true,
  )
  includeHistorical?: boolean = true;
}

/**
 * Monthly trend data point for charts.
 */
export class MonthlyTrendPointDto {
  @ApiProperty({
    description: 'Month label (e.g., "2025-01" or "January 2025")',
    example: '2025-01',
  })
  month!: string;

  @ApiProperty({
    description: 'Total income for the month in cents',
    example: 15000000,
  })
  income!: number;

  @ApiProperty({
    description: 'Total expenses for the month in cents',
    example: 12000000,
  })
  expenses!: number;
}

/**
 * Category breakdown for pie charts.
 */
export class CategoryBreakdownDto {
  @ApiProperty({
    description: 'Category name (e.g., "Staff Salaries", "Utilities")',
    example: 'Staff Salaries',
  })
  category!: string;

  @ApiProperty({
    description: 'Amount in cents',
    example: 8000000,
  })
  amount!: number;

  @ApiProperty({
    description: 'Percentage of total',
    example: 65.5,
  })
  percentage!: number;
}

/**
 * Monthly comparison data point.
 */
export class ComparisonPointDto {
  @ApiProperty({
    description: 'Month label',
    example: '2025-01',
  })
  month!: string;

  @ApiProperty({
    description: 'Current period value in cents',
    example: 15000000,
  })
  current!: number;

  @ApiProperty({
    description: 'Previous period value in cents',
    example: 14000000,
  })
  previous!: number;

  @ApiProperty({
    description: 'Percentage change from previous period',
    example: 7.14,
  })
  percentageChange!: number;
}

/**
 * Profit margin data point.
 */
export class ProfitMarginPointDto {
  @ApiProperty({
    description: 'Month label',
    example: '2025-01',
  })
  month!: string;

  @ApiProperty({
    description: 'Net profit in cents',
    example: 3000000,
  })
  netProfit!: number;

  @ApiProperty({
    description: 'Profit margin percentage',
    example: 20.0,
  })
  marginPercent!: number;
}

/**
 * Chart data ready for frontend visualization.
 */
export class ChartDataDto {
  @ApiProperty({
    description: 'Monthly income/expense trend data for line charts',
    type: [MonthlyTrendPointDto],
  })
  monthlyTrend!: MonthlyTrendPointDto[];

  @ApiProperty({
    description: 'Expense breakdown by category for pie charts',
    type: [CategoryBreakdownDto],
  })
  expenseBreakdown!: CategoryBreakdownDto[];

  @ApiProperty({
    description: 'Month-over-month comparison data',
    type: [ComparisonPointDto],
  })
  monthlyComparison!: ComparisonPointDto[];

  @ApiProperty({
    description: 'Profit margin trend data',
    type: [ProfitMarginPointDto],
  })
  profitMargin!: ProfitMarginPointDto[];
}

/**
 * Historical data point for trend analysis.
 */
export class HistoricalDataPointDto {
  @ApiProperty({
    description: 'Period identifier (e.g., "2024-01")',
    example: '2024-01',
  })
  period!: string;

  @ApiProperty({
    description: 'Total income in cents',
    example: 14000000,
  })
  totalIncomeCents!: number;

  @ApiProperty({
    description: 'Total expenses in cents',
    example: 11000000,
  })
  totalExpensesCents!: number;

  @ApiProperty({
    description: 'Net profit in cents',
    example: 3000000,
  })
  netProfitCents!: number;
}

/**
 * Report summary section.
 */
export class ReportSummaryDto {
  @ApiProperty({
    description: 'Total income in cents',
    example: 15000000,
  })
  totalIncomeCents!: number;

  @ApiProperty({
    description: 'Total income in rands',
    example: 150000.0,
  })
  totalIncomeRands!: number;

  @ApiProperty({
    description: 'Total expenses in cents',
    example: 12000000,
  })
  totalExpensesCents!: number;

  @ApiProperty({
    description: 'Total expenses in rands',
    example: 120000.0,
  })
  totalExpensesRands!: number;

  @ApiProperty({
    description: 'Net profit in cents',
    example: 3000000,
  })
  netProfitCents!: number;

  @ApiProperty({
    description: 'Net profit in rands',
    example: 30000.0,
  })
  netProfitRands!: number;

  @ApiProperty({
    description: 'Profit margin percentage',
    example: 20.0,
  })
  profitMarginPercent!: number;
}

/**
 * Account breakdown for report sections.
 */
export class AccountBreakdownResponseDto {
  @ApiProperty({
    description: 'Account code',
    example: '4000',
  })
  accountCode!: string;

  @ApiProperty({
    description: 'Account name',
    example: 'School Fees',
  })
  accountName!: string;

  @ApiProperty({
    description: 'Amount in cents',
    example: 15000000,
  })
  amountCents!: number;

  @ApiProperty({
    description: 'Amount in rands',
    example: 150000.0,
  })
  amountRands!: number;
}

/**
 * Report section with breakdown.
 */
export class ReportSectionDto {
  @ApiProperty({
    description: 'Section title',
    example: 'Income',
  })
  title!: string;

  @ApiProperty({
    description: 'Section total in cents',
    example: 15000000,
  })
  totalCents!: number;

  @ApiProperty({
    description: 'Section total in rands',
    example: 150000.0,
  })
  totalRands!: number;

  @ApiProperty({
    description: 'Account breakdown',
    type: [AccountBreakdownResponseDto],
  })
  breakdown!: AccountBreakdownResponseDto[];
}

/**
 * Period information.
 */
export class PeriodDto {
  @ApiProperty({
    description: 'Period start date (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  start!: string;

  @ApiProperty({
    description: 'Period end date (ISO 8601)',
    example: '2025-12-31T23:59:59.999Z',
  })
  end!: string;
}

/**
 * Full report data response.
 */
export class ReportDataResponseDto {
  @ApiProperty({
    description: 'Report type',
    enum: ReportType,
    example: 'INCOME_STATEMENT',
  })
  type!: ReportType;

  @ApiProperty({
    description: 'Tenant ID',
    example: 'tenant-123-uuid',
  })
  tenantId!: string;

  @ApiProperty({
    description: 'Report period',
    type: PeriodDto,
  })
  period!: PeriodDto;

  @ApiProperty({
    description: 'When the report was generated (ISO 8601)',
    example: '2025-01-29T12:00:00.000Z',
  })
  generatedAt!: string;

  @ApiProperty({
    description: 'Report summary with totals',
    type: ReportSummaryDto,
  })
  summary!: ReportSummaryDto;

  @ApiProperty({
    description: 'Report sections with breakdowns',
    type: [ReportSectionDto],
  })
  sections!: ReportSectionDto[];

  @ApiProperty({
    description: 'Chart-ready data for frontend visualization',
    type: ChartDataDto,
  })
  chartData!: ChartDataDto;

  @ApiProperty({
    description: 'Historical data for trend comparison (up to 12 months)',
    type: [HistoricalDataPointDto],
  })
  historical!: HistoricalDataPointDto[];
}

/**
 * Report type enum for controller validation.
 */
export { ReportType };
