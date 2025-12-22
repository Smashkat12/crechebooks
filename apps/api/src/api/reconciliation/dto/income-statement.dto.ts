/**
 * Income Statement DTOs
 * TASK-RECON-032: Financial Reports Endpoint
 *
 * API DTOs for Income Statement (Profit & Loss) endpoint.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class ApiIncomeStatementQueryDto {
  @ApiProperty({
    description: 'Start date of reporting period (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsDateString()
  period_start!: string;

  @ApiProperty({
    description: 'End date of reporting period (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsDateString()
  period_end!: string;

  @ApiPropertyOptional({
    description: 'Output format',
    enum: ['json', 'pdf', 'excel'],
    default: 'json',
  })
  @IsOptional()
  @IsEnum(['json', 'pdf', 'excel'])
  format?: 'json' | 'pdf' | 'excel';
}

export class ApiAccountBreakdownDto {
  @ApiProperty({ example: '4000', description: 'Account code' })
  account_code!: string;

  @ApiProperty({ example: 'School Fees', description: 'Account name' })
  account_name!: string;

  @ApiProperty({ example: 150000.0, description: 'Amount in Rands' })
  amount!: number;
}

export class ApiIncomeSectionDto {
  @ApiProperty({ example: 154500.0, description: 'Total income (Rands)' })
  total!: number;

  @ApiProperty({
    type: [ApiAccountBreakdownDto],
    description: 'Breakdown by account',
  })
  breakdown!: ApiAccountBreakdownDto[];
}

export class ApiExpenseSectionDto {
  @ApiProperty({ example: 85200.0, description: 'Total expenses (Rands)' })
  total!: number;

  @ApiProperty({
    type: [ApiAccountBreakdownDto],
    description: 'Breakdown by account',
  })
  breakdown!: ApiAccountBreakdownDto[];
}

export class ApiPeriodDto {
  @ApiProperty({ example: '2025-01-01' })
  start!: string;

  @ApiProperty({ example: '2025-01-31' })
  end!: string;
}

export class ApiIncomeStatementDataDto {
  @ApiProperty({ type: ApiPeriodDto })
  period!: ApiPeriodDto;

  @ApiProperty({ type: ApiIncomeSectionDto })
  income!: ApiIncomeSectionDto;

  @ApiProperty({ type: ApiExpenseSectionDto })
  expenses!: ApiExpenseSectionDto;

  @ApiProperty({
    example: 69300.0,
    description: 'Net profit (income - expenses) in Rands',
  })
  net_profit!: number;

  @ApiProperty({
    example: '2025-01-31T14:30:00.000Z',
    description: 'Report generation timestamp',
  })
  generated_at!: string;

  @ApiPropertyOptional({
    example: '/reports/income-statement/uuid/download',
    description: 'Present if format is pdf or excel',
  })
  document_url?: string;
}

export class ApiIncomeStatementResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ApiIncomeStatementDataDto })
  data!: ApiIncomeStatementDataDto;
}
