import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Invoice item in dashboard response
 */
export class DashboardInvoiceDto {
  @ApiProperty({ description: 'Invoice ID' })
  id: string;

  @ApiProperty({ description: 'Invoice number' })
  invoiceNumber: string;

  @ApiProperty({ description: 'Invoice date' })
  date: string;

  @ApiProperty({ description: 'Invoice amount' })
  amount: number;

  @ApiProperty({
    description: 'Invoice status',
    enum: ['paid', 'pending', 'overdue']
  })
  status: 'paid' | 'pending' | 'overdue';
}

/**
 * Child item in dashboard response
 */
export class DashboardChildDto {
  @ApiProperty({ description: 'Child ID' })
  id: string;

  @ApiProperty({ description: 'Child full name' })
  name: string;

  @ApiPropertyOptional({ description: 'Date of birth' })
  dateOfBirth?: string;

  @ApiProperty({
    description: 'Enrollment status',
    enum: ['active', 'pending', 'inactive']
  })
  enrollmentStatus: 'active' | 'pending' | 'inactive';

  @ApiPropertyOptional({ description: 'Class name' })
  className?: string;
}

/**
 * Next payment due information
 */
export class NextPaymentDueDto {
  @ApiProperty({ description: 'Payment due date' })
  date: string;

  @ApiProperty({ description: 'Amount due' })
  amount: number;
}

/**
 * Parent dashboard data response
 */
export class ParentDashboardDto {
  @ApiProperty({ description: 'Current outstanding balance' })
  currentBalance: number;

  @ApiProperty({
    description: 'List of recent invoices (up to 5)',
    type: [DashboardInvoiceDto]
  })
  recentInvoices: DashboardInvoiceDto[];

  @ApiProperty({
    description: 'List of enrolled children',
    type: [DashboardChildDto]
  })
  children: DashboardChildDto[];

  @ApiPropertyOptional({
    description: 'Next payment due information',
    type: NextPaymentDueDto
  })
  nextPaymentDue: NextPaymentDueDto | null;

  @ApiProperty({ description: 'Whether account has arrears' })
  hasArrears: boolean;

  @ApiPropertyOptional({ description: 'Number of days overdue (if in arrears)' })
  daysOverdue: number | null;

  @ApiProperty({ description: 'Parent first name' })
  firstName: string;

  @ApiProperty({ description: 'Parent last name' })
  lastName: string;

  @ApiProperty({ description: 'Parent email' })
  email: string;
}
