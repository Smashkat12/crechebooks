/**
 * Split Transaction API Client
 *
 * API functions for split transaction operations:
 * - Get split details
 * - Save split allocations
 * - Delete splits
 */

import { apiClient } from './client';
import { AxiosResponse } from 'axios';

export interface SplitAllocation {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: number; // Amount in cents
  description?: string;
}

export interface SplitTransactionResponse {
  success: boolean;
  data: {
    transactionId: string;
    splits: SplitAllocation[];
    totalAmount: number; // Total in cents
  };
}

export interface SaveSplitRequest {
  splits: Array<{
    categoryId: string;
    categoryName: string;
    amount: number; // Amount in cents
    description?: string;
  }>;
}

/**
 * Get split allocations for a transaction
 * @throws {Error} If request fails - no fallbacks
 */
export async function getSplitTransaction(
  transactionId: string
): Promise<SplitTransactionResponse> {
  const response: AxiosResponse<SplitTransactionResponse> = await apiClient.get(
    `/transactions/${transactionId}/splits`
  );

  if (!response.data.success) {
    const error = new Error('Failed to fetch split transaction');
    console.error('getSplitTransaction failed:', error);
    throw error;
  }

  return response.data;
}

/**
 * Save split allocations for a transaction
 * @throws {Error} If validation fails or request fails - no fallbacks
 */
export async function saveSplitTransaction(
  transactionId: string,
  request: SaveSplitRequest
): Promise<SplitTransactionResponse> {
  // Validate request
  if (!request.splits || request.splits.length < 2) {
    const error = new Error('Split transaction requires at least 2 allocations');
    console.error('saveSplitTransaction validation failed:', error);
    throw error;
  }

  // Validate all splits have required fields
  const invalidSplit = request.splits.find(
    split => !split.categoryId || !split.categoryName || split.amount <= 0
  );
  if (invalidSplit) {
    const error = new Error('All splits must have categoryId, categoryName, and amount > 0');
    console.error('saveSplitTransaction validation failed:', error, invalidSplit);
    throw error;
  }

  const response: AxiosResponse<SplitTransactionResponse> = await apiClient.post(
    `/transactions/${transactionId}/splits`,
    request
  );

  if (!response.data.success) {
    const error = new Error('Failed to save split transaction');
    console.error('saveSplitTransaction failed:', error);
    throw error;
  }

  return response.data;
}

/**
 * Delete split allocations and revert to single transaction
 * @throws {Error} If request fails - no fallbacks
 */
export async function deleteSplitTransaction(
  transactionId: string
): Promise<{ success: boolean }> {
  const response: AxiosResponse<{ success: boolean }> = await apiClient.delete(
    `/transactions/${transactionId}/splits`
  );

  if (!response.data.success) {
    const error = new Error('Failed to delete split transaction');
    console.error('deleteSplitTransaction failed:', error);
    throw error;
  }

  return response.data;
}
