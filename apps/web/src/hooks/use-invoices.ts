import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IInvoice, IInvoiceLine } from '@crechebooks/types';

// Types for API responses
interface InvoiceWithLines extends IInvoice {
  lines: IInvoiceLine[];
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

      const { data } = await apiClient.get<InvoicesListResponse>(endpoints.invoices.list, {
        params: apiParams,
      });
      return data;
    },
  });
}

// Get single invoice detail
export function useInvoice(id: string, enabled = true) {
  return useQuery<InvoiceWithLines, AxiosError>({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<InvoiceWithLines>(endpoints.invoices.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Generate invoices for a billing period
export function useGenerateInvoices() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; count: number }, AxiosError, GenerateInvoicesParams>({
    mutationFn: async ({ month, year, childIds }) => {
      const { data } = await apiClient.post<{ success: boolean; count: number }>(
        endpoints.invoices.generate,
        {
          month,
          year,
          childIds,
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
      const { data } = await apiClient.post<{ success: boolean; sent: number; failed: number }>(
        endpoints.invoices.send,
        {
          invoiceIds,
          method,
        }
      );
      return data;
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
