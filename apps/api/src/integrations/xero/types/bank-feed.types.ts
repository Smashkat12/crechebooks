/**
 * Bank Feed Types
 * TASK-TRANS-016: Bank Feed Integration Service via Xero API
 *
 * Types for Xero bank feed integration including connections,
 * sync results, and webhook payloads.
 */

/**
 * Bank connection status
 */
export type BankConnectionStatus = 'active' | 'disconnected' | 'error';

/**
 * Represents a connected bank account via Xero
 */
export interface BankConnection {
  id: string;
  tenantId: string;
  xeroAccountId: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  connectedAt: Date;
  lastSyncAt: Date | null;
  status: BankConnectionStatus;
  errorMessage?: string;
}

/**
 * Result of a bank feed sync operation
 */
export interface BankSyncResult {
  connectionId: string;
  transactionsFound: number;
  transactionsCreated: number;
  duplicatesSkipped: number;
  errors: BankSyncError[];
  syncedAt: Date;
}

/**
 * Error during bank sync
 */
export interface BankSyncError {
  transactionId: string;
  error: string;
  code: string;
}

/**
 * Xero webhook event payload
 */
export interface XeroWebhookPayload {
  events: XeroWebhookEvent[];
  firstEventSequence: number;
  lastEventSequence: number;
  entropy: string;
}

/**
 * Individual Xero webhook event
 */
export interface XeroWebhookEvent {
  resourceUrl: string;
  resourceId: string;
  tenantId: string;
  tenantType: string;
  eventCategory: string;
  eventType: string;
  eventDateUtc: string;
}

/**
 * Xero bank transaction from API
 */
export interface XeroBankTransaction {
  bankTransactionID: string;
  bankAccount: {
    accountID: string;
    name: string;
    code: string;
  };
  type:
    | 'RECEIVE'
    | 'SPEND'
    | 'RECEIVE-OVERPAYMENT'
    | 'SPEND-OVERPAYMENT'
    | 'RECEIVE-PREPAYMENT'
    | 'SPEND-PREPAYMENT';
  contact?: {
    contactID: string;
    name: string;
  };
  date: string;
  status: 'AUTHORISED' | 'DELETED';
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    accountCode: string;
    taxType: string;
  }>;
  subTotal: number;
  totalTax: number;
  total: number;
  reference?: string;
  isReconciled: boolean;
  prepaymentID?: string;
  overpaymentID?: string;
  updatedDateUTC: string;
}

/**
 * Options for syncing transactions
 */
export interface BankSyncOptions {
  fromDate?: Date;
  toDate?: Date;
  connectionId?: string;
  forceFullSync?: boolean;
}

/**
 * Configuration for bank feed scheduler
 */
export interface BankFeedSchedulerConfig {
  cronExpression: string;
  tenantId: string;
  syncAllAccounts: boolean;
  specificConnectionIds?: string[];
}

/**
 * Webhook signature verification result
 */
export interface WebhookVerificationResult {
  isValid: boolean;
  error?: string;
}
