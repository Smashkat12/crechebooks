import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types for API responses
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

// List arrears with pagination and filters
export function useArrearsList(params?: ArrearsListParams) {
  return useQuery<ArrearsListResponse, AxiosError>({
    queryKey: queryKeys.arrears.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ArrearsListResponse>(endpoints.arrears.list, {
        params,
      });
      return data;
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
