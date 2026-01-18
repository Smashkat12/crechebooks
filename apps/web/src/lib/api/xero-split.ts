/**
 * Xero Transaction Split API Client
 * TASK-RECON-037: API functions for Xero transaction splitting
 *
 * Splits Xero transactions into net amount + accrued bank charge
 * to enable direct matching with bank statements.
 */

import { apiClient } from './client';
import { endpoints } from './endpoints';
import { AxiosResponse } from 'axios';

// Enum for split status
export type XeroSplitStatus = 'PENDING' | 'CONFIRMED' | 'MATCHED' | 'CANCELLED';

// Request DTOs
export interface DetectSplitParamsRequest {
  xero_transaction_id: string;
  xero_amount_cents: number;
  bank_amount_cents: number;
  description?: string;
  payee_name?: string;
}

export interface CreateXeroSplitRequest {
  xero_transaction_id: string;
  net_amount_cents: number;
  fee_amount_cents: number;
  fee_type: string;
  fee_description?: string;
  bank_transaction_id?: string;
  bank_statement_match_id?: string;
  notes?: string;
}

export interface ConfirmSplitRequest {
  split_id: string;
  bank_transaction_id?: string;
  create_match?: boolean;
}

export interface CancelSplitRequest {
  split_id: string;
  reason?: string;
}

