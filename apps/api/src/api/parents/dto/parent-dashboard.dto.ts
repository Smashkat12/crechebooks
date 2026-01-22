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

// ============================================================================
// TASK-PORTAL-013: Parent Portal Invoices DTOs
// ============================================================================

/**
 * Invoice list item for parent portal
 */
export class ParentInvoiceListItemDto {
  @ApiProperty({ description: 'Invoice ID' })
  id: string;

  @ApiProperty({ description: 'Invoice number' })
  invoiceNumber: string;

  @ApiProperty({ description: 'Invoice date (ISO string)' })
  date: string;

  @ApiPropertyOptional({ description: 'Child name' })
  childName?: string;

  @ApiProperty({ description: 'Invoice amount in Rands' })
  amount: number;

  @ApiProperty({
    description: 'Invoice status',
    enum: ['paid', 'pending', 'overdue'],
  })
  status: 'paid' | 'pending' | 'overdue';
}

/**
 * Parent invoices list response with pagination
 */
export class ParentInvoicesListDto {
  @ApiProperty({
    description: 'List of invoices',
    type: [ParentInvoiceListItemDto],
  })
  invoices: ParentInvoiceListItemDto[];

  @ApiProperty({ description: 'Total number of invoices' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}

/**
 * Invoice line item for detail view
 */
export class ParentInvoiceLineItemDto {
  @ApiProperty({ description: 'Line item ID' })
  id: string;

  @ApiProperty({ description: 'Item description' })
  description: string;

  @ApiProperty({ description: 'Quantity' })
  quantity: number;

  @ApiProperty({ description: 'Unit price in Rands' })
  unitPrice: number;

  @ApiProperty({ description: 'VAT amount in Rands' })
  vatAmount: number;

  @ApiProperty({ description: 'Total amount in Rands' })
  total: number;
}

/**
 * Payment record for invoice detail
 */
export class ParentPaymentRecordDto {
  @ApiProperty({ description: 'Payment ID' })
  id: string;

  @ApiProperty({ description: 'Payment date (ISO string)' })
  date: string;

  @ApiProperty({ description: 'Payment amount in Rands' })
  amount: number;

  @ApiProperty({ description: 'Payment method' })
  method: string;

  @ApiPropertyOptional({ description: 'Payment reference' })
  reference?: string;
}

/**
 * Invoice detail response for parent portal
 */
export class ParentInvoiceDetailDto {
  @ApiProperty({ description: 'Invoice ID' })
  id: string;

  @ApiProperty({ description: 'Invoice number' })
  invoiceNumber: string;

  @ApiProperty({ description: 'Issue date (ISO string)' })
  issueDate: string;

  @ApiProperty({ description: 'Due date (ISO string)' })
  dueDate: string;

  @ApiProperty({
    description: 'Invoice status',
    enum: ['paid', 'pending', 'overdue'],
  })
  status: 'paid' | 'pending' | 'overdue';

  @ApiProperty({ description: 'Parent full name' })
  parentName: string;

  @ApiPropertyOptional({ description: 'Parent email' })
  parentEmail?: string;

  @ApiProperty({ description: 'Creche/School name' })
  crecheName: string;

  @ApiPropertyOptional({ description: 'Creche/School address' })
  crecheAddress?: string;

  @ApiProperty({ description: 'Child full name' })
  childName: string;

  @ApiProperty({ description: 'Subtotal amount in Rands' })
  subtotal: number;

  @ApiProperty({ description: 'VAT amount in Rands' })
  vatAmount: number;

  @ApiProperty({ description: 'Total amount in Rands' })
  total: number;

  @ApiProperty({ description: 'Amount paid in Rands' })
  amountPaid: number;

  @ApiProperty({ description: 'Outstanding amount in Rands' })
  amountDue: number;

  @ApiProperty({
    description: 'Invoice line items',
    type: [ParentInvoiceLineItemDto],
  })
  lineItems: ParentInvoiceLineItemDto[];

  @ApiProperty({
    description: 'Payment history',
    type: [ParentPaymentRecordDto],
  })
  payments: ParentPaymentRecordDto[];

  @ApiPropertyOptional({ description: 'Invoice notes' })
  notes?: string;
}
