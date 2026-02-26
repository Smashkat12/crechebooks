/**
 * AccountingProvider Interface
 *
 * Provider-agnostic contract that every accounting integration must implement.
 * Xero, Stub.africa, and any future providers all satisfy this interface.
 *
 * CRITICAL: All monetary values are in ZAR cents (integers).
 * CRITICAL: Every operation MUST be scoped to `tenantId`.
 *
 * Optional capabilities (bank feeds, journals) are expressed via boolean
 * flags and conditionally-present methods. Callers should check
 * `supportsBankFeeds` / `supportsJournals` before invoking the optional
 * methods.
 */

import type {
  AccountingAccount,
  BankSyncOptions,
  BankSyncResult,
  BulkContactSyncResult,
  BulkInvoiceSyncResult,
  ConnectionStatus,
  ContactSyncResult,
  InvoicePullFilters,
  InvoiceSyncResult,
  JournalEntry,
  JournalPostResult,
  PaymentSyncResult,
  ProviderCapabilities,
  PulledInvoicesResult,
  PulledPaymentsResult,
  PushInvoiceOptions,
  SyncOptions,
  SyncResult,
} from './accounting-types';

export interface AccountingProvider {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Short machine-readable name for the provider (e.g. 'xero', 'stub'). */
  readonly providerName: string;

  /** Declares which optional features this provider supports. */
  readonly capabilities: ProviderCapabilities;

  /** Whether the provider supports bank feed transaction import. */
  readonly supportsBankFeeds: boolean;

  /** Whether the provider supports manual journal posting. */
  readonly supportsJournals: boolean;

  // ---------------------------------------------------------------------------
  // Auth / Connection
  // ---------------------------------------------------------------------------

  /**
   * Generate the OAuth authorization URL to initiate a connection.
   *
   * @param tenantId - CrecheBooks tenant initiating the connection
   * @param returnUrl - URL to redirect back to after authorization
   * @returns Object containing the authorization URL
   */
  getAuthUrl(
    tenantId: string,
    returnUrl: string,
  ): Promise<{ authUrl: string }>;

  /**
   * Handle the OAuth callback after the user authorizes the connection.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param code - Authorization code from the OAuth callback
   * @param state - State parameter for CSRF protection
   */
  handleCallback(
    tenantId: string,
    code: string,
    state: string,
  ): Promise<void>;

  /**
   * Get the current connection status for a tenant.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @returns Current connection status
   */
  getConnectionStatus(tenantId: string): Promise<ConnectionStatus>;

  /**
   * Disconnect a tenant from the accounting provider.
   * Revokes tokens and clears stored credentials.
   *
   * @param tenantId - CrecheBooks tenant ID
   */
  disconnect(tenantId: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // Invoices
  // ---------------------------------------------------------------------------

  /**
   * Push a single invoice to the external accounting system.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param invoiceId - CrecheBooks invoice ID
   * @param options - Push options (e.g. force re-push)
   * @returns Sync result with external invoice details
   */
  pushInvoice(
    tenantId: string,
    invoiceId: string,
    options?: PushInvoiceOptions,
  ): Promise<InvoiceSyncResult>;

  /**
   * Push multiple invoices to the external accounting system.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param invoiceIds - Array of CrecheBooks invoice IDs
   * @param options - Push options (e.g. force re-push)
   * @returns Aggregated bulk sync result
   */
  pushInvoicesBulk(
    tenantId: string,
    invoiceIds: string[],
    options?: PushInvoiceOptions,
  ): Promise<BulkInvoiceSyncResult>;

  /**
   * Pull invoices from the external accounting system.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param filters - Optional filters (date range, pagination, status)
   * @returns Pulled invoices with import status
   */
  pullInvoices(
    tenantId: string,
    filters?: InvoicePullFilters,
  ): Promise<PulledInvoicesResult>;

  // ---------------------------------------------------------------------------
  // Contacts
  // ---------------------------------------------------------------------------

  /**
   * Sync a single CrecheBooks parent to an external contact.
   * Creates the contact if it does not exist; otherwise matches by email.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param parentId - CrecheBooks parent ID
   * @returns Contact sync result
   */
  syncContact(
    tenantId: string,
    parentId: string,
  ): Promise<ContactSyncResult>;

  /**
   * Sync multiple CrecheBooks parents to external contacts in bulk.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param parentIds - Array of CrecheBooks parent IDs
   * @returns Aggregated bulk contact sync result
   */
  syncContactsBulk(
    tenantId: string,
    parentIds: string[],
  ): Promise<BulkContactSyncResult>;

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  /**
   * Sync a single payment to the external accounting system.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param paymentId - CrecheBooks payment ID
   * @param invoiceRef - External invoice ID to apply the payment against
   * @returns Payment sync result
   */
  syncPayment(
    tenantId: string,
    paymentId: string,
    invoiceRef: string,
  ): Promise<PaymentSyncResult>;

  /**
   * Pull payments from the external system for a given invoice.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param invoiceRef - External invoice ID to pull payments for
   * @returns Pulled payments result
   */
  pullPayments(
    tenantId: string,
    invoiceRef: string,
  ): Promise<PulledPaymentsResult>;

  // ---------------------------------------------------------------------------
  // Bank Feeds (optional)
  // ---------------------------------------------------------------------------

  /**
   * Import bank feed transactions from the external system.
   * Only available when `supportsBankFeeds` is true.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param options - Bank sync options
   * @returns Bank sync result
   */
  syncBankTransactions?(
    tenantId: string,
    options?: BankSyncOptions,
  ): Promise<BankSyncResult>;

  // ---------------------------------------------------------------------------
  // Journals (optional)
  // ---------------------------------------------------------------------------

  /**
   * Post a manual journal entry to the external system.
   * Only available when `supportsJournals` is true.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param journal - Journal entry data (debits must equal credits)
   * @returns Journal post result
   */
  postJournal?(
    tenantId: string,
    journal: JournalEntry,
  ): Promise<JournalPostResult>;

  // ---------------------------------------------------------------------------
  // Chart of Accounts
  // ---------------------------------------------------------------------------

  /**
   * Retrieve the chart of accounts from the external system.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @returns Array of accounting accounts
   */
  getAccounts(tenantId: string): Promise<AccountingAccount[]>;

  // ---------------------------------------------------------------------------
  // Sync Orchestration
  // ---------------------------------------------------------------------------

  /**
   * Run a coordinated sync operation across multiple entity types.
   *
   * @param tenantId - CrecheBooks tenant ID
   * @param options - Sync options (direction, entities, date range)
   * @returns Aggregated sync result
   */
  sync(tenantId: string, options: SyncOptions): Promise<SyncResult>;
}