export interface XeroSplitFilterParams {
  status?: XeroSplitStatus;
  xero_transaction_id?: string;
  fee_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

// Response DTOs
export interface DetectSplitParamsResponse {
  is_split_recommended: boolean;
  xero_amount_cents: number;
  suggested_net_amount_cents: number;
  suggested_fee_amount_cents: number;
  suggested_fee_type: string;
  expected_fee_cents?: number;
  confidence: number;
  explanation?: string;
}

export interface AccruedChargeInfo {
  id: string;
  status: string;
  fee_type: string;
  accrued_amount_cents: number;
  matched_at?: string | null;
}

export interface XeroSplitResponse {
  id: string;
  tenant_id: string;
  xero_transaction_id: string;
  original_amount_cents: number;
  net_amount_cents: number;
  fee_amount_cents: number;
  fee_type: string;
  fee_description: string | null;
  status: XeroSplitStatus;
  accrued_charge_id: string | null;
  bank_transaction_id: string | null;
  bank_statement_match_id: string | null;
  notes: string | null;
  created_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  accrued_charge?: AccruedChargeInfo | null;
}

export interface XeroSplitListResponse {
  success: boolean;
  data: XeroSplitResponse[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface XeroSplitSummaryResponse {
  success: boolean;
  data: {
    total_count: number;
    by_status: Record<XeroSplitStatus, number>;
    total_original_cents: number;
    total_net_cents: number;
    total_fee_cents: number;
    by_fee_type: Record<string, { count: number; total_fee_cents: number }>;
  };
}

export interface CreateSplitResponse {
  success: boolean;
  data: XeroSplitResponse;
  message: string;
}

// Frontend types (camelCase)
export interface XeroSplit {
  id: string;
  tenantId: string;
  xeroTransactionId: string;
  originalAmountCents: number;
  netAmountCents: number;
  feeAmountCents: number;
  feeType: string;
  feeDescription: string | null;
  status: XeroSplitStatus;
  accruedChargeId: string | null;
  bankTransactionId: string | null;
  bankStatementMatchId: string | null;
  notes: string | null;
  createdBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  accruedCharge?: {
    id: string;
    status: string;
    feeType: string;
    accruedAmountCents: number;
    matchedAt?: string | null;
  } | null;
}

export interface SplitDetectionResult {
  isSplitRecommended: boolean;
  xeroAmountCents: number;
  suggestedNetAmountCents: number;
  suggestedFeeAmountCents: number;
  suggestedFeeType: string;
  expectedFeeCents?: number;
  confidence: number;
  explanation?: string;
}

// Transform functions
function transformSplitResponse(api: XeroSplitResponse): XeroSplit {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    xeroTransactionId: api.xero_transaction_id,
    originalAmountCents: api.original_amount_cents,
    netAmountCents: api.net_amount_cents,
    feeAmountCents: api.fee_amount_cents,
    feeType: api.fee_type,
    feeDescription: api.fee_description,
    status: api.status,
    accruedChargeId: api.accrued_charge_id,
    bankTransactionId: api.bank_transaction_id,
    bankStatementMatchId: api.bank_statement_match_id,
    notes: api.notes,
    createdBy: api.created_by,
    confirmedBy: api.confirmed_by,
    confirmedAt: api.confirmed_at,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    accruedCharge: api.accrued_charge
      ? {
          id: api.accrued_charge.id,
          status: api.accrued_charge.status,
          feeType: api.accrued_charge.fee_type,
          accruedAmountCents: api.accrued_charge.accrued_amount_cents,
          matchedAt: api.accrued_charge.matched_at,
        }
      : null,
  };
}

function transformDetectResponse(api: DetectSplitParamsResponse): SplitDetectionResult {
  return {
    isSplitRecommended: api.is_split_recommended,
    xeroAmountCents: api.xero_amount_cents,
    suggestedNetAmountCents: api.suggested_net_amount_cents,
    suggestedFeeAmountCents: api.suggested_fee_amount_cents,
    suggestedFeeType: api.suggested_fee_type,
    expectedFeeCents: api.expected_fee_cents,
    confidence: api.confidence,
    explanation: api.explanation,
  };
}

// API Functions

/**
 * Detect split parameters from transaction mismatch
 * @throws {Error} If request fails
 */
export async function detectSplitParams(
  xeroTransactionId: string,
  xeroAmountCents: number,
  bankAmountCents: number,
  description?: string,
  payeeName?: string
): Promise<SplitDetectionResult> {
  const response: AxiosResponse<{ success: boolean; data: DetectSplitParamsResponse }> =
    await apiClient.post(endpoints.xeroSplits.detect, {
      xero_transaction_id: xeroTransactionId,
      xero_amount_cents: xeroAmountCents,
      bank_amount_cents: bankAmountCents,
      description,
      payee_name: payeeName,
    });

  if (!response.data.success) {
    const error = new Error('Failed to detect split parameters');
    console.error('detectSplitParams failed:', error);
    throw error;
  }

  return transformDetectResponse(response.data.data);
}

/**
 * Create a Xero transaction split
 * @throws {Error} If request fails
 */
export async function createXeroSplit(request: CreateXeroSplitRequest): Promise<XeroSplit> {
  const response: AxiosResponse<CreateSplitResponse> = await apiClient.post(
    endpoints.xeroSplits.create,
    request
  );

  if (!response.data.success) {
    const error = new Error('Failed to create Xero split');
    console.error('createXeroSplit failed:', error);
    throw error;
  }

  return transformSplitResponse(response.data.data);
}

/**
 * Confirm a pending split
 * @throws {Error} If request fails
 */
export async function confirmXeroSplit(
  splitId: string,
  bankTransactionId?: string,
  createMatch?: boolean
): Promise<XeroSplit> {
  const response: AxiosResponse<{ success: boolean; data: XeroSplitResponse }> =
    await apiClient.post(endpoints.xeroSplits.confirm(splitId), {
      split_id: splitId,
      bank_transaction_id: bankTransactionId,
      create_match: createMatch,
    });

  if (!response.data.success) {
    const error = new Error('Failed to confirm Xero split');
    console.error('confirmXeroSplit failed:', error);
    throw error;
  }

  return transformSplitResponse(response.data.data);
}

/**
 * Cancel a split
 * @throws {Error} If request fails
 */
export async function cancelXeroSplit(splitId: string, reason?: string): Promise<XeroSplit> {
  const response: AxiosResponse<{ success: boolean; data: XeroSplitResponse }> =
    await apiClient.post(endpoints.xeroSplits.cancel(splitId), {
      split_id: splitId,
      reason,
    });

  if (!response.data.success) {
    const error = new Error('Failed to cancel Xero split');
    console.error('cancelXeroSplit failed:', error);
    throw error;
  }

  return transformSplitResponse(response.data.data);
}

/**
 * Get a split by ID
 * @throws {Error} If request fails
 */
export async function getXeroSplit(splitId: string): Promise<XeroSplit> {
  const response: AxiosResponse<{ success: boolean; data: XeroSplitResponse }> =
    await apiClient.get(endpoints.xeroSplits.detail(splitId));

  if (!response.data.success) {
    const error = new Error('Failed to get Xero split');
    console.error('getXeroSplit failed:', error);
    throw error;
  }

  return transformSplitResponse(response.data.data);
}

/**
 * Get split by Xero transaction ID
 * @throws {Error} If request fails
 */
export async function getXeroSplitByTransaction(
  xeroTransactionId: string
): Promise<XeroSplit | null> {
  const response: AxiosResponse<{ success: boolean; data: XeroSplitResponse | null }> =
    await apiClient.get(endpoints.xeroSplits.byXeroTransaction(xeroTransactionId));

  if (!response.data.success) {
    const error = new Error('Failed to get Xero split by transaction');
    console.error('getXeroSplitByTransaction failed:', error);
    throw error;
  }

  return response.data.data ? transformSplitResponse(response.data.data) : null;
}

/**
 * List Xero splits with filtering
 * @throws {Error} If request fails
 */
export async function listXeroSplits(
  params?: XeroSplitFilterParams
): Promise<{ splits: XeroSplit[]; total: number; page: number; limit: number; totalPages: number }> {
  const response: AxiosResponse<XeroSplitListResponse> = await apiClient.get(
    endpoints.xeroSplits.list,
    { params }
  );

  if (!response.data.success) {
    const error = new Error('Failed to list Xero splits');
    console.error('listXeroSplits failed:', error);
    throw error;
  }

  return {
    splits: response.data.data.map(transformSplitResponse),
    total: response.data.total,
    page: response.data.page,
    limit: response.data.limit,
    totalPages: response.data.total_pages,
  };
}

/**
 * Get Xero splits summary
 * @throws {Error} If request fails
 */
export async function getXeroSplitsSummary(): Promise<{
  totalCount: number;
  byStatus: Record<XeroSplitStatus, number>;
  totalOriginalCents: number;
  totalNetCents: number;
  totalFeeCents: number;
  byFeeType: Record<string, { count: number; totalFeeCents: number }>;
}> {
  const response: AxiosResponse<XeroSplitSummaryResponse> = await apiClient.get(
    endpoints.xeroSplits.summary
  );

  if (!response.data.success) {
    const error = new Error('Failed to get Xero splits summary');
    console.error('getXeroSplitsSummary failed:', error);
    throw error;
  }

  const data = response.data.data;
  return {
    totalCount: data.total_count,
    byStatus: data.by_status,
    totalOriginalCents: data.total_original_cents,
    totalNetCents: data.total_net_cents,
    totalFeeCents: data.total_fee_cents,
    byFeeType: Object.fromEntries(
      Object.entries(data.by_fee_type).map(([key, value]) => [
        key,
        { count: value.count, totalFeeCents: value.total_fee_cents },
      ])
    ),
  };
}
