import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EarningsItemDto {
  @ApiProperty({ description: 'Name of the earnings item' })
  name: string;

  @ApiProperty({ description: 'Amount in ZAR' })
  amount: number;

  @ApiPropertyOptional({ description: 'Hours worked (for hourly pay)' })
  hours?: number;

  @ApiPropertyOptional({ description: 'Hourly rate in ZAR (for hourly pay)' })
  rate?: number;
}

export class DeductionItemDto {
  @ApiProperty({ description: 'Name of the deduction' })
  name: string;

  @ApiProperty({ description: 'Deduction amount in ZAR' })
  amount: number;

  @ApiProperty({
    description: 'Type of deduction',
    enum: ['tax', 'uif', 'pension', 'medical', 'other'],
  })
  type: 'tax' | 'uif' | 'pension' | 'medical' | 'other';
}

export class EmployerContributionDto {
  @ApiProperty({ description: 'Name of the employer contribution' })
  name: string;

  @ApiProperty({ description: 'Contribution amount in ZAR' })
  amount: number;
}

export class PayslipSummaryDto {
  @ApiProperty({ description: 'Payslip unique identifier' })
  id: string;

  @ApiProperty({ description: 'Date payment was made' })
  payDate: Date;

  @ApiProperty({ description: 'Pay period description (e.g., "January 2024")' })
  period: string;

  @ApiProperty({ description: 'Start date of pay period' })
  periodStart: Date;

  @ApiProperty({ description: 'End date of pay period' })
  periodEnd: Date;

  @ApiProperty({ description: 'Gross pay amount in ZAR' })
  grossPay: number;

  @ApiProperty({ description: 'Net pay amount in ZAR' })
  netPay: number;

  @ApiProperty({ description: 'Total deductions in ZAR' })
  totalDeductions: number;

  @ApiProperty({
    description: 'Payment status',
    enum: ['paid', 'pending', 'processing'],
  })
  status: 'paid' | 'pending' | 'processing';
}

export class PayslipDetailDto extends PayslipSummaryDto {
  @ApiProperty({
    type: [EarningsItemDto],
    description: 'List of earnings items',
  })
  earnings: EarningsItemDto[];

  @ApiProperty({
    type: [DeductionItemDto],
    description: 'List of deduction items',
  })
  deductions: DeductionItemDto[];

  @ApiProperty({
    type: [EmployerContributionDto],
    description: 'List of employer contributions',
  })
  employerContributions: EmployerContributionDto[];

  @ApiProperty({ description: 'Total earnings in ZAR' })
  totalEarnings: number;

  @ApiProperty({ description: 'Total tax (PAYE) in ZAR' })
  totalTax: number;

  @ApiProperty({ description: 'Total employer contributions in ZAR' })
  totalEmployerContributions: number;

  @ApiProperty({ description: 'Method of payment (e.g., "Bank Transfer")' })
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'Masked bank account number' })
  bankAccount?: string;
}

export class PaginationMetaDto {
  @ApiProperty({ description: 'Total number of items' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}

export class PayslipsResponseDto {
  @ApiProperty({ type: [PayslipSummaryDto], description: 'List of payslips' })
  data: PayslipSummaryDto[];

  @ApiProperty({ type: PaginationMetaDto, description: 'Pagination metadata' })
  meta: PaginationMetaDto;
}
