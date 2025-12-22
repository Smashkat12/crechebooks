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

// API response types (snake_case from backend)
interface ApiArrearsItem {
  id: string;
  parent_id: string;
  parent_name: string;
  child_id: string;
  child_name: string;
  total_outstanding: number;
  oldest_invoice_date: string;
  days_past_due: number;
  invoice_count: number;
  last_payment_date?: string;
  contact_email?: string;
  contact_phone?: string;
}

interface ApiArrearsListResponse {
  success: boolean;
  arrears: ApiArrearsItem[];
  total: number;
  page: number;
  limit: number;
}

// Transform API response to frontend format
function transformArrearsItem(api: ApiArrearsItem): ArrearsItem {
  return {
    id: api.id,
    parentId: api.parent_id,
    parentName: api.parent_name,
    childId: api.child_id,
    childName: api.child_name,
    totalOutstanding: api.total_outstanding,
    oldestInvoiceDate: api.oldest_invoice_date,
    daysPastDue: api.days_past_due,
    invoiceCount: api.invoice_count,
    lastPaymentDate: api.last_payment_date,
    contactEmail: api.contact_email,
    contactPhone: api.contact_phone,
  };
}

// List arrears with pagination and filters
export function useArrearsList(params?: ArrearsListParams) {
  return useQuery<ArrearsListResponse, AxiosError>({
    queryKey: queryKeys.arrears.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiArrearsListResponse>(endpoints.arrears.list, {
        params,
      });
      return {
        arrears: data.arrears.map(transformArrearsItem),
        total: data.total,
        page: data.page,
        limit: data.limit,
      };
    },
  });
}

// Get arrears summary
export function useArrearsSummary() {
  return useQuery<ArrearsSummary, AxiosError>({
    queryKey: queryKeys.arrears.summary(),
    queryFn: async () => {
      const { data } = await apiClient.get<ArrearsSummary>(endpoints.arrears.summary);
      return data;
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
