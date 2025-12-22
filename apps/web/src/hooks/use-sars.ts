import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { ISarsSubmission } from '@crechebooks/types';

// Types for API responses
interface VAT201Response {
  period: string;
  totalSales: number;
  totalPurchases: number;
  outputVat: number;
  inputVat: number;
  netVat: number;
  transactions: {
    id: string;
    description: string;
    amount: number;
    vat: number;
    category: string;
  }[];
}

interface EMP201Response {
  period: string;
  totalPaye: number;
  totalUif: number;
  totalSdl: number;
  employees: {
    id: string;
    name: string;
    paye: number;
    uif: number;
    sdl: number;
  }[];
}

interface SubmissionResponse {
  success: boolean;
  submissionId: string;
  reference: string;
}

interface SubmitSarsParams {
  submissionId: string;
  type: 'vat201' | 'emp201';
}

// Get VAT201 data for a period
export function useVAT201(period: string, enabled = true) {
  return useQuery<VAT201Response, AxiosError>({
    queryKey: queryKeys.sars.vat201(period),
    queryFn: async () => {
      const { data } = await apiClient.get<VAT201Response>(endpoints.sars.vat201, {
        params: { period },
      });
      return data;
    },
    enabled: enabled && !!period,
  });
}

// Get EMP201 data for a period
export function useEMP201(period: string, enabled = true) {
  return useQuery<EMP201Response, AxiosError>({
    queryKey: queryKeys.sars.emp201(period),
    queryFn: async () => {
      const { data } = await apiClient.get<EMP201Response>(endpoints.sars.emp201, {
        params: { period },
      });
      return data;
    },
    enabled: enabled && !!period,
  });
}

// Get SARS submission history
export function useSarsSubmissions() {
  return useQuery<ISarsSubmission[], AxiosError>({
    queryKey: queryKeys.sars.submissions(),
    queryFn: async () => {
      const { data } = await apiClient.get<ISarsSubmission[]>(endpoints.sars.submissions);
      return data;
    },
  });
}

// Submit SARS return
export function useSubmitSars() {
  const queryClient = useQueryClient();

  return useMutation<SubmissionResponse, AxiosError, SubmitSarsParams>({
    mutationFn: async ({ submissionId, type }) => {
      const { data } = await apiClient.post<SubmissionResponse>(
        endpoints.sars.submit(submissionId),
        {
          type,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sars.all });
    },
  });
}
