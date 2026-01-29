/**
 * CrecheBooks MCP Mutation Tools - Barrel Export
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 */

export { allocatePayment } from './allocate-payment';
export { generateInvoices } from './generate-invoices';
export { matchPayments } from './match-payments';
export { sendInvoices } from './send-invoices';

// New domain operation tools
export * from './parent-operations';
export * from './child-operations';
export * from './sars-operations';
export * from './tenant-operations';
export * from './staff-operations';
export * from './banking-operations';
export * from './transaction-operations';
export * from './communication-operations';

// Export types
export type {
  MatchPaymentsInput,
  MatchPaymentsOutput,
  PaymentMatchResult,
  AllocatePaymentInput,
  AllocatePaymentOutput,
  GenerateInvoicesInput,
  GenerateInvoicesOutput,
  GeneratedInvoiceSummary,
  InvoiceGenerationError,
  SendInvoicesInput,
  SendInvoicesOutput,
  InvoiceSendResult,
} from '../../types/mutations';
