/**
 * CrecheBooks CLI Type Definitions
 */

// ============================================
// Configuration Types
// ============================================

export interface Credentials {
  apiKey: string;
  tenantId: string;
  baseUrl?: string;
}

export interface CredentialsFile {
  default?: Credentials;
  profiles?: Record<string, Credentials>;
  activeProfile?: string;
}

export interface CLIConfig {
  credentials: Credentials | null;
  profile: string;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ============================================
// Domain Types (mirrors API)
// ============================================

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';

export interface Invoice {
  id: string;
  invoice_number: string;
  parent_name: string;
  parent_email: string;
  issue_date: string;
  due_date: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  outstanding_cents: number;
  status: InvoiceStatus;
  pdf_url: string | null;
  lines: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  line_type: string;
}

export interface Payment {
  id: string;
  amount_cents: number;
  payment_date: string;
  reference: string;
  source: string;
  allocated_cents: number;
  unallocated_cents: number;
  allocations: PaymentAllocation[];
}

export interface PaymentAllocation {
  id: string;
  invoice_id: string;
  invoice_number: string;
  amount_cents: number;
  allocated_at: string;
}

export interface PaymentMatch {
  payment_id: string;
  invoice_id: string;
  invoice_number: string;
  confidence: number;
  match_reason: string;
  amount_cents: number;
}

// ============================================
// Command Input Types
// ============================================

export interface ListInvoicesOptions {
  status?: InvoiceStatus;
  from?: string;
  to?: string;
  parentId?: string;
  limit?: number;
  page?: number;
}

export interface GenerateInvoicesOptions {
  month: string;
  childIds?: string[];
  dryRun?: boolean;
}

export interface SendInvoicesOptions {
  ids?: string[];
  all?: boolean;
  status?: InvoiceStatus;
  method?: 'email' | 'whatsapp' | 'both';
}

export interface ListPaymentsOptions {
  unallocated?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
}

export interface MatchPaymentsOptions {
  dryRun?: boolean;
  minConfidence?: number;
}

export interface AllocatePaymentOptions {
  paymentId: string;
  invoiceId: string;
  amountCents?: number;
}

// ============================================
// Tenant Types
// ============================================

export interface Tenant {
  id: string;
  name: string;
  trading_name?: string;
  registration_number?: string;
  vat_number?: string;
  tax_status: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  province: string;
  postal_code: string;
  phone: string;
  email: string;
  invoice_day_of_month: number;
  invoice_due_days: number;
  subscription_status: string;
  subscription_plan: string;
  bank_name?: string;
  bank_account_holder?: string;
  bank_account_number?: string;
  bank_branch_code?: string;
  xero_connected_at?: string;
  xero_tenant_name?: string;
}

export interface OnboardingStatus {
  tasks: OnboardingTask[];
  next_step?: string;
}

export interface OnboardingTask {
  id: string;
  name: string;
  completed: boolean;
  action?: string;
}

// ============================================
// Parent Types
// ============================================

export interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  preferredContact: string;
  idNumber?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  childrenCount?: number;
  children?: ParentChild[];
}

export interface ParentChild {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  isActive: boolean;
  enrollmentStatus?: string;
}

export interface ListParentsOptions {
  search?: string;
  isActive?: boolean;
  limit?: number;
  page?: number;
}

export interface ParentInviteResult {
  sent: boolean;
  email?: string;
  invite_link?: string;
  already_sent?: boolean;
  error?: string;
}

// ============================================
// Child Types
// ============================================

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  medicalNotes?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  isActive: boolean;
  parentId: string;
  parentName?: string;
  parent?: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
  enrollment?: ChildEnrollment;
  enrollmentStatus?: string;
}

export interface ChildEnrollment {
  id: string;
  status: string;
  feeStructureId: string;
  feeStructureName: string;
  feeAmountCents: number;
  startDate: string;
  endDate?: string;
  siblingDiscountApplied: boolean;
  customFeeOverrideCents?: number;
}

export interface ListChildrenOptions {
  parentId?: string;
  enrolled?: boolean;
  isActive?: boolean;
  limit?: number;
  page?: number;
}

// ============================================
// Fee Structure Types
// ============================================

export interface FeeStructure {
  id: string;
  name: string;
  description?: string;
  fee_type: string;
  amount_cents: number;
  registration_fee_cents: number;
  vat_inclusive: boolean;
  sibling_discount_percent?: number;
  is_active: boolean;
}

export interface ListFeeStructuresOptions {
  active?: boolean;
  limit?: number;
}

// ============================================
// Enrollment Types
// ============================================

