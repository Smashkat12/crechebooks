/**
 * Stitch API Types
 * TASK-INT-101: Bank API Integration (Open Banking)
 *
 * Type definitions for South African Open Banking via Stitch API.
 * Supports: FNB, Standard Bank, Nedbank, ABSA, Capitec
 *
 * @see https://stitch.money/docs
 */

// ============================================================================
// Supported Banks
// ============================================================================

/**
 * South African banks supported via Stitch API
 */
export type SupportedBank =
  | 'fnb'
  | 'standard_bank'
  | 'nedbank'
  | 'absa'
  | 'capitec';

export const SUPPORTED_BANKS: Record<SupportedBank, string> = {
  fnb: 'First National Bank',
  standard_bank: 'Standard Bank',
  nedbank: 'Nedbank',
  absa: 'ABSA',
  capitec: 'Capitec',
};

/**
 * Bank account types returned by Stitch
 */
export type BankAccountType =
  | 'cheque'
  | 'savings'
  | 'transmission'
  | 'current'
  | 'credit'
  | 'loan'
  | 'unknown';

// ============================================================================
// OAuth / Link Initiation
// ============================================================================

/**
 * Request to initiate bank account linking
 */
export interface LinkInitRequest {
  /** Tenant ID for tracking */
  tenantId: string;
  /** OAuth redirect URI after bank consent (optional, uses default) */
  redirectUri?: string;
  /** User-provided reference for audit */
  userReference?: string;
  /** Scope of data access requested */
  scopes?: StitchScope[];
}

/**
 * Response from link initialization
 */
export interface LinkInitResponse {
  /** URL to redirect user to for bank consent */
  linkUrl: string;
  /** State parameter for CSRF protection */
  state: string;
  /** Link session ID */
  linkId: string;
  /** Expiry time for link session */
  expiresAt: Date;
}

/**
 * Stitch OAuth scopes
 */
export type StitchScope =
  | 'accounts'
  | 'balances'
  | 'transactions'
  | 'identity'
  | 'offline_access';

/**
 * Default scopes for bank linking
 */
export const DEFAULT_SCOPES: StitchScope[] = [
  'accounts',
  'balances',
  'transactions',
  'offline_access',
];

// ============================================================================
// OAuth Token Management
// ============================================================================

/**
 * OAuth token exchange request
 */
export interface TokenExchangeRequest {
  /** Authorization code from callback */
  code: string;
  /** Redirect URI used in link initiation */
  redirectUri: string;
  /** Grant type - authorization_code for initial, refresh_token for refresh */
  grantType: 'authorization_code' | 'refresh_token';
  /** Refresh token (for refresh_token grant) */
  refreshToken?: string;
}

/**
 * OAuth token response from Stitch
 */
export interface TokenResponse {
  /** Access token for API calls */
  accessToken: string;
  /** Refresh token for getting new access tokens */
  refreshToken: string;
  /** Token type (always "Bearer") */
  tokenType: 'Bearer';
  /** Access token expiry in seconds */
  expiresIn: number;
  /** Scopes granted */
  scope: string;
  /** Consent expiry (90 days from grant for regulatory compliance) */
  consentExpiresAt?: Date;
}

/**
 * Internal representation of encrypted tokens
 */
export interface EncryptedTokens {
  /** AES-256-GCM encrypted access token */
  accessToken: string;
  /** AES-256-GCM encrypted refresh token */
  refreshToken: string;
  /** Access token expiry timestamp */
  tokenExpiresAt: Date;
  /** Consent expiry (90 days) */
  consentExpiresAt: Date;
  /** When consent was granted */
  consentGrantedAt: Date;
}

// ============================================================================
// Bank Account Types
// ============================================================================

/**
 * Bank account information from Stitch
 */
