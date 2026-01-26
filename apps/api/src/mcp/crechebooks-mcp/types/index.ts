/**
 * CrecheBooks MCP Type Definitions
 * TASK-SDK-002: CrecheBooks In-Process MCP Server (Data Access Tools)
 *
 * All monetary values are in cents (integers).
 * All tools enforce tenant isolation via tenantId.
 */

// ============================================
// Shared Enums (mirrors Prisma enums)
// ============================================

export type TransactionStatus =
  | 'PENDING'
  | 'CATEGORIZED'
  | 'REVIEW_REQUIRED'
  | 'SYNCED';

export type CategorizationSource =
  | 'AI_AUTO'
  | 'AI_SUGGESTED'
  | 'USER_OVERRIDE'
  | 'RULE_BASED';

export type VatType = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';

export type ImportSource = 'BANK_FEED' | 'CSV_IMPORT' | 'PDF_IMPORT' | 'MANUAL';

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';

export type ReportType =
  | 'INCOME_EXPENSE'
  | 'VAT_SUMMARY'
  | 'MONTHLY_TOTALS'
  | 'ACCOUNT_BREAKDOWN';

// ============================================
// Tool Input Types
// ============================================

/** Input for get_patterns tool */
export interface GetPatternsInput {
  tenantId: string;
  payeeName?: string;
  minConfidence?: number;
  limit?: number;
}

/** Input for get_history tool */
export interface GetHistoryInput {
  tenantId: string;
  accountCode?: string;
  payeeName?: string;
  fromDate?: string; // ISO date string
  toDate?: string; // ISO date string
  source?: CategorizationSource;
  limit?: number;
}

/** Input for get_invoices tool */
export interface GetInvoicesInput {
  tenantId: string;
  status?: InvoiceStatus;
  fromDate?: string; // ISO date string
  toDate?: string; // ISO date string
  parentId?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  limit?: number;
}

/** Input for query_transactions tool */
export interface QueryTransactionsInput {
  tenantId: string;
  fromDate?: string; // ISO date string
  toDate?: string; // ISO date string
  status?: TransactionStatus;
  isCredit?: boolean;
  payeeName?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
  limit?: number;
}

/** Input for get_reports tool */
export interface GetReportsInput {
  tenantId: string;
  reportType: ReportType;
  fromDate: string; // ISO date string
  toDate: string; // ISO date string
}

/** Input for search_similar_transactions tool */
export interface SearchSimilarTransactionsInput {
  tenantId: string;
  description: string;
  minSimilarity?: number;
  limit?: number;
}

// ============================================
// Tool Output Types
// ============================================

/** Output record for get_patterns */
export interface PatternRecord {
  id: string;
  payeePattern: string;
  payeeAliases: unknown;
  defaultAccountCode: string;
  defaultAccountName: string;
  confidenceBoost: number;
  matchCount: number;
  isRecurring: boolean;
  expectedAmountCents: number | null;
}

/** Output record for get_history */
export interface HistoryRecord {
  id: string;
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  source: CategorizationSource;
  vatType: VatType;
  transactionDescription: string;
  transactionPayeeName: string | null;
  transactionAmountCents: number;
  transactionIsCredit: boolean;
  createdAt: string; // ISO date string
}

/** Output record for get_invoices */
export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  parentName: string;
  issueDate: string; // ISO date string
  dueDate: string; // ISO date string
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  amountPaidCents: number;
  outstandingCents: number;
  status: InvoiceStatus;
  pdfUrl: string | null;
  lines: InvoiceLineRecord[];
}

/** Output record for invoice lines */
export interface InvoiceLineRecord {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  lineType: string;
  accountCode: string | null;
  sortOrder: number;
}

/** Output record for query_transactions */
export interface TransactionRecord {
  id: string;
  date: string; // ISO date string
  description: string;
  payeeName: string | null;
  amountCents: number;
  isCredit: boolean;
  status: TransactionStatus;
  source: ImportSource;
  isReconciled: boolean;
  xeroAccountCode: string | null;
  latestCategorization: LatestCategorization | null;
}

/** Nested categorization summary in transaction output */
export interface LatestCategorization {
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  vatType: VatType;
  source: CategorizationSource;
}

/** Output for get_reports: INCOME_EXPENSE */
export interface IncomeExpenseReport {
  reportType: 'INCOME_EXPENSE';
  period: { from: string; to: string };
  totalIncomeCents: number;
  totalExpenseCents: number;
  netCents: number;
  transactionCount: number;
}

/** Output for get_reports: VAT_SUMMARY */
export interface VatSummaryReport {
  reportType: 'VAT_SUMMARY';
  period: { from: string; to: string };
  groups: VatGroupRecord[];
  totalVatCents: number;
}

/** VAT group breakdown */
export interface VatGroupRecord {
  vatType: VatType;
  transactionCount: number;
  totalAmountCents: number;
  totalVatCents: number;
}

/** Output for get_reports: MONTHLY_TOTALS */
export interface MonthlyTotalsReport {
  reportType: 'MONTHLY_TOTALS';
  period: { from: string; to: string };
  months: MonthlyTotalRecord[];
}

/** Monthly total record */
export interface MonthlyTotalRecord {
  month: string; // YYYY-MM
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  transactionCount: number;
}

/** Output for get_reports: ACCOUNT_BREAKDOWN */
export interface AccountBreakdownReport {
  reportType: 'ACCOUNT_BREAKDOWN';
  period: { from: string; to: string };
  accounts: AccountBreakdownRecord[];
}

/** Account breakdown record */
export interface AccountBreakdownRecord {
  accountCode: string;
  accountName: string;
  totalCreditCents: number;
  totalDebitCents: number;
  netCents: number;
  transactionCount: number;
}

/** Union of all report types */
export type ReportOutput =
  | IncomeExpenseReport
  | VatSummaryReport
  | MonthlyTotalsReport
  | AccountBreakdownReport;

/** Output record for search_similar_transactions */
export interface SimilarTransactionRecord {
  id: string;
  date: string;
  description: string;
  payeeName: string | null;
  amountCents: number;
  isCredit: boolean;
  similarityScore: number;
}

// ============================================
// MCP Tool Definition Types
// ============================================

/** JSON Schema property definition */
export interface JsonSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

/** JSON Schema for tool input */
export interface McpInputSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
}

/** MCP tool definition returned by factory functions */
export interface McpToolDefinition<
  TInput = Record<string, unknown>,
  TOutput = unknown,
> {
  name: string;
  description: string;
  inputSchema: McpInputSchema;
  handler: (args: TInput) => Promise<TOutput>;
}

/** Standard MCP tool result wrapper */
export interface McpToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    toolName: string;
    executionMs: number;
    tenantId: string;
    resultCount?: number;
  };
}
