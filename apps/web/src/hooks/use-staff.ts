import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IStaff, IPayrollPeriod } from '@crechebooks/types';

// Types for API responses
interface StaffListResponse {
  staff: IStaff[];
  total: number;
  page: number;
  limit: number;
}

interface StaffListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  status?: 'active' | 'inactive';
  role?: string;
}

interface PayrollListResponse {
  payrolls: IPayrollPeriod[];
  total: number;
  page: number;
  limit: number;
}

interface PayrollListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  staffId?: string;
  month?: number;
  year?: number;
}

interface ProcessPayrollParams {
  month: number;
  year: number;
  staffIds?: string[];
}

// List staff with pagination and filters
export function useStaffList(params?: StaffListParams) {
  return useQuery<StaffListResponse, AxiosError>({
    queryKey: queryKeys.staff.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<StaffListResponse>(endpoints.staff.list, {
        params,
      });
      return data;
    },
  });
}

// Get single staff member detail
export function useStaff(id: string, enabled = true) {
  return useQuery<IStaff, AxiosError>({
    queryKey: queryKeys.staff.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<IStaff>(endpoints.staff.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// List payroll records
export function usePayrollList(params?: PayrollListParams) {
  return useQuery<PayrollListResponse, AxiosError>({
    queryKey: queryKeys.payroll.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<PayrollListResponse>(endpoints.payroll.list, {
        params,
      });
      return data;
    },
  });
}

// Get single payroll detail
export function usePayroll(id: string, enabled = true) {
  return useQuery<IPayrollPeriod, AxiosError>({
    queryKey: queryKeys.payroll.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<IPayrollPeriod>(endpoints.payroll.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Process payroll for a period
export function useProcessPayroll() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; count: number }, AxiosError, ProcessPayrollParams>({
    mutationFn: async ({ month, year, staffIds }) => {
      const { data } = await apiClient.post<{ success: boolean; count: number }>(
        endpoints.payroll.process,
        {
          month,
          year,
          staffIds,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}
