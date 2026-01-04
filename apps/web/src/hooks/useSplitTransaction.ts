/**
 * useSplitTransaction Hook
 *
 * State management for split transactions with:
 * - Dynamic split row management (add/remove/update)
 * - Real-time validation using Decimal.js for precision
 * - API integration for saving splits
 * - Error handling with fail-fast approach
 */

import { useState, useMemo, useCallback } from 'react';
import Decimal from 'decimal.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { SplitRow } from '@/components/transactions/SplitTransactionModal';
import { formatCurrency } from '@/lib/utils';

interface SaveSplitRequest {
  transactionId: string;
  splits: Array<{
    categoryId: string;
    categoryName: string;
    amount: number; // Amount in cents
    description?: string;
  }>;
}

interface SaveSplitResponse {
  success: boolean;
  data: {
    transactionId: string;
    splits: Array<{
      id: string;
      categoryId: string;
      amount: number;
    }>;
  };
}

export function useSplitTransaction(transactionId: string, transactionAmount?: number) {
  const queryClient = useQueryClient();
  const [splits, setSplits] = useState<SplitRow[]>([]);

  // Calculate totals using Decimal.js for precision
  const { total, remaining, isValid, validationError } = useMemo(() => {
    // Use provided amount or try to get from cache
    let amount: number | undefined = transactionAmount;

    if (amount === undefined) {
      // Try detail cache first
      const detailTransaction = queryClient.getQueryData(
        queryKeys.transactions.detail(transactionId)
      ) as { amount: number } | undefined;

      if (detailTransaction) {
        amount = detailTransaction.amount;
      }
    }

    if (amount === undefined) {
      return {
        total: new Decimal(0),
        remaining: new Decimal(0),
        isValid: false,
        validationError: 'Transaction not found',
      };
    }

    const transactionAmountDecimal = new Decimal(amount).div(100).abs();

    // Sum all split amounts
    const splitTotal = splits.reduce((sum, split) => {
      const splitAmount = split.amount ? new Decimal(split.amount) : new Decimal(0);
      return sum.plus(splitAmount);
    }, new Decimal(0));

    const remainingAmount = transactionAmountDecimal.minus(splitTotal);
    const valid = splits.length >= 2 && splitTotal.equals(transactionAmountDecimal);

    let error: string | null = null;
    if (splits.length > 0 && splits.length < 2) {
      error = 'A split transaction requires at least 2 allocations';
    } else if (splits.length >= 2 && !splitTotal.equals(transactionAmountDecimal)) {
      error = `Split amounts (${formatCurrency(splitTotal.toNumber())}) must equal transaction amount (${formatCurrency(transactionAmountDecimal.toNumber())})`;
    }

    // Validate each split has required fields
    if (splits.length >= 2) {
      const hasInvalidSplit = splits.some(
        split => !split.categoryId || !split.amount || new Decimal(split.amount).lessThanOrEqualTo(0)
      );
      if (hasInvalidSplit) {
        error = 'All splits must have a category and amount greater than 0';
        return {
          total: splitTotal,
          remaining: remainingAmount,
          isValid: false,
          validationError: error,
        };
      }
    }

    return {
      total: splitTotal,
      remaining: remainingAmount,
      isValid: valid,
      validationError: error,
    };
  }, [splits, transactionId, transactionAmount, queryClient]);

  // Save splits mutation
  const saveMutation = useMutation<SaveSplitResponse, AxiosError, void>({
    mutationFn: async () => {
      if (!isValid) {
        throw new Error('Cannot save invalid split configuration');
      }

      // Convert amounts to cents
      const splitsData = splits.map(split => ({
        categoryId: split.categoryId,
        categoryName: split.categoryName,
        amount: Math.round(new Decimal(split.amount).times(100).toNumber()),
        description: split.description,
      }));

      const { data } = await apiClient.post<SaveSplitResponse>(
        endpoints.transactions.split(transactionId),
        { splits: splitsData }
      );

      return data;
    },
    onSuccess: () => {
      // Invalidate transaction queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(transactionId) });
    },
    onError: (error) => {
      console.error('Failed to save split transaction:', error);
      // Fail fast - don't catch, let it propagate
      throw error;
    },
  });

  // Add a new split row
  const addSplit = useCallback((suggestedAmount?: string) => {
    const newSplit: SplitRow = {
      id: `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      categoryId: '',
      categoryName: '',
      amount: suggestedAmount || '0.00',
      description: '',
    };
    setSplits(prev => [...prev, newSplit]);
  }, []);

  // Remove a split row
  const removeSplit = useCallback((id: string) => {
    setSplits(prev => {
      const newSplits = prev.filter(split => split.id !== id);
      // Enforce minimum of 2 splits if any exist
      if (newSplits.length === 1) {
        console.error('Cannot remove split: minimum 2 splits required');
        return prev; // Don't allow removal
      }
      return newSplits;
    });
  }, []);

  // Update a split row
  const updateSplit = useCallback((id: string, updates: Partial<SplitRow>) => {
    setSplits(prev =>
      prev.map(split =>
        split.id === id ? { ...split, ...updates } : split
      )
    );
  }, []);

  // Save splits to API
  const saveSplits = useCallback(async () => {
    if (!isValid) {
      const error = new Error(validationError || 'Invalid split configuration');
      console.error('Cannot save invalid splits:', error);
      throw error;
    }
    await saveMutation.mutateAsync();
  }, [isValid, validationError, saveMutation]);

  return {
    splits,
    addSplit,
    removeSplit,
    updateSplit,
    total,
    remaining,
    isValid,
    validationError,
    saveSplits,
    isLoading: saveMutation.isPending,
  };
}
