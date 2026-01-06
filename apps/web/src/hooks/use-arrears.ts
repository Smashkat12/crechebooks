import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types for frontend (camelCase)
interface ArrearsItem {
  id: string;
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  totalOutstanding: number;
  oldestInvoiceDate: string;
  daysPastDue: number;
  invoiceCount: number;
  lastPaymentDate?: string;
  contactEmail?: string;
  contactPhone?: string;
}

interface ArrearsListResponse {
  arrears: ArrearsItem[];
  total: number;
  page: number;
  limit: number;
}

interface ArrearsSummary {
  totalOutstanding: number;
  totalAccounts: number;
  byAgeBucket: {
    current: number;
    days30: number;
    days60: number;
    days90: number;
    days90Plus: number;
  };
  trend: {
    previousMonth: number;
    change: number;
    changePercent: number;
  };
}

interface ArrearsListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  minDays?: number;
  minAmount?: number;
  parentId?: string;
}

interface SendReminderParams {
  parentIds: string[];
  method: 'email' | 'whatsapp' | 'both';
  template?: string;
}

// API response types (snake_case from backend) - matches /payments/arrears endpoint
interface ApiArrearsInvoice {
  invoice_id: string;
  invoice_number: string;
  parent_id: string;
  parent_name: string;
  child_id: string;
  child_name: string;
  issue_date: string;
  due_date: string;
  total: number;
  amount_paid: number;
  outstanding: number;
  days_overdue: number;
  aging_bucket: string;
}

interface ApiTopDebtor {
  parent_id: string;
  parent_name: string;
  email?: string;
  phone?: string;
  total_outstanding: number;
  oldest_invoice_date: string;
  invoice_count: number;
  max_days_overdue: number;
}

interface ApiArrearsResponse {
  success: boolean;
  data: {
    summary: {
      total_outstanding: number;
      total_invoices: number;
      aging: {
        current: number;
        days_30: number;
        days_60: number;
        days_90_plus: number;
      };
    };
    top_debtors: ApiTopDebtor[];
    invoices: ApiArrearsInvoice[];
    generated_at: string;
  };
}

// Transform API invoice to frontend ArrearsItem format
function transformInvoiceToArrearsItem(inv: ApiArrearsInvoice): ArrearsItem {
  return {
    id: inv.invoice_id,
    parentId: inv.parent_id,
    parentName: inv.parent_name,
    childId: inv.child_id,
    childName: inv.child_name,
    totalOutstanding: inv.outstanding, // Already in cents from API
    oldestInvoiceDate: inv.due_date,
    daysPastDue: inv.days_overdue,
    invoiceCount: 1,
    contactEmail: undefined,
    contactPhone: undefined,
  };
}

// List arrears with pagination and filters
export function useArrearsList(params?: ArrearsListParams) {
  return useQuery<ArrearsListResponse, AxiosError>({
    queryKey: queryKeys.arrears.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiArrearsResponse>(endpoints.arrears.list, {
        params: {
          date_from: params?.minDays ? undefined : undefined,
          min_amount: params?.minAmount,
          parent_id: params?.parentId,
        },
      });

      // Transform invoices to ArrearsItem format
      const arrears = data.data.invoices.map(transformInvoiceToArrearsItem);

      // Apply client-side pagination if needed
      const page = params?.page ?? 1;
      const limit = params?.limit ?? 20;
      const startIndex = (page - 1) * limit;
      const paginatedArrears = arrears.slice(startIndex, startIndex + limit);

      return {
        arrears: paginatedArrears,
        total: arrears.length,
        page,
        limit,
      };
    },
  });
}

// Get arrears summary - transforms API response to match ArrearsSummary interface
export function useArrearsSummary() {
  return useQuery<ArrearsSummary, AxiosError>({
    queryKey: queryKeys.arrears.summary(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiArrearsResponse>(endpoints.arrears.summary);

      // Transform API summary to frontend format
      // API returns values in cents, no conversion needed
      const apiSummary = data.data.summary;

      return {
        totalOutstanding: apiSummary.total_outstanding,
        totalAccounts: apiSummary.total_invoices,
        byAgeBucket: {
          current: apiSummary.aging.current,
          days30: apiSummary.aging.days_30,
          days60: apiSummary.aging.days_60,
          days90: 0, // Not provided separately, included in days90Plus
          days90Plus: apiSummary.aging.days_90_plus,
        },
        trend: {
          previousMonth: 0, // Not calculated by API
          change: 0,
          changePercent: 0,
        },
      };
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

// Send payment reminders
export function useSendReminder() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; sent: number; failed: number },
    AxiosError,
    SendReminderParams
  >({
    mutationFn: async ({ parentIds, method, template }) => {
      const { data } = await apiClient.post<{ success: boolean; sent: number; failed: number }>(
        endpoints.arrears.sendReminder,
        {
          parentIds,
          method,
          template,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.arrears.all });
    },
  });
}
