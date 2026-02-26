/**
 * Stub.africa Connect API Type Definitions
 *
 * Types for the Stub.africa accounting integration.
 * Stub uses a push-based model with async webhook-based pulls.
 *
 * CRITICAL: Stub amounts are in Rands (decimals), NOT cents.
 * CrecheBooks stores cents -- conversion happens in the adapter/client layer.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Environment configuration for the Stub Connect API. */
export interface StubConfig {
  /** API key (sk_test_xxx or sk_live_xxx) */
  apiKey: string;
  /** Application identifier */
  appId: string;
  /** Base URL (test or production) */
  baseUrl: string;
  /** Webhook URL for async pull responses */
  webhookUrl: string;
}

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

/** Payload for creating a business in Stub. */
export interface StubBusinessPayload {
  businessname: string;
  firstname: string;
  lastname: string;
  email: string;
  industry?: string;
  phone?: string;
  vatregistered?: boolean;
}

/** Response from Stub business creation. */
export interface StubBusinessResponse {
  /** Unique business identifier in Stub */
  uid: string;
  /** Authentication token for subsequent API calls (1hr expiry) */
  token: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** Payload for a single income or expense push to Stub. */
export interface StubTransactionPayload {
  /** Unique transaction identifier */
  id: string;
  /** Transaction date in ISO 8601 format (YYYY-MM-DD) */
  date: string;
  /** Description / line item name */
  name: string;
  /** Category or account identifier */
  accountid?: string;
  /** Additional notes */
  notes?: string;
  /** Currency code (always 'ZAR' for CrecheBooks) */
  currency: string;
  /** Amount in Rands (decimal), NOT cents */
  amount: number;
  /** VAT amount in Rands (decimal) */
  vat?: number;
  /** Product or service identifier */
  productid?: string;
}

/** Payload for batch push of income and expenses via /api/push/many. */
export interface StubSettlementPayload {
  income: StubTransactionPayload[];
  expenses: StubTransactionPayload[];
  summary?: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
  };
}

// ---------------------------------------------------------------------------
// API Responses
// ---------------------------------------------------------------------------

/** Generic Stub API response wrapper. */
export interface StubApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/** Error shape returned by the Stub API. */
export interface StubApiError {
  status: number;
  message: string;
  code?: string;
}
