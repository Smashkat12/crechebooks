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
    enum: ['paid', 'pending', 'overdue'],
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
    enum: ['active', 'pending', 'inactive'],
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
    type: [DashboardInvoiceDto],
  })
  recentInvoices: DashboardInvoiceDto[];

  @ApiProperty({
    description: 'List of enrolled children',
    type: [DashboardChildDto],
  })
  children: DashboardChildDto[];

  @ApiPropertyOptional({
    description: 'Next payment due information',
    type: NextPaymentDueDto,
  })
  nextPaymentDue: NextPaymentDueDto | null;

  @ApiProperty({ description: 'Whether account has arrears' })
  hasArrears: boolean;

  @ApiPropertyOptional({
    description: 'Number of days overdue (if in arrears)',
  })
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

// ============================================================================
// TASK-PORTAL-014: Parent Portal Statements DTOs
// ============================================================================

/**
 * Statement list item for parent portal
 */
export class ParentStatementListItemDto {
  @ApiProperty({ description: 'Year of the statement' })
  year: number;

  @ApiProperty({ description: 'Month of the statement (1-12)' })
  month: number;

  @ApiProperty({
    description: 'Human readable period label (e.g., "January 2024")',
  })
  periodLabel: string;

  @ApiProperty({ description: 'Number of transactions in the period' })
  transactionCount: number;

  @ApiProperty({ description: 'Opening balance in Rands' })
  openingBalance: number;

  @ApiProperty({ description: 'Closing balance in Rands' })
  closingBalance: number;

  @ApiProperty({
    description: 'Statement status',
    enum: ['available', 'generating', 'pending'],
  })
  status: 'available' | 'generating' | 'pending';
}

/**
 * Statement list response with year filter
 */
export class ParentStatementsListDto {
  @ApiProperty({
    description: 'List of statements',
    type: [ParentStatementListItemDto],
  })
  statements: ParentStatementListItemDto[];

  @ApiProperty({ description: 'Year filter applied' })
  year: number;
}

/**
 * Transaction in a statement
 */
export class ParentStatementTransactionDto {
  @ApiProperty({ description: 'Transaction ID' })
  id: string;

  @ApiProperty({ description: 'Transaction date (ISO string)' })
  date: string;

  @ApiProperty({
    description:
      'Transaction description (invoice number or payment reference)',
  })
  description: string;

  @ApiProperty({
    description: 'Transaction type',
    enum: ['invoice', 'payment', 'credit'],
  })
  type: 'invoice' | 'payment' | 'credit';

  @ApiPropertyOptional({ description: 'Debit amount in Rands (for invoices)' })
  debit: number | null;

  @ApiPropertyOptional({
    description: 'Credit amount in Rands (for payments/credits)',
  })
  credit: number | null;

  @ApiProperty({ description: 'Running balance after this transaction' })
  balance: number;
}

/**
 * Statement detail response for parent portal
 */
export class ParentStatementDetailDto {
  @ApiProperty({ description: 'Year of the statement' })
  year: number;

  @ApiProperty({ description: 'Month of the statement (1-12)' })
  month: number;

  @ApiProperty({ description: 'Human readable period label' })
  periodLabel: string;

  @ApiProperty({ description: 'Parent full name' })
  parentName: string;

  @ApiPropertyOptional({ description: 'Parent email' })
  parentEmail?: string;

  @ApiPropertyOptional({ description: 'Account number' })
  accountNumber?: string;

  @ApiProperty({
    description: 'Opening balance in Rands (previous period closing)',
  })
  openingBalance: number;

  @ApiProperty({ description: 'Closing balance in Rands' })
  closingBalance: number;

  @ApiProperty({ description: 'Total invoiced amount in Rands' })
  totalInvoiced: number;

  @ApiProperty({ description: 'Total paid amount in Rands' })
  totalPaid: number;

  @ApiProperty({ description: 'Total credits in Rands' })
  totalCredits: number;

  @ApiProperty({ description: 'Net movement (invoiced - paid - credits)' })
  netMovement: number;

  @ApiProperty({
    description: 'List of transactions',
    type: [ParentStatementTransactionDto],
  })
  transactions: ParentStatementTransactionDto[];
}

