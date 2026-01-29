/**
 * CrecheBooks MCP Mutation Type Definitions
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Input/output types for write operations (mutations).
 * All monetary values are in cents (integers).
 * All tools enforce tenant isolation via tenantId.
 */

// ============================================
// Payment Mutation Types
// ============================================

/** Input for match_payments tool */
export interface MatchPaymentsInput {
  tenantId: string;
  dryRun?: boolean;
  minConfidence?: number;
  maxMatches?: number;
}

/** Output for match_payments tool */
export interface MatchPaymentsOutput {
  matches: PaymentMatchResult[];
  autoApplied: number;
  pendingReview: number;
  totalProcessed: number;
}

/** Individual payment match result */
export interface PaymentMatchResult {
  transactionId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  confidence: number;
  action: 'AUTO_APPLY' | 'REVIEW_REQUIRED' | 'NO_MATCH';
  reasoning: string;
  applied: boolean;
}

/** Input for allocate_payment tool */
export interface AllocatePaymentInput {
  tenantId: string;
  transactionId: string;
  invoiceId: string;
  amountCents?: number;
  userId?: string;
}

/** Output for allocate_payment tool */
export interface AllocatePaymentOutput {
  paymentId: string;
  transactionId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountAllocatedCents: number;
  remainingUnallocatedCents: number;
  invoiceStatus: string;
}

// ============================================
// Invoice Mutation Types
// ============================================

/** Input for generate_invoices tool */
export interface GenerateInvoicesInput {
  tenantId: string;
  billingMonth: string;
  childIds?: string[];
  userId?: string;
  dryRun?: boolean;
}

/** Output for generate_invoices tool */
export interface GenerateInvoicesOutput {
  invoicesCreated: number;
  totalAmountCents: number;
  invoices: GeneratedInvoiceSummary[];
  errors: InvoiceGenerationError[];
}

/** Summary of a generated invoice */
export interface GeneratedInvoiceSummary {
  id: string;
  invoiceNumber: string;
  parentName: string;
  childName: string;
  totalCents: number;
  status: string;
}

/** Error during invoice generation */
export interface InvoiceGenerationError {
  childId: string;
  reason: string;
  code: string;
}

/** Input for send_invoices tool */
export interface SendInvoicesInput {
  tenantId: string;
  invoiceIds?: string[];
  sendAll?: boolean;
  statusFilter?: string;
  method?: 'email' | 'whatsapp' | 'both';
  userId?: string;
}

/** Output for send_invoices tool */
export interface SendInvoicesOutput {
  sentCount: number;
  failedCount: number;
  results: InvoiceSendResult[];
}

/** Individual invoice send result */
export interface InvoiceSendResult {
  invoiceId: string;
  invoiceNumber: string;
  success: boolean;
  method: string;
  error?: string;
}
