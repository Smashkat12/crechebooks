/**
 * Accounting Provider Types
 *
 * Provider-agnostic type definitions for the accounting integration
 * abstraction layer. These types are used by all accounting provider
 * implementations (Xero, Stub.africa, etc.).
 *
 * CRITICAL: All monetary values are in ZAR cents (integers).
 * CRITICAL: All operations must be scoped to tenantId.
 */

// ---------------------------------------------------------------------------
// Provider Capabilities
// ---------------------------------------------------------------------------

/**
 * Declares which optional capabilities a provider supports.
 * Consumers should check these flags before calling optional methods.
 */
export interface ProviderCapabilities {
  /** Whether the provider supports bank feed transaction import */
  bankFeeds: boolean;
  /** Whether the provider supports manual journal posting */
  journals: boolean;
  /** Whether the provider supports bulk invoice push */
  bulkInvoicePush: boolean;
  /** Whether the provider supports pulling invoices from the external system */
  invoicePull: boolean;
  /** Whether the provider supports chart of accounts retrieval */
  chartOfAccounts: boolean;
  /** Whether the provider supports bidirectional sync orchestration */
  syncOrchestration: boolean;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** Status of the connection between a tenant and the accounting provider. */
export interface ConnectionStatus {
  /** Whether the tenant is currently connected to the provider */
  isConnected: boolean;
  /** Provider identifier (e.g. 'xero', 'stub') */
  providerName: string;
  /** Human-readable name of the connected organization */
  organizationName?: string;
  /** When the connection was first established */
  connectedAt?: Date;
  /** Timestamp of the last sync attempt */
  lastSyncAt?: Date;
  /** Outcome of the last sync */
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  /** Error message if last sync failed */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Invoices (amounts in cents)
// ---------------------------------------------------------------------------

/** Options for pushing an invoice to the external provider. */
export interface PushInvoiceOptions {
  /** Force push even if the invoice has already been synced */
  force?: boolean;
}

/** Result of pushing a single invoice. */
export interface InvoiceSyncResult {
  /** CrecheBooks internal invoice ID */
  invoiceId: string;
  /** Provider-assigned invoice ID */
  externalInvoiceId: string;
  /** Provider-assigned invoice number (human-readable) */
  externalInvoiceNumber?: string;
  /** Status of the invoice in the external system */
  externalStatus: string;
  /** When the sync occurred */
  syncedAt: Date;
}

/** Result of pushing multiple invoices in bulk. */
export interface BulkInvoiceSyncResult {
  /** Number of invoices successfully pushed */
  pushed: number;
  /** Number of invoices that failed */
  failed: number;
  /** Number of invoices skipped (e.g. already synced) */
  skipped: number;
  /** Detailed results for each successfully pushed invoice */
  results: InvoiceSyncResult[];
  /** Errors for each failed invoice */
  errors: SyncItemError[];
}

/** Filters for pulling invoices from the external provider. */
export interface InvoicePullFilters {
  /** Pull invoices modified after this ISO 8601 date string */
  since?: string;
  /** Maximum number of invoices to return */
  limit?: number;
  /** Page number for pagination (1-indexed) */
  page?: number;
  /** Filter by external invoice status */
  status?: string;
}

/** A single invoice pulled from the external provider. */
export interface PulledInvoice {
  /** Provider-assigned invoice ID */
  externalInvoiceId: string;
  /** Matched CrecheBooks invoice ID, if any */
  internalInvoiceId?: string;
  /** Invoice number as shown in the external system */
  invoiceNumber: string;
  /** Contact/customer name */
  contactName: string;
  /** Contact email address */
  contactEmail?: string;
  /** Invoice date (ISO 8601 date string) */
  date: string;
  /** Due date (ISO 8601 date string) */
  dueDate: string;
  /** Total amount in ZAR cents */
  totalCents: number;
  /** Amount already paid in ZAR cents */
  amountPaidCents: number;
  /** Invoice status in the external system */
  status: string;
  /** Whether this invoice was imported into CrecheBooks */
  imported: boolean;
  /** Reason the invoice was not imported, if applicable */
  importReason?: string;
}

/** Result of pulling invoices from the external provider. */
export interface PulledInvoicesResult {
  /** Total invoices found in the external system */
  totalFound: number;
  /** Number of invoices newly imported */
  imported: number;
  /** Number of existing mappings updated */
  updated: number;
  /** Number of invoices skipped */
  skipped: number;
  /** Details for each invoice found */
  invoices: PulledInvoice[];
  /** Errors encountered during pull */
  errors: SyncItemError[];
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/** Result of syncing a single parent to an external contact. */
export interface ContactSyncResult {
  /** CrecheBooks parent ID */
  parentId: string;
  /** Provider-assigned contact ID */
  externalContactId: string;
  /** Contact name in the external system */
  externalContactName: string;
  /** True if a new contact was created; false if matched to existing */
  wasCreated: boolean;
  /** When the sync occurred */
  syncedAt: Date;
}

/** Result of syncing multiple parents to external contacts. */
export interface BulkContactSyncResult {
  /** Number of contacts successfully synced */
  synced: number;
  /** Number of contacts that failed to sync */
  failed: number;
  /** Number of contacts skipped (already synced) */
  skipped: number;
  /** Detailed results per synced contact */
  results: ContactSyncResult[];
  /** Errors per failed contact */
  errors: SyncItemError[];
}

// ---------------------------------------------------------------------------
// Payments (amounts in cents)
// ---------------------------------------------------------------------------

/** Result of syncing a single payment. */
export interface PaymentSyncResult {
  /** CrecheBooks payment ID */
  paymentId: string;
  /** Provider-assigned payment ID */
  externalPaymentId: string;
  /** Provider-assigned invoice ID the payment applies to */
  externalInvoiceId: string;
  /** Payment amount in ZAR cents */
  amountCents: number;
  /** When the sync occurred */
  syncedAt: Date;
}

/** Result of pulling payments for an invoice from the external provider. */
export interface PulledPaymentsResult {
  /** Successfully pulled payments */
  payments: PaymentSyncResult[];
  /** Errors encountered during pull */
  errors: SyncItemError[];
}

// ---------------------------------------------------------------------------
// Bank Feeds
// ---------------------------------------------------------------------------

/** Options for syncing bank feed transactions. */
export interface BankSyncOptions {
  /** Pull transactions from this ISO 8601 date string */
  fromDate?: string;
  /** Include unreconciled bank statement lines */
  includeUnreconciled?: boolean;
}

/** Result of a bank feed sync operation. */
export interface BankSyncResult {
  /** Number of new transactions imported */
  transactionsImported: number;
  /** Number of existing transactions updated */
  transactionsUpdated: number;
  /** Errors encountered during sync */
  errors: SyncItemError[];
}

// ---------------------------------------------------------------------------
// Journals (amounts in cents)
// ---------------------------------------------------------------------------

/** A single line item in a journal entry. */
export interface JournalLineItem {
  /** Account code in the external system's chart of accounts */
  accountCode: string;
  /** Description for the line item */
  description: string;
  /** Debit amount in ZAR cents (mutually exclusive with creditCents) */
  debitCents?: number;
  /** Credit amount in ZAR cents (mutually exclusive with debitCents) */
  creditCents?: number;
  /** Tax type code (e.g. 'NONE', 'OUTPUT', 'INPUT') */
  taxType?: string;
}

/** A complete journal entry to be posted. */
export interface JournalEntry {
  /** External reference for the journal */
  reference: string;
  /** Narration/description for the journal */
  narration: string;
  /** Journal date (ISO 8601 date string, YYYY-MM-DD) */
  date: string;
  /** Line items -- total debits must equal total credits */
  lineItems: JournalLineItem[];
}

/** Result of posting a journal entry. */
export interface JournalPostResult {
  /** Provider-assigned journal ID */
  externalJournalId: string;
  /** Status of the journal in the external system */
  status: string;
  /** Total debits in ZAR cents */
  totalDebitsCents: number;
  /** Total credits in ZAR cents */
  totalCreditsCents: number;
  /** When the journal was posted */
  postedAt: Date;
}

// ---------------------------------------------------------------------------
// Chart of Accounts
// ---------------------------------------------------------------------------

/** A single account from the external chart of accounts. */
export interface AccountingAccount {
  /** Provider-assigned account ID */
  externalAccountId: string;
  /** Account code (e.g. '200', '400') */
  code: string;
  /** Human-readable account name */
  name: string;
  /** Account type (e.g. 'REVENUE', 'EXPENSE', 'BANK') */
  type: string;
  /** Whether the account is active or archived */
  status: 'ACTIVE' | 'ARCHIVED';
  /** Tax type associated with this account */
  taxType?: string;
}

// ---------------------------------------------------------------------------
// Sync Orchestration
// ---------------------------------------------------------------------------

/** Direction for a sync operation. */
export type SyncDirection = 'push' | 'pull' | 'bidirectional';

/** Entity types that can be included in a sync operation. */
export type SyncEntityType = 'invoices' | 'payments' | 'contacts';

/** Options for a sync orchestration run. */
export interface SyncOptions {
  /** Direction of the sync */
  direction: SyncDirection;
  /** Specific entity types to sync. If omitted, syncs all. */
  entities?: SyncEntityType[];
  /** Only sync records modified after this ISO 8601 date string */
  fromDate?: string;
  /** If true, perform a full historical sync */
  fullSync?: boolean;
}

/** Result of a sync orchestration run. */
export interface SyncResult {
  /** Unique job ID for tracking */
  jobId: string;
  /** Whether the overall sync succeeded */
  success: boolean;
  /** Count of entities synced, keyed by entity type */
  entitiesSynced: Record<string, number>;
  /** Errors encountered across all entity types */
  errors: SyncItemError[];
  /** When the sync completed */
  completedAt: Date;
}

// ---------------------------------------------------------------------------
// Common Error
// ---------------------------------------------------------------------------

/** Standardised error for a single entity that failed during sync. */
export interface SyncItemError {
  /** ID of the entity that failed */
  entityId: string;
  /** Human-readable error message */
  error: string;
  /** Machine-readable error code */
  code: string;
}