export interface Enrollment {
  id: string;
  childId: string;
  feeStructureId: string;
  feeStructureName: string;
  feeAmountCents: number;
  startDate: string;
  endDate?: string;
  status: string;
  siblingDiscountApplied: boolean;
  customFeeOverrideCents?: number;
  notes?: string;
}

// ============================================
// Staff Types
// ============================================

export type EmploymentType = 'PERMANENT' | 'CONTRACT' | 'CASUAL';
export type PayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type StaffOnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type DocumentType =
  | 'ID_DOCUMENT'
  | 'CONTRACT'
  | 'QUALIFICATION'
  | 'POLICE_CLEARANCE'
  | 'MEDICAL'
  | 'TAX'
  | 'OTHER';
export type DocumentVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export interface Staff {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  id_number: string | null;
  date_of_birth: string | null;
  employment_type: EmploymentType;
  pay_frequency: PayFrequency;
  basic_salary_cents: number;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  is_active: boolean;
  onboarding_status: StaffOnboardingStatus;
  created_at: string;
}

export interface ListStaffOptions {
  search?: string;
  employmentType?: EmploymentType;
  active?: boolean;
  limit?: number;
  page?: number;
}

export interface CreateStaffOptions {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  idNumber?: string;
  dateOfBirth?: string;
  startDate?: string;
  employmentType: EmploymentType;
  payFrequency?: PayFrequency;
  basicSalaryCents: number;
}

export interface UpdateStaffOptions {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  employmentType?: EmploymentType;
  payFrequency?: PayFrequency;
  basicSalaryCents?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
}

// Staff Onboarding Types
export interface StaffOnboardingStep {
  id: string;
  name: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
}

export interface StaffOnboardingStatusResponse {
  staff_id: string;
  staff_name: string;
  employee_number: string;
  status: StaffOnboardingStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_steps: number;
  total_steps: number;
  steps: StaffOnboardingStep[];
}

// Leave Types
export interface LeaveType {
  code: string;
  name: string;
  annual_days: number;
  is_paid: boolean;
  can_carry_over: boolean;
}

export interface LeaveBalance {
  leave_type_code: string;
  leave_type_name: string;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  available_days: number;
}

export interface LeaveBalanceResponse {
  staff_id: string;
  staff_name: string;
  employee_number: string;
  year: string;
  balances: LeaveBalance[];
}

