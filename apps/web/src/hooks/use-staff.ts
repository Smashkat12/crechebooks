import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IStaff, IPayrollPeriod } from '@crechebooks/types';
import { StaffStatus } from '@crechebooks/types';

// API response type (snake_case from backend)
interface ApiStaffResponse {
  id: string;
  tenant_id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  id_number: string;
  tax_number: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string;
  start_date: string;
  end_date: string | null;
  employment_type: string;
  pay_frequency: string;
  basic_salary_cents: number;
  bank_name: string | null;
  bank_account: string | null;
  bank_branch_code: string | null;
  medical_aid_members: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ApiStaffListResponse {
  staff: ApiStaffResponse[];
  total: number;
  page: number;
  limit: number;
}

// Transform API response to frontend format (camelCase)
function transformStaff(apiStaff: ApiStaffResponse): IStaff {
  return {
    id: apiStaff.id,
    tenantId: apiStaff.tenant_id,
    employeeNumber: apiStaff.employee_number || '',
    firstName: apiStaff.first_name,
    lastName: apiStaff.last_name,
    idNumber: apiStaff.id_number,
    taxNumber: apiStaff.tax_number || undefined,
    email: apiStaff.email || undefined,
    phone: apiStaff.phone || undefined,
    dateOfBirth: new Date(apiStaff.date_of_birth),
    startDate: new Date(apiStaff.start_date),
    endDate: apiStaff.end_date ? new Date(apiStaff.end_date) : undefined,
    employmentType: apiStaff.employment_type as 'PERMANENT' | 'CONTRACT' | 'PART_TIME',
    payFrequency: apiStaff.pay_frequency as 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY',
    basicSalaryCents: apiStaff.basic_salary_cents,
    bankName: apiStaff.bank_name || undefined,
    bankAccount: apiStaff.bank_account || undefined,
    bankBranchCode: apiStaff.bank_branch_code || undefined,
    medicalAidMembers: apiStaff.medical_aid_members,
    isActive: apiStaff.is_active,
    // Derive status from is_active for UI components
    status: apiStaff.is_active ? StaffStatus.ACTIVE : StaffStatus.INACTIVE,
    // Alias for staff table component (expects 'salary' in cents)
    salary: apiStaff.basic_salary_cents,
    createdAt: new Date(apiStaff.created_at),
    updatedAt: new Date(apiStaff.updated_at),
  };
}

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
  staffIds: string[];
}

interface ProcessPayrollResult {
  success: boolean;
  count: number;
  payrollIds: string[];
  errors?: Array<{
    staffId: string;
    error: string;
  }>;
}

interface CreateStaffParams {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  idNumber: string;
  dateOfBirth: Date;
  startDate: Date;
  endDate?: Date;
  salary: number; // in cents
  employmentType?: 'PERMANENT' | 'CONTRACT' | 'PART_TIME';
  payFrequency?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';
  position?: string;
  department?: string;
}

// List staff with pagination and filters
export function useStaffList(params?: StaffListParams) {
  return useQuery<StaffListResponse, AxiosError>({
    queryKey: queryKeys.staff.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiStaffListResponse>(endpoints.staff.list, {
        params,
      });
      // Transform snake_case API response to camelCase
      return {
        staff: data.staff.map(transformStaff),
        total: data.total,
        page: data.page,
        limit: data.limit,
      };
    },
  });
}

// Get single staff member detail
export function useStaff(id: string, enabled = true) {
  return useQuery<IStaff, AxiosError>({
    queryKey: queryKeys.staff.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiStaffResponse>(endpoints.staff.detail(id));
      return transformStaff(data);
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

// Create a new staff member
export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation<IStaff, AxiosError, CreateStaffParams>({
    mutationFn: async (params) => {
      const payload: Record<string, unknown> = {
        first_name: params.firstName,
        last_name: params.lastName,
        email: params.email,
        id_number: params.idNumber,
        date_of_birth: params.dateOfBirth.toISOString().split('T')[0],
        start_date: params.startDate.toISOString().split('T')[0],
        salary: params.salary,
      };

      // Only add optional fields if they have values
      if (params.phone) {
        payload.phone = params.phone;
      }
      if (params.endDate) {
        payload.end_date = params.endDate.toISOString().split('T')[0];
      }
      if (params.employmentType) {
        payload.employment_type = params.employmentType;
      }
      if (params.payFrequency) {
        payload.pay_frequency = params.payFrequency;
      }
      if (params.position) {
        payload.position = params.position;
      }
      if (params.department) {
        payload.department = params.department;
      }

      const { data } = await apiClient.post<IStaff>(endpoints.staff.list, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}

// Process payroll for a period
// TASK-PAY-021: Enhanced with partial failure support
export function useProcessPayroll() {
  const queryClient = useQueryClient();

  return useMutation<ProcessPayrollResult, AxiosError, ProcessPayrollParams>({
    mutationFn: async ({ month, year, staffIds }) => {
      const { data } = await apiClient.post<ProcessPayrollResult>(
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
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}

// Resend onboarding email with magic link
export function useResendOnboardingEmail() {
  return useMutation<{ success: boolean; message: string }, AxiosError, string>({
    mutationFn: async (staffId) => {
      const { data } = await apiClient.post<{ success: boolean; message: string }>(
        `${endpoints.staff.detail(staffId)}/resend-onboarding-email`
      );
      return data;
    },
  });
}
