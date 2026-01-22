/**
 * Parent Portal Payments Hooks
 * TASK-PORTAL-015: Parent Portal Payments Page
 *
 * React Query hooks for parent payment operations:
 * - useParentPayments(filters) - fetch payment history with pagination and filtering
 * - useParentPayment(id) - fetch single payment detail with allocations
 * - useParentBankDetails() - fetch creche bank details for EFT payments
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export type ParentPaymentStatus = 'completed' | 'pending' | 'failed';

export interface ParentPaymentListItem {
  id: string;
  paymentDate: string;
  amount: number;
  reference: string;
  method: string;
  status: ParentPaymentStatus;
}

export interface ParentPaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  childName?: string;
  allocatedAmount: number;
  invoiceTotal: number;
}

export interface ParentPaymentDetail {
  id: string;
  paymentDate: string;
  amount: number;
  reference: string;
  method: string;
  status: ParentPaymentStatus;
  allocations: ParentPaymentAllocation[];
  hasReceipt: boolean;
  notes?: string;
}

export interface CrecheBankDetails {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  branchCode: string;
  accountType: 'Cheque' | 'Savings' | 'Current';
  swiftCode?: string;
  paymentReference: string;
  paymentInstructions?: string;
}

export interface ParentPaymentsFilters {
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ParentPaymentsResponse {
  payments: ParentPaymentListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  totalOutstanding: number;
}

// ============================================================================
// Query Keys
// ============================================================================

export const parentPaymentKeys = {
  all: ['parent-payments'] as const,
  lists: () => [...parentPaymentKeys.all, 'list'] as const,
  list: (filters?: ParentPaymentsFilters) => [...parentPaymentKeys.lists(), filters] as const,
  details: () => [...parentPaymentKeys.all, 'detail'] as const,
  detail: (id: string) => [...parentPaymentKeys.details(), id] as const,
  bankDetails: () => [...parentPaymentKeys.all, 'bank-details'] as const,
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
 * Fetch parent payments list with filters and pagination
 */
export function useParentPayments(filters?: ParentPaymentsFilters) {
  return useQuery<ParentPaymentsResponse, Error>({
    queryKey: parentPaymentKeys.list(filters),
    queryFn: async () => {
      // Build query string
      const params = new URLSearchParams();
      if (filters?.startDate) {
        params.set('startDate', filters.startDate);
      }
      if (filters?.endDate) {
        params.set('endDate', filters.endDate);
      }
      if (filters?.page) {
        params.set('page', String(filters.page));
      }
      if (filters?.limit) {
        params.set('limit', String(filters.limit));
      }

      const queryString = params.toString();
      const endpoint = `/parent-portal/payments${queryString ? `?${queryString}` : ''}`;

      return parentPortalFetch<ParentPaymentsResponse>(endpoint);
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch single payment detail with allocations
 */
export function useParentPayment(id: string, enabled = true) {
  return useQuery<ParentPaymentDetail, Error>({
    queryKey: parentPaymentKeys.detail(id),
    queryFn: async () => {
      return parentPortalFetch<ParentPaymentDetail>(`/parent-portal/payments/${id}`);
    },
    enabled: enabled && !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch creche bank details for EFT payments
 */
export function useParentBankDetails() {
  return useQuery<CrecheBankDetails, Error>({
    queryKey: parentPaymentKeys.bankDetails(),
    queryFn: async () => {
      return parentPortalFetch<CrecheBankDetails>('/parent-portal/bank-details');
    },
    staleTime: 5 * 60 * 1000, // 5 minutes (bank details don't change often)
  });
}

/**
 * Download payment receipt
 * Returns a function to trigger the download
 */
export function useDownloadPaymentReceipt() {
  const downloadReceipt = useCallback(async (paymentId: string, reference: string) => {
    const token = getParentToken();

    if (!token) {
      throw new Error('Not authenticated. Please log in.');
    }

    const response = await fetch(
      `${API_URL}/api/v1/parent-portal/payments/${paymentId}/receipt`,
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

      let errorMessage = `Failed to download receipt: ${response.status}`;
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
    link.download = `Receipt-${reference}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, []);

  return { downloadReceipt };
}

/**
 * Generate a payment reference for the parent
 * Format: parentId-YYYYMMDD-XXX
 */
export function generatePaymentReference(parentId: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  const shortParentId = parentId.substring(0, 8).toUpperCase();
  return `${shortParentId}-${dateStr}-${random}`;
}
