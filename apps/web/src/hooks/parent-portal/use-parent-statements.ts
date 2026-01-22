/**
 * Parent Portal Statements Hooks
 * TASK-PORTAL-014: Parent Portal Statements Page
 *
 * React Query hooks for parent statement operations:
 * - useParentStatements(year) - fetch list of available statements
 * - useParentStatement(year, month) - fetch specific statement with transactions
 * - useDownloadStatementPdf - download statement PDF
 * - useEmailStatement - email statement to parent
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export type StatementStatus = 'available' | 'generating' | 'pending';
export type TransactionType = 'invoice' | 'payment' | 'credit';

export interface ParentStatementListItem {
  year: number;
  month: number;
  periodLabel: string;
  transactionCount: number;
  openingBalance: number;
  closingBalance: number;
  status: StatementStatus;
}

export interface ParentStatementTransaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  debit: number | null;
  credit: number | null;
  balance: number;
}

export interface ParentStatementDetail {
  year: number;
  month: number;
  periodLabel: string;
  parentName: string;
  parentEmail?: string;
  accountNumber?: string;
  openingBalance: number;
  closingBalance: number;
  totalInvoiced: number;
  totalPaid: number;
  totalCredits: number;
  netMovement: number;
  transactions: ParentStatementTransaction[];
}

export interface ParentStatementsListResponse {
  statements: ParentStatementListItem[];
  year: number;
}

// ============================================================================
// Query Keys
// ============================================================================

export const parentStatementKeys = {
  all: ['parent-statements'] as const,
  lists: () => [...parentStatementKeys.all, 'list'] as const,
  list: (year: number) => [...parentStatementKeys.lists(), year] as const,
  details: () => [...parentStatementKeys.all, 'detail'] as const,
  detail: (year: number, month: number) =>
    [...parentStatementKeys.details(), year, month] as const,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get authorization token from localStorage
 */
function getParentToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('parent_session_token');
}

/**
 * Make authenticated request to parent portal API
 */
async function parentPortalFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = getParentToken();

  if (!token) {
    throw new Error('Not authenticated. Please log in.');
  }

  const response = await fetch(`${API_URL}/api/v1${endpoint}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear invalid token
      localStorage.removeItem('parent_session_token');
      throw new Error('Session expired. Please log in again.');
    }

    let errorMessage = `Request failed: ${response.status}`;
    try {
      const error = await response.json();
      errorMessage = error.message || error.error || errorMessage;
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch parent statements list for a specific year
 */
export function useParentStatements(year: number) {
  return useQuery<ParentStatementsListResponse, Error>({
    queryKey: parentStatementKeys.list(year),
    queryFn: async () => {
      return parentPortalFetch<ParentStatementsListResponse>(
        `/parent-portal/statements?year=${year}`
      );
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch specific statement detail with transactions
 */
export function useParentStatement(
  year: number,
  month: number,
  enabled = true
) {
  return useQuery<ParentStatementDetail, Error>({
    queryKey: parentStatementKeys.detail(year, month),
    queryFn: async () => {
      return parentPortalFetch<ParentStatementDetail>(
        `/parent-portal/statements/${year}/${month}`
      );
    },
    enabled: enabled && !!year && !!month && month >= 1 && month <= 12,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Download statement PDF
 * Returns a function to trigger the download with loading state
 */
export function useDownloadStatementPdf() {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadPdf = useCallback(
    async (year: number, month: number, periodLabel: string) => {
      const token = getParentToken();

      if (!token) {
        throw new Error('Not authenticated. Please log in.');
      }

      setIsDownloading(true);

      try {
        const response = await fetch(
          `${API_URL}/api/v1/parent-portal/statements/${year}/${month}/pdf`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('parent_session_token');
            throw new Error('Session expired. Please log in again.');
          }

          let errorMessage = `Failed to download PDF: ${response.status}`;
          try {
            const error = await response.json();
            errorMessage = error.message || error.error || errorMessage;
          } catch {
            // Use default error message
          }
          throw new Error(errorMessage);
        }

        // Create download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Statement-${periodLabel.replace(/\s+/g, '-')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } finally {
        setIsDownloading(false);
      }
    },
    []
  );

  return { downloadPdf, isDownloading };
}

/**
 * Email statement to parent
 * Returns mutation function with loading state
 */
export function useEmailStatement() {
  const [isEmailing, setIsEmailing] = useState(false);
  const queryClient = useQueryClient();

  const emailStatement = useCallback(
    async (year: number, month: number) => {
      const token = getParentToken();

      if (!token) {
        throw new Error('Not authenticated. Please log in.');
      }

      setIsEmailing(true);

      try {
        const response = await fetch(
          `${API_URL}/api/v1/parent-portal/statements/${year}/${month}/email`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          if (response.status === 401) {
            localStorage.removeItem('parent_session_token');
            throw new Error('Session expired. Please log in again.');
          }

          let errorMessage = `Failed to email statement: ${response.status}`;
          try {
            const error = await response.json();
            errorMessage = error.message || error.error || errorMessage;
          } catch {
            // Use default error message
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        return result;
      } finally {
        setIsEmailing(false);
      }
    },
    [queryClient]
  );

  return { emailStatement, isEmailing };
}