/**
 * Email statement response
 */
export class EmailStatementResponseDto {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Email address the statement was sent to' })
  sentTo: string;
}

// ============================================================================
// TASK-PORTAL-015: Parent Portal Payments DTOs
// ============================================================================

/**
 * Payment list item for parent portal
 */
export class ParentPaymentListItemDto {
  @ApiProperty({ description: 'Payment ID' })
  id: string;

  @ApiProperty({ description: 'Payment date (ISO string)' })
  paymentDate: string;

  @ApiProperty({ description: 'Payment amount in Rands' })
  amount: number;

  @ApiProperty({ description: 'Payment reference' })
  reference: string;

  @ApiProperty({ description: 'Payment method (EFT, Card, etc.)' })
  method: string;

  @ApiProperty({
    description: 'Payment status',
    enum: ['completed', 'pending', 'failed'],
  })
  status: 'completed' | 'pending' | 'failed';
}

/**
 * Parent payments list response with pagination
 */
export class ParentPaymentsListDto {
  @ApiProperty({
    description: 'List of payments',
    type: [ParentPaymentListItemDto],
  })
  payments: ParentPaymentListItemDto[];

  @ApiProperty({ description: 'Total number of payments' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Total outstanding amount in Rands' })
  totalOutstanding: number;
}

/**
 * Payment allocation to an invoice
 */
export class ParentPaymentAllocationDto {
  @ApiProperty({ description: 'Invoice ID' })
  invoiceId: string;

  @ApiProperty({ description: 'Invoice number' })
  invoiceNumber: string;

  @ApiPropertyOptional({ description: 'Child name' })
  childName?: string;

  @ApiProperty({ description: 'Amount allocated to this invoice in Rands' })
  allocatedAmount: number;

  @ApiProperty({ description: 'Total invoice amount in Rands' })
  invoiceTotal: number;
}

/**
 * Payment detail response for parent portal
 */
export class ParentPaymentDetailDto {
  @ApiProperty({ description: 'Payment ID' })
  id: string;

  @ApiProperty({ description: 'Payment date (ISO string)' })
  paymentDate: string;

  @ApiProperty({ description: 'Payment amount in Rands' })
  amount: number;

  @ApiProperty({ description: 'Payment reference' })
  reference: string;

  @ApiProperty({ description: 'Payment method (EFT, Card, etc.)' })
  method: string;

  @ApiProperty({
    description: 'Payment status',
    enum: ['completed', 'pending', 'failed'],
  })
  status: 'completed' | 'pending' | 'failed';

  @ApiProperty({
    description: 'Invoice allocations',
    type: [ParentPaymentAllocationDto],
  })
  allocations: ParentPaymentAllocationDto[];

  @ApiProperty({ description: 'Whether a receipt is available for download' })
  hasReceipt: boolean;

  @ApiPropertyOptional({ description: 'Payment notes' })
  notes?: string;
}

/**
 * Creche bank details for EFT payments
 */
export class CrecheBankDetailsDto {
  @ApiProperty({ description: 'Bank name (e.g., FNB, Standard Bank)' })
  bankName: string;

  @ApiProperty({ description: 'Account holder name (Creche name)' })
  accountHolderName: string;

  @ApiProperty({ description: 'Bank account number' })
  accountNumber: string;

  @ApiProperty({ description: 'Branch code' })
  branchCode: string;

  @ApiProperty({
    description: 'Account type',
    enum: ['Cheque', 'Savings', 'Current'],
  })
  accountType: 'Cheque' | 'Savings' | 'Current';

  @ApiPropertyOptional({ description: 'SWIFT code for international payments' })
  swiftCode?: string;

  @ApiProperty({
    description: 'Auto-generated payment reference for this parent',
  })
  paymentReference: string;

  @ApiPropertyOptional({ description: 'Payment instructions' })
  paymentInstructions?: string;
}

// ============================================================================
// TASK-PORTAL-016: Parent Portal Profile and Preferences DTOs
// ============================================================================

/**
 * Address DTO
 */
export class ParentAddressDto {
  @ApiPropertyOptional({ description: 'Street address' })
  street?: string;

  @ApiPropertyOptional({ description: 'City' })
  city?: string;

  @ApiPropertyOptional({ description: 'Postal code (4 digits)' })
  postalCode?: string;
}

/**
 * Communication preferences DTO
 */
export class CommunicationPreferencesDto {
  @ApiProperty({
    description: 'Invoice delivery method',
    enum: ['email', 'whatsapp', 'both'],
  })
  invoiceDelivery: 'email' | 'whatsapp' | 'both';

  @ApiProperty({ description: 'Receive payment reminders' })
  paymentReminders: boolean;

  @ApiProperty({ description: 'Receive email notifications' })
  emailNotifications: boolean;

  @ApiProperty({ description: 'Opted in for marketing communications' })
  marketingOptIn: boolean;

  @ApiProperty({
    description: 'Opted in for WhatsApp communications (POPIA consent)',
  })
  whatsappOptIn: boolean;

  @ApiPropertyOptional({
    description: 'WhatsApp consent timestamp (ISO string)',
  })
  whatsappConsentTimestamp: string | null;
}

/**
 * Parent profile response DTO
 */
export class ParentProfileDto {
  @ApiProperty({ description: 'Parent ID' })
  id: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiPropertyOptional({ description: 'Phone number (SA format)' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Alternative phone number' })
  alternativePhone?: string;

  @ApiPropertyOptional({ description: 'Address', type: ParentAddressDto })
  address?: ParentAddressDto;

  @ApiPropertyOptional({
    description: 'Communication preferences',
    type: CommunicationPreferencesDto,
  })
  communicationPreferences?: CommunicationPreferencesDto;

  @ApiProperty({ description: 'Account created date (ISO string)' })
  createdAt: string;
}

/**
 * Update parent profile request DTO
 */
export class UpdateParentProfileDto {
  @ApiPropertyOptional({ description: 'First name' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  lastName?: string;

  @ApiPropertyOptional({ description: 'Phone number (SA format)' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Alternative phone number' })
  alternativePhone?: string;

  @ApiPropertyOptional({ description: 'Address', type: ParentAddressDto })
  address?: ParentAddressDto;
}

/**
 * Update communication preferences request DTO
 */
export class UpdateCommunicationPreferencesDto {
  @ApiPropertyOptional({
    description: 'Invoice delivery method',
    enum: ['email', 'whatsapp', 'both'],
  })
  invoiceDelivery?: 'email' | 'whatsapp' | 'both';

  @ApiPropertyOptional({ description: 'Receive payment reminders' })
  paymentReminders?: boolean;

  @ApiPropertyOptional({ description: 'Receive email notifications' })
  emailNotifications?: boolean;

  @ApiPropertyOptional({ description: 'Opted in for marketing communications' })
  marketingOptIn?: boolean;

  @ApiPropertyOptional({ description: 'Opted in for WhatsApp communications' })
  whatsappOptIn?: boolean;

  @ApiPropertyOptional({
    description: 'WhatsApp consent timestamp (ISO string, set automatically)',
  })
  whatsappConsentTimestamp?: string | null;
}

/**
 * Child details for parent portal
 */
export class ParentChildDto {
  @ApiProperty({ description: 'Child ID' })
  id: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO string)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Enrollment date (ISO string)' })
  enrollmentDate?: string;

  @ApiPropertyOptional({ description: 'Class/group name' })
  className?: string;

  @ApiPropertyOptional({
    description: 'Attendance type',
    enum: ['full_day', 'half_day', 'after_care'],
  })
  attendanceType?: 'full_day' | 'half_day' | 'after_care';

  @ApiProperty({ description: 'Whether child enrollment is active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Photo URL' })
  photoUrl?: string | null;
}

/**
 * Children list response DTO
 */
export class ParentChildrenListDto {
  @ApiProperty({
    description: 'List of enrolled children',
    type: [ParentChildDto],
  })
  children: ParentChildDto[];
}

/**
 * Delete account request DTO
 */
export class DeleteAccountRequestDto {
  @ApiPropertyOptional({ description: 'Reason for deletion request' })
  reason?: string;
}

/**
 * Delete account response DTO
 */
export class DeleteAccountResponseDto {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'Request ID for tracking' })
  requestId: string;
}
