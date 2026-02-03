import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IInvoice, IInvoiceLine, InvoiceStatus } from '@crechebooks/types';

// Types for API responses - extends IInvoice with transformed cents fields
interface InvoiceWithLines extends IInvoice {
  lines: IInvoiceLine[];
  // Transformed fields from API (converted to cents for consistency)
  parentName?: string;
  childId?: string;
  childName?: string;
  billingPeriodStart?: Date;
  billingPeriodEnd?: Date;
  subtotalCents?: number;
  vatCents?: number;
  totalCents?: number;
  amountPaidCents?: number;
  deliveryStatus?: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface InvoicesListResponse {
  invoices: InvoiceWithLines[];
  total: number;
  page: number;
  limit: number;
}

interface InvoiceListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  status?: string;
  parentId?: string;
  childId?: string;
  startDate?: string;
  endDate?: string;
}

interface GenerateInvoicesParams {
  month: number;
  year: number;
  childIds?: string[];
}

interface SendInvoicesParams {
  invoiceIds: string[];
  method: 'email' | 'whatsapp' | 'both';
}

// API response format from the backend
interface ApiInvoiceResponse {
  id: string;
  invoice_number: string;
  parent: { id: string; name: string; email: string };
  child: { id: string; name: string };
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  vat: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  delivery_status: string | null;
  created_at: string;
}