export interface StitchAccount {
  /** Stitch account ID */
  id: string;
  /** Bank identifier */
  bankId: SupportedBank;
  /** Account holder name */
  accountHolderName: string;
  /** Full account number (only available during linking) */
  accountNumber: string;
  /** Masked account number (stored in DB) */
  accountNumberMasked: string;
  /** Account type */
  accountType: BankAccountType;
  /** Currency code (ZAR) */
  currency: string;
  /** Current balance in cents */
  currentBalanceCents: number;
  /** Available balance in cents */
  availableBalanceCents: number;
  /** Account status */
  status: 'active' | 'inactive' | 'closed';
  /** Bank branch code */
  branchCode?: string;
  /** SWIFT/BIC code */
  swiftCode?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Linked account response for API consumers
 */
export interface LinkedAccount {
  /** Internal linked account ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Bank display name */
  bankName: string;
  /** Masked account number (last 4 digits) */
  accountNumberMasked: string;
  /** Account type display */
  accountType: string;
  /** Account holder name */
  accountHolderName: string | null;
  /** Link status */
  status: LinkedAccountStatus;
  /** When account was linked */
  linkedAt: Date;
  /** Last successful sync */
  lastSyncedAt: Date | null;
  /** Next sync estimated */
  nextSyncAt: Date | null;
  /** Consent expiry date */
  consentExpiresAt: Date;
  /** Days until consent expires */
  consentDaysRemaining: number;
  /** Whether consent renewal is needed */
  requiresRenewal: boolean;
  /** Current balance (if available) */
  currentBalanceCents?: number;
  /** Last sync error message (if any) */
  lastSyncError?: string;
}

/**
 * Linked account status values
 */
export type LinkedAccountStatus =
  | 'pending'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'error';

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Bank transaction from Stitch API
 */
export interface StitchTransaction {
  /** Stitch transaction ID */
  id: string;
  /** Account ID */
  accountId: string;
  /** Transaction amount in cents (negative for debits) */
  amountCents: number;
  /** Currency (ZAR) */
  currency: string;
  /** Transaction date */
  date: Date;
  /** Transaction description from bank */
  description: string;
  /** Transaction reference */
  reference: string;
  /** Transaction type */
  type: TransactionType;
  /** Running balance after transaction */
  runningBalanceCents?: number;
  /** Counterparty details */
  counterparty?: {
    name?: string;
    accountNumber?: string;
    bankId?: string;
  };
  /** Bank-specific category */
  category?: string;
  /** Transaction status */
  status: 'posted' | 'pending';
  /** Original transaction metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Transaction type enumeration
 */
export type TransactionType =
  | 'debit'
  | 'credit'
  | 'transfer'
  | 'fee'
  | 'interest'
  | 'reversal'
  | 'other';

/**
 * Normalized transaction for internal use
 */
export interface BankTransaction {
  /** Stitch transaction ID */
  externalId: string;
  /** Linked bank account ID */
  linkedBankAccountId: string;
  /** Tenant ID */
  tenantId: string;
  /** Transaction date */
  date: Date;
  /** Amount in cents (positive or negative) */
  amountCents: number;
  /** Bank description */
  description: string;
  /** Bank reference */
  reference: string;
  /** Transaction type */
  type: TransactionType;
  /** Running balance */
  runningBalanceCents?: number;
  /** Counterparty name */
  counterpartyName?: string;
  /** Bank category */
  bankCategory?: string;
  /** Whether already imported */
  isDuplicate: boolean;
}

// ============================================================================
// Balance Types
// ============================================================================

/**
 * Account balance information
 */
export interface AccountBalance {
  /** Account ID */
  accountId: string;
  /** Current balance in cents */
  currentBalanceCents: number;
  /** Available balance in cents */
  availableBalanceCents: number;
  /** Currency code */
  currency: string;
  /** Balance as of timestamp */
  asOf: Date;
  /** Overdraft limit (if applicable) */
  overdraftLimitCents?: number;
}

// ============================================================================
// Sync Job Types
// ============================================================================

/**
 * Configuration for sync job
 */
export interface SyncConfig {
  /** Maximum transactions per sync */
  maxTransactionsPerSync: number;
  /** Days to look back on first sync */
  initialSyncDays: number;
  /** Days to look back on incremental sync */
  incrementalSyncDays: number;
  /** Retry attempts on failure */
  maxRetries: number;
  /** Backoff multiplier for retries (ms) */
  retryBackoffMs: number;
  /** Rate limit: requests per hour */
  rateLimitPerHour: number;
}

/**
 * Default sync configuration
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  maxTransactionsPerSync: 500,
  initialSyncDays: 90,
  incrementalSyncDays: 7,
  maxRetries: 3,
  retryBackoffMs: 1000,
  rateLimitPerHour: 100,
};

/**
 * Result of syncing a single account
 */
export interface AccountSyncResult {
  /** Linked account ID */
  accountId: string;
  /** Whether sync was successful */
  success: boolean;
  /** Number of transactions retrieved */
  transactionsRetrieved: number;
  /** Number of new transactions (not duplicates) */
  transactionsNew: number;
  /** Number of duplicate transactions skipped */
  transactionsDuplicate: number;
  /** Sync start time */
  startedAt: Date;
  /** Sync end time */
  completedAt: Date;
  /** Duration in ms */
  durationMs: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Error code if failed */
  errorCode?: StitchErrorCode;
  /** Whether auto-reconciliation was triggered */
  reconciliationTriggered: boolean;
}

/**
 * Result of sync job run
 */
export interface SyncJobResult {
  /** Job run ID */
  jobRunId: string;
  /** Number of accounts synced */
  accountsSynced: number;
  /** Number of accounts with errors */
  accountsFailed: number;
  /** Number of accounts skipped (e.g., consent expired) */
  accountsSkipped: number;
  /** Total transactions synced */
  totalTransactions: number;
  /** Total new transactions */
  newTransactions: number;
  /** Job start time */
  startedAt: Date;
  /** Job end time */
  completedAt: Date;
  /** Duration in ms */
  durationMs: number;
  /** Individual account results */
  accountResults: AccountSyncResult[];
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Stitch API error codes
 */
export type StitchErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'CONSENT_EXPIRED'
  | 'CONSENT_REVOKED'
  | 'ACCOUNT_NOT_FOUND'
  | 'BANK_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INVALID_GRANT'
  | 'INVALID_SCOPE'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Stitch API error response
 */
export interface StitchApiError {
  /** Error code */
  code: StitchErrorCode;
  /** Error message */
  message: string;
  /** HTTP status code */
  statusCode: number;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Request ID for debugging */
  requestId?: string;
  /** Whether error is retryable */
  retryable: boolean;
}

/**
 * Map error codes to retryable status
 */
export const RETRYABLE_ERRORS: StitchErrorCode[] = [
  'BANK_UNAVAILABLE',
  'RATE_LIMITED',
  'SERVER_ERROR',
  'NETWORK_ERROR',
];

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Stitch API base URL configuration
 */
export interface StitchConfig {
  /** Base API URL */
  baseUrl: string;
  /** Client ID */
  clientId: string;
  /** Client secret (encrypted at rest) */
  clientSecret: string;
  /** Default redirect URI */
  redirectUri: string;
  /** Request timeout in ms */
  timeoutMs: number;
  /** Whether using sandbox environment */
  sandbox: boolean;
}

/**
 * Default Stitch configuration
 */
export const DEFAULT_STITCH_CONFIG: Partial<StitchConfig> = {
  baseUrl: 'https://api.stitch.money',
  timeoutMs: 30000,
  sandbox: false,
};

/**
 * Stitch API request options
 */
export interface StitchRequestOptions {
  /** HTTP method */
  method: 'GET' | 'POST' | 'DELETE';
  /** Endpoint path */
  path: string;
  /** Query parameters */
  params?: Record<string, string | number | boolean>;
  /** Request body */
  body?: Record<string, unknown>;
  /** Access token (if not using client credentials) */
  accessToken?: string;
  /** Custom timeout override */
  timeoutMs?: number;
}

// ============================================================================
// Webhook Types (Future)
// ============================================================================

/**
 * Stitch webhook event types (for future implementation)
 */
export type StitchWebhookEventType =
  | 'account.linked'
  | 'account.unlinked'
  | 'consent.expired'
  | 'transactions.available'
  | 'balance.updated';

/**
 * Stitch webhook payload (for future implementation)
 */
export interface StitchWebhookPayload {
  /** Event type */
  event: StitchWebhookEventType;
  /** Event timestamp */
  timestamp: Date;
  /** Account ID */
  accountId: string;
  /** Webhook ID for deduplication */
  webhookId: string;
  /** Event-specific data */
  data: Record<string, unknown>;
}

// ============================================================================
// Audit Types (POPIA Compliance)
// ============================================================================

/**
 * Sync event types for audit logging
 */
export type SyncEventType =
  | 'link_initiated'
  | 'link_completed'
  | 'link_failed'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'token_refreshed'
  | 'consent_renewed'
  | 'consent_expired'
  | 'account_unlinked'
  | 'data_accessed';

/**
 * Sync event for audit logging
 */
export interface SyncEvent {
  /** Event type */
  type: SyncEventType;
  /** Linked bank account ID */
  linkedBankAccountId: string;
  /** Tenant ID */
  tenantId: string;
  /** Event timestamp */
  timestamp: Date;
  /** User who triggered event (if manual) */
  triggeredBy?: string;
  /** Event-specific details */
  details: Record<string, unknown>;
  /** IP address (for POPIA audit) */
  ipAddress?: string;
  /** User agent (for POPIA audit) */
  userAgent?: string;
}

// ============================================================================
// DTO Types for API Responses
// ============================================================================

/**
 * Bank account summary for dashboard
 */
export interface BankAccountSummary {
  /** Total linked accounts */
  totalAccounts: number;
  /** Active accounts */
  activeAccounts: number;
  /** Accounts needing attention */
  attentionNeeded: number;
  /** Total balance across accounts */
  totalBalanceCents: number;
  /** Last sync timestamp */
  lastSyncAt: Date | null;
  /** Next scheduled sync */
  nextSyncAt: Date | null;
  /** Accounts by bank */
  byBank: Record<string, number>;
}

/**
 * Consent status for UI display
 */
export interface ConsentStatus {
  /** Account ID */
  accountId: string;
  /** Bank name */
  bankName: string;
  /** Consent expiry date */
  expiresAt: Date;
  /** Days remaining */
  daysRemaining: number;
  /** Status: ok, warning (< 14 days), critical (< 7 days), expired */
  status: 'ok' | 'warning' | 'critical' | 'expired';
  /** Renewal URL */
  renewalUrl?: string;
}
