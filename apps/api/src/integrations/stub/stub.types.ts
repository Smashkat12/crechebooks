/**
 * Stub.africa Connect API Type Definitions
 *
 * Types for the Stub.africa accounting integration.
 * Stub uses a push-based model with async webhook-based pulls.
 *
 * CRITICAL: Stub amounts are in Rands (decimals), NOT cents.
 * CrecheBooks stores cents -- conversion happens in the adapter/client layer.
 *
 * API Auth: All endpoints require `apikey` + `appid` in the request body.
 * Push/pull endpoints also require `uid` (business identifier).
 * Data payloads are nested under the `data` key.
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
// Request Envelopes (body-based auth, per Stub API spec)
// ---------------------------------------------------------------------------

/** Base envelope -- apikey + appid in every request body. */
export interface StubBaseEnvelope {
  apikey: string;
  appid: string;
  signature?: string;
}

/** Envelope for push/business (no uid -- creating a new business). */
export interface StubBusinessEnvelope extends StubBaseEnvelope {
  data: StubBusinessPayload;
  webhook?: string;
}

/** Envelope for push endpoints (income, expense). */
export interface StubPushEnvelope extends StubBaseEnvelope {
  uid: string;
  data: StubTransactionPayload;
  webhook?: string;
}

/** Envelope for push/settlement (batch income + expenses). */
export interface StubSettlementEnvelope extends StubBaseEnvelope {
  uid: string;
  data: StubSettlementPayload;
  webhook?: string;
}

/** Envelope for pull endpoints (bank-feed, income, expenses). */
export interface StubPullEnvelope extends StubBaseEnvelope {
  uid: string;
  webhook: string;
}

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

/** Payload for creating a business in Stub (nested under `data`). */
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
  /** Authentication token (1hr expiry, not used in body-based auth) */
  token: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** Payload for a single income or expense push (nested under `data`). */
export interface StubTransactionPayload {
  /** Unique transaction identifier */
  id: string;
  /** Transaction date in ISO 8601 format (YYYY-MM-DD) */
  date: string;
  /** Description / line item name */
  name: string;
  /** Category for income/expense classification */
  category?: string;
  /** Additional notes */
  notes?: string;
  /** Currency code (always 'ZAR' for CrecheBooks) */
  currency: string;
  /** Amount in Rands (decimal), NOT cents */
  amount: number;
  /** VAT amount in Rands (decimal) */
  vat?: number;
}

/** Payload for settlement push (nested under `data` in /api/push/settlement). */
export interface StubSettlementPayload {
  /** Account identifier for the settlement */
  accountid: string;
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