interface ApiListResponse {
  success: boolean;
  data: ApiInvoiceResponse[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API response for single invoice detail
interface ApiInvoiceLineResponse {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  vat: number;
  total: number;
  line_type: string;
  account_code: string | null;
}

interface ApiInvoiceDetailResponse {
  id: string;
  invoice_number: string;
  parent: { id: string; name: string; email?: string | null };
  child: { id: string; name: string };
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  vat: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  delivery_status: string | null;
  lines: ApiInvoiceLineResponse[];
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiDetailResponse {
  success: boolean;
  data: ApiInvoiceDetailResponse;
}

// Transform API detail response to frontend format
function transformInvoiceDetail(apiInvoice: ApiInvoiceDetailResponse): InvoiceWithLines {
  return {
    id: apiInvoice.id,
    tenantId: '',
    invoiceNumber: apiInvoice.invoice_number,
    parentId: apiInvoice.parent.id,
    parentName: apiInvoice.parent.name,
    childId: apiInvoice.child.id,
    childName: apiInvoice.child.name,
    billingPeriodStart: new Date(apiInvoice.billing_period_start),
    billingPeriodEnd: new Date(apiInvoice.billing_period_end),
    issueDate: new Date(apiInvoice.issue_date),
    dueDate: new Date(apiInvoice.due_date),
    // All monetary values stored in cents for consistency
    // API returns Rands, convert to cents by multiplying by 100
    subtotal: Math.round(apiInvoice.subtotal * 100),
    vatAmount: Math.round(apiInvoice.vat * 100),
    total: Math.round(apiInvoice.total * 100),
    amountPaid: Math.round(apiInvoice.amount_paid * 100),
    amountDue: Math.round(apiInvoice.balance_due * 100),
    // Cents fields (same values for backwards compatibility)
    subtotalCents: Math.round(apiInvoice.subtotal * 100),
    vatCents: Math.round(apiInvoice.vat * 100),
    totalCents: Math.round(apiInvoice.total * 100),
    amountPaidCents: Math.round(apiInvoice.amount_paid * 100),
    status: apiInvoice.status as InvoiceStatus,
    deliveryStatus: apiInvoice.delivery_status as 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | null,
    createdAt: new Date(apiInvoice.created_at),
    updatedAt: new Date(apiInvoice.updated_at),
    // Transform lines - use child ID from invoice (each invoice is for a single child)
    lines: apiInvoice.lines.map((line) => ({
      id: line.id,
      invoiceId: apiInvoice.id,
      childId: apiInvoice.child.id, // Required by IInvoiceLine
      description: line.description,
      quantity: line.quantity,
      unitAmount: Math.round(line.unit_price * 100), // Convert to cents
      lineAmount: Math.round(line.subtotal * 100),
      vatAmount: Math.round(line.vat * 100),
      accountCode: line.account_code ?? '', // Required string field
      // TASK-BILL-038: VAT compliance fields
      lineType: line.line_type,
    })),
  };
}

// Transform API response to frontend format
function transformInvoice(apiInvoice: ApiInvoiceResponse): InvoiceWithLines {
  return {
    id: apiInvoice.id,
    tenantId: '',
    invoiceNumber: apiInvoice.invoice_number,
    parentId: apiInvoice.parent.id,
    parentName: apiInvoice.parent.name,
    childId: apiInvoice.child.id,
    childName: apiInvoice.child.name,
    billingPeriodStart: new Date(apiInvoice.billing_period_start),
    billingPeriodEnd: new Date(apiInvoice.billing_period_end),
    issueDate: new Date(apiInvoice.issue_date),
    dueDate: new Date(apiInvoice.due_date),
    // Required IInvoice fields (in Rands)
    subtotal: apiInvoice.subtotal,
    vatAmount: apiInvoice.vat,
    total: apiInvoice.total,
    amountPaid: apiInvoice.amount_paid,
    amountDue: apiInvoice.balance_due,
    // Additional cents fields for display
    subtotalCents: Math.round(apiInvoice.subtotal * 100),
    vatCents: Math.round(apiInvoice.vat * 100),
    totalCents: Math.round(apiInvoice.total * 100),
    amountPaidCents: Math.round(apiInvoice.amount_paid * 100),
    status: apiInvoice.status as InvoiceStatus,
    deliveryStatus: apiInvoice.delivery_status as 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | null,
    createdAt: new Date(apiInvoice.created_at),
    updatedAt: new Date(apiInvoice.created_at),
    lines: [], // Lines not included in list view
  };
}

// List invoices with pagination and filters
export function useInvoicesList(params?: InvoiceListParams) {
  return useQuery<InvoicesListResponse, AxiosError>({
    queryKey: queryKeys.invoices.list(params),
    queryFn: async () => {
      // Transform camelCase params to snake_case for API
      const apiParams: Record<string, string | number | undefined> = {};
      if (params?.page) apiParams.page = params.page;
      if (params?.limit) apiParams.limit = params.limit;
      if (params?.status) apiParams.status = params.status;
      if (params?.parentId) apiParams.parent_id = params.parentId;
      if (params?.childId) apiParams.child_id = params.childId;
      if (params?.startDate) apiParams.date_from = params.startDate;
      if (params?.endDate) apiParams.date_to = params.endDate;

      const { data } = await apiClient.get<ApiListResponse>(endpoints.invoices.list, {
        params: apiParams,
      });

      // Transform API response to frontend format
      return {
        invoices: data.data.map(transformInvoice),
        total: data.meta.total,
        page: data.meta.page,
        limit: data.meta.limit,
      };
    },
  });
}

// Get single invoice detail
export function useInvoice(id: string, enabled = true) {
  return useQuery<InvoiceWithLines, AxiosError>({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiDetailResponse>(endpoints.invoices.detail(id));

      if (!data.success) {
        throw new Error('Failed to load invoice');
      }

      // Transform API response to frontend format
      return transformInvoiceDetail(data.data);
    },
    enabled: enabled && !!id,
  });
}

// Generate invoices for a billing period
export function useGenerateInvoices() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; count: number }, AxiosError, GenerateInvoicesParams>({
    mutationFn: async ({ month, year, childIds }) => {
      // API expects billing_month in YYYY-MM format and child_ids (snake_case)
      const billingMonth = `${year}-${String(month).padStart(2, '0')}`;
      const { data } = await apiClient.post<{ success: boolean; count: number }>(
        endpoints.invoices.generate,
        {
          billing_month: billingMonth,
          child_ids: childIds,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

// Send invoices to parents
export function useSendInvoices() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; sent: number; failed: number },
    AxiosError,
    SendInvoicesParams
  >({
    mutationFn: async ({ invoiceIds, method }) => {
      // Map frontend params to snake_case API format
      const deliveryMethod = method === 'email' ? 'EMAIL' : method === 'whatsapp' ? 'WHATSAPP' : 'BOTH';
      const { data } = await apiClient.post<{ success: boolean; data: { sent: number; failed: number } }>(
        endpoints.invoices.send,
        {
          invoice_ids: invoiceIds,
          delivery_method: deliveryMethod,
        }
      );
      return { success: data.success, sent: data.data.sent, failed: data.data.failed };
    },
    onSuccess: (_, variables) => {
      // Invalidate specific invoices that were sent
      variables.invoiceIds.forEach((id) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
    },
  });
}

/**
 * Download invoice PDF
 * TASK-UI-001: Uses Bearer token from NextAuth session for authentication
 */
export function useDownloadInvoicePdf() {
  const downloadPdf = async (invoiceId: string, invoiceNumber: string): Promise<void> => {
    // Get auth token from NextAuth session (same method as apiClient)
    const { getSession } = await import('next-auth/react');
    const session = await getSession();

    const headers: HeadersInit = {};
    if (session?.accessToken) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
    }

    const response = await fetch(
      `${apiClient.defaults.baseURL}${endpoints.invoices.pdf(invoiceId)}`,
      {
        method: 'GET',
        credentials: 'include', // Fallback for HttpOnly cookies
        headers,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required. Please log in.');
      }
      let errorMessage = `Failed to download PDF: ${response.status}`;
      try {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
      } catch {
        // If response is not JSON, use default error message
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return { downloadPdf };
}

/**
 * Delete invoice mutation hook
 * TASK-FIX-003: Invoice Deletion Handler
 */
export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, AxiosError, string>({
    mutationFn: async (invoiceId: string) => {
      const { data } = await apiClient.delete<{ success: boolean }>(
        endpoints.invoices.detail(invoiceId),
      );
      return data;
    },
    onSuccess: () => {
      // Invalidate invoice lists to refresh the table
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.lists() });
      // Also invalidate dashboard as it may show invoice counts
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}
