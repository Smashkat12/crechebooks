import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

export type FeeType = 'FULL_DAY';

export interface FeeStructure {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  fee_type: FeeType;
  amount_cents: number;
  amount: number;
  registration_fee_cents: number;
  registration_fee: number;
  re_registration_fee_cents: number;
  re_registration_fee: number;
  vat_inclusive: boolean;
  sibling_discount_percent: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FeeStructuresResponse {
  fee_structures: FeeStructure[];
  total: number;
}

interface CreateFeeStructureParams {
  name: string;
  description?: string;
  fee_type: FeeType;
  amount: number;
  registration_fee?: number;
  re_registration_fee?: number;
  vat_inclusive?: boolean;
  sibling_discount_percent?: number;
  effective_from: string;
  effective_to?: string;
}

// List fee structures
export function useFeeStructures() {
  return useQuery<FeeStructuresResponse, AxiosError>({
    queryKey: queryKeys.feeStructures.list(),
    queryFn: async () => {
      const { data } = await apiClient.get<FeeStructuresResponse>(
        endpoints.feeStructures.list
      );
      return data;
    },
  });
}

// Create fee structure
export function useCreateFeeStructure() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; data: FeeStructure },
    AxiosError,
    CreateFeeStructureParams
  >({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<{ success: boolean; data: FeeStructure }>(
        endpoints.feeStructures.list,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeStructures.all });
    },
  });
}

// Delete fee structure
export function useDeleteFeeStructure() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, AxiosError, string>({
    mutationFn: async (id) => {
      const { data } = await apiClient.delete<{ success: boolean }>(
        endpoints.feeStructures.detail(id)
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeStructures.all });
    },
  });
}
