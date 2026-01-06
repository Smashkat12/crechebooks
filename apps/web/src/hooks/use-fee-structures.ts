import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

export type FeeType = 'FULL_DAY' | 'HALF_DAY' | 'HOURLY' | 'CUSTOM';

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

// Get single fee structure
export function useFeeStructure(id: string, enabled = true) {
  return useQuery<FeeStructure, AxiosError>({
    queryKey: queryKeys.feeStructures.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<FeeStructure>(
        endpoints.feeStructures.detail(id)
      );
      return data;
    },
    enabled: enabled && !!id,
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

// Update fee structure
export function useUpdateFeeStructure() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; data: FeeStructure },
    AxiosError,
    { id: string } & Partial<CreateFeeStructureParams>
  >({
    mutationFn: async ({ id, ...params }) => {
      const { data } = await apiClient.put<{ success: boolean; data: FeeStructure }>(
        endpoints.feeStructures.detail(id),
        params
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feeStructures.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.feeStructures.detail(variables.id),
      });
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
