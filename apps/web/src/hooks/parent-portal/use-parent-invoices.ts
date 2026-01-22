/**
 * Parent Portal Invoices Hooks
 * TASK-PORTAL-013: Parent Portal Invoices Page
 *
 * React Query hooks for parent invoice operations:
 * - useParentInvoices(filters) - fetch invoices list with pagination and filtering
 * - useParentInvoice(id) - fetch single invoice detail
 * - useDownloadParentInvoicePdf(id, invoiceNumber) - download invoice PDF
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export type ParentInvoiceStatus = 'paid' | 'pending' | 'overdue';

export interface ParentInvoiceListItem {
  id: string;
  invoiceNumber: string;
  date: string;
  childName?: string;
  amount: number;
  status: ParentInvoiceStatus;
}

export interface ParentInvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatAmount: number;
  total: number;
}

export interface ParentInvoiceDetail {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: ParentInvoiceStatus;
  // Customer details
  parentName: string;
  parentEmail?: string;
  // Creche details
  crecheName: string;
  crecheAddress?: string;
  // Child details
  childName: string;
  // Financial details
  subtotal: number;
  vatAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  // Line items
  lineItems: ParentInvoiceLineItem[];
  // Payment history
  payments: ParentPaymentRecord[];
  // Metadata
  notes?: string;
}

export interface ParentPaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: string;
  reference?: string;
}

export interface ParentInvoicesFilters {
  status?: 'all' | 'paid' | 'pending' | 'overdue';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ParentInvoicesResponse {
  invoices: ParentInvoiceListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// Query Keys
// ============================================================================

export const parentInvoiceKeys = {
  all: ['parent-invoices'] as const,
  lists: () => [...parentInvoiceKeys.all, 'list'] as const,
  list: (filters?: ParentInvoicesFilters) => [...parentInvoiceKeys.lists(), filters] as const,
  details: () => [...parentInvoiceKeys.all, 'detail'] as const,
  detail: (id: string) => [...parentInvoiceKeys.details(), id] as const,
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
 * Fetch parent invoices list with filters and pagination
 */
export function useParentInvoices(filters?: ParentInvoicesFilters) {
  return useQuery<ParentInvoicesResponse, Error>({
    queryKey: parentInvoiceKeys.list(filters),
    queryFn: async () => {
      // Build query string
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'all') {
        params.set('status', filters.status);
      }
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
      const endpoint = `/parent-portal/invoices${queryString ? `?${queryString}` : ''}`;

      return parentPortalFetch<ParentInvoicesResponse>(endpoint);
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch single invoice detail
 */
export function useParentInvoice(id: string, enabled = true) {
  return useQuery<ParentInvoiceDetail, Error>({
    queryKey: parentInvoiceKeys.detail(id),
    queryFn: async () => {
      return parentPortalFetch<ParentInvoiceDetail>(`/parent-portal/invoices/${id}`);
    },
    enabled: enabled && !!id,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Download invoice PDF
 * Returns a function to trigger the download
 */
export function useDownloadParentInvoicePdf() {
  const downloadPdf = useCallback(async (invoiceId: string, invoiceNumber: string) => {
    const token = getParentToken();

    if (!token) {
      throw new Error('Not authenticated. Please log in.');
    }

    const response = await fetch(
      `${API_URL}/api/v1/parent-portal/invoices/${invoiceId}/pdf`,
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
    link.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, []);

  return { downloadPdf };
}