export interface LeaveRequest {
  id: string;
  leave_type_code: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days: number;
  status: LeaveRequestStatus;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface LeaveHistoryResponse {
  staff_id: string;
  staff_name: string;
  requests: LeaveRequest[];
}

// Document Types
export interface StaffDocument {
  id: string;
  type: DocumentType;
  name: string;
  file_name: string;
  verification_status: DocumentVerificationStatus;
  uploaded_at: string;
  verified_at: string | null;
  expires_at: string | null;
  requires_verification: boolean;
}

export interface StaffDocumentsResponse {
  staff_id: string;
  staff_name: string;
  documents: StaffDocument[];
}

export interface PendingDocument {
  id: string;
  staff_id: string;
  staff_name: string;
  type: DocumentType;
  name: string;
  uploaded_at: string;
}

export interface PendingDocumentsResponse {
  documents: PendingDocument[];
}

// ============================================
// Output Types
// ============================================

export type OutputFormat = 'json' | 'table' | 'csv';

export interface GlobalOptions {
  tenant?: string;
  format?: OutputFormat;
  quiet?: boolean;
  verbose?: boolean;
}

// ============================================
// Error Types
// ============================================

export enum CLIErrorCode {
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  TENANT_REQUIRED = 'TENANT_REQUIRED',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

export class CLIError extends Error {
  constructor(
    public code: CLIErrorCode,
    message: string,
    public suggestion?: string,
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

// ============================================
// Banking Types
// ============================================

export interface BankAccount {
  id: string;
  bank_name: string;
  bank_code: string;
  account_name: string;
  account_number_masked: string;
  account_type: string;
  current_balance_cents: number;
  available_balance_cents: number;
  currency: string;
  is_active: boolean;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface AccountSummary {
  total_accounts: number;
  active_accounts: number;
  total_balance_cents: number;
  pending_transactions: number;
  last_sync_at: string | null;
  accounts_by_bank?: Record<string, number>;
}

export interface BankLinkResponse {
  authorization_url: string;
  state: string;
  expires_at: string;
}

export interface BankSyncResult {
  transactions_imported: number;
  transactions_updated: number;
  sync_duration_ms: number;
}

export interface AccountBalance {
  account_id: string;
  account_name: string;
  current_balance_cents: number;
  available_balance_cents: number;
  pending_balance_cents: number;
  balance_at: string;
  currency: string;
}

export interface ConsentStatusResponse {
  accounts: Array<{
    id: string;
    bank_name: string;
    bank_code: string;
    account_name: string;
    consent_expires_at: string;
    is_expired: boolean;
  }>;
  total_expiring: number;
  total_expired: number;
}

export interface InitiateBankLinkOptions {
  bankCode?: string;
  redirectUrl?: string;
}

export interface SyncBankAccountOptions {
  fromDate?: string;
  toDate?: string;
}

export interface ConsentStatusOptions {
  expiringWithinDays?: number;
}

// ============================================
// Transaction Types
// ============================================

export type TransactionStatus = 'PENDING' | 'CATEGORIZED' | 'RECONCILED';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  payee_name: string | null;
  reference: string | null;
  amount_cents: number;
  is_credit: boolean;
  status: TransactionStatus;
  is_reconciled: boolean;
  bank_account_id: string;
  bank_account_name: string;
  category_code: string | null;
  category_name: string | null;
  categorizations: TransactionCategorization[];
  created_at: string;
  updated_at: string;
}

export interface TransactionCategorization {
  id: string;
  category_code: string;
  category_name: string;
  confidence: number;
  source: 'AI' | 'MANUAL' | 'RULE';
  created_at: string;
}

export interface ListTransactionsOptions {
  status?: TransactionStatus;
  from?: string;
  to?: string;
  isReconciled?: boolean;
  accountId?: string;
  categoryCode?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  isCredit?: boolean;
  limit?: number;
  page?: number;
}

export interface ImportTransactionsOptions {
  file: string;
  fileName: string;
  format: string;
  accountId?: string;
  dryRun?: boolean;
  skipDuplicates?: boolean;
}

export interface ImportTransactionsResult {
  imported: number;
  duplicates: number;
  errors: number;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount_cents: number;
    is_credit: boolean;
  }>;
}

export interface ExportTransactionsOptions {
  from?: string;
  to?: string;
  status?: TransactionStatus;
  accountId?: string;
}

export interface CategorizationSuggestion {
  category_code: string;
  category_name: string;
  confidence: number;
  reasoning: string;
  similar_transactions?: number;
}

export interface BatchCategorizeOptions {
  minConfidence: number;
  dryRun?: boolean;
}

export interface BatchCategorizeResult {
  total_processed: number;
  auto_categorized: number;
  needs_review: number;
  categories_used: Record<string, number>;
}

export interface SplitTransactionOptions {
  parts: Array<{
    amount_cents: number;
    category_code: string;
    description?: string;
  }>;
}

export interface SplitTransactionResult {
  id: string;
  original_transaction_id: string;
  parts: Array<{
    id: string;
    amount_cents: number;
    category_code: string;
    description: string | null;
  }>;
}

export interface CategorizeTransactionOptions {
  categoryCode: string;
}

// ============================================
// Reconciliation Types
// ============================================

export interface ReconciliationStatus {
  period: string;
  is_reconciled: boolean;
  has_discrepancies: boolean;
  bank_balance_cents: number;
  book_balance_cents: number;
  difference_cents: number;
  unreconciled_count: number;
  last_reconciled_at: string | null;
  breakdown?: {
    bank_deposits_cents: number;
    book_deposits_cents: number;
    bank_withdrawals_cents: number;
    book_withdrawals_cents: number;
  };
  outstanding_items?: Array<{
    type: string;
    count: number;
    total_cents: number;
  }>;
}

export interface ReconciliationStatusOptions {
  accountId?: string;
  month?: string;
}

export interface RunReconciliationOptions {
  accountId?: string;
  month?: string;
  statementBalanceCents?: number;
  dryRun?: boolean;
}

export interface ReconciliationResult {
  period: string;
  statement_balance_cents: number;
  calculated_balance_cents: number;
  difference_cents: number;
  items_reconciled: number;
  items_outstanding: number;
  adjustments?: Array<{
    type: string;
    amount_cents: number;
    description: string;
  }>;
}

export interface Discrepancy {
  id: string;
  discrepancy_type: string;
  amount_cents: number;
  description: string;
  is_resolved: boolean;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface DiscrepanciesOptions {
  accountId?: string;
  month?: string;
  includeResolved?: boolean;
  limit?: number;
}

export interface DiscrepanciesResponse {
  discrepancies: Discrepancy[];
  summary: {
    total_count: number;
    total_amount_cents: number;
    unresolved_count: number;
    by_type?: Record<string, number>;
    common_causes?: string[];
  };
}

export interface ResolveDiscrepancyOptions {
  action: string;
  note: string;
  matchToTransactionId?: string;
}

// ============================================
// SARS Compliance Types
// ============================================

export type SarsSubmissionType = 'VAT201' | 'EMP201' | 'EMP501';

export type SarsSubmissionStatus =
  | 'DRAFT'
  | 'READY'
  | 'SUBMITTED'
  | 'FINALIZED';

export interface SarsSubmission {
  id: string;
  submission_type: SarsSubmissionType;
  period_display: string;
  status: SarsSubmissionStatus;
  amount_due_cents: number;
  sars_reference: string | null;
  deadline: string | null;
  created_at: string;
  submitted_at: string | null;
}

export interface SarsDeadline {
  submission_type: SarsSubmissionType;
  period_display: string;
  deadline: string;
  submitted: boolean;
  submission_id: string | null;
}

export interface Vat201Return {
  id: string;
  status: SarsSubmissionStatus;
  period_start: string;
  period_end: string;
  output_vat_cents: number;
  input_vat_cents: number;
  net_vat_cents: number;
  is_payable: boolean;
  flagged_items_count: number;
  flagged_items: VatFlaggedItem[];
  created_at: string;
}

export interface VatFlaggedItem {
  transaction_id: string;
  description: string;
  amount_cents: number;
  vat_amount_cents: number;
  reason: string;
}

export interface Emp201Return {
  id: string;
  status: SarsSubmissionStatus;
  period_month: string;
  employee_count: number;
  total_gross_remuneration_cents: number;
  total_paye_cents: number;
  total_uif_cents: number;
  total_sdl_cents: number;
  total_due_cents: number;
  employees: Emp201Employee[];
  created_at: string;
}

export interface Emp201Employee {
  employee_id: string;
  id_number: string;
  name: string;
  gross_remuneration_cents: number;
  paye_cents: number;
  uif_cents: number;
  sdl_cents: number;
}

export interface Emp501Return {
  id: string;
  status: SarsSubmissionStatus;
  tax_year_start: string;
  tax_year_end: string;
  total_employee_count: number;
  total_gross_remuneration_cents: number;
  total_paye_declared_cents: number;
  total_paye_paid_cents: number;
  variance_cents: number;
  irp5_count: number;
  monthly_breakdown: Emp501MonthlyRecord[];
  created_at: string;
}

export interface Emp501MonthlyRecord {
  month: string;
  employee_count: number;
  gross_remuneration_cents: number;
  paye_declared_cents: number;
  paye_paid_cents: number;
  uif_cents: number;
  sdl_cents: number;
}

// SARS Command Input Types
export interface GenerateVat201Options {
  periodStart: string;
  periodEnd: string;
  dryRun?: boolean;
}

export interface GenerateEmp201Options {
  month: string;
  dryRun?: boolean;
}

export interface GenerateEmp501Options {
  taxYearStart: string;
  taxYearEnd: string;
  dryRun?: boolean;
}

export interface ListSarsSubmissionsOptions {
  type?: SarsSubmissionType;
  status?: SarsSubmissionStatus;
  taxYear?: string;
  limit?: number;
}

export interface GetSarsDeadlinesOptions {
  includeAll?: boolean;
}

export interface MarkSarsSubmittedOptions {
  submissionId: string;
  submissionType: SarsSubmissionType;
  sarsReference: string;
}

// ============================================
// API Key Types
// ============================================

export type ApiKeyScope =
  | 'READ_TENANTS'
  | 'READ_PARENTS'
  | 'READ_CHILDREN'
  | 'READ_STAFF'
  | 'READ_INVOICES'
  | 'READ_PAYMENTS'
  | 'READ_TRANSACTIONS'
  | 'READ_REPORTS'
  | 'WRITE_PARENTS'
  | 'WRITE_CHILDREN'
  | 'WRITE_STAFF'
  | 'WRITE_INVOICES'
  | 'WRITE_PAYMENTS'
  | 'WRITE_TRANSACTIONS'
  | 'MANAGE_USERS'
  | 'MANAGE_API_KEYS'
  | 'MANAGE_INTEGRATIONS'
  | 'FULL_ACCESS';

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  description: string | null;
  environment: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKeyInfo {
  /** Full API key - only returned on creation, never stored */
  secretKey: string;
}

export interface CreateApiKeyOptions {
  name: string;
  scopes: ApiKeyScope[];
  description?: string;
  environment?: string;
  expiresInDays?: number;
}

export interface ListApiKeysOptions {
  includeRevoked?: boolean;
}

export interface RotateApiKeyResult {
  newKey: ApiKeyWithSecret;
  revokedKeyId: string;
}
