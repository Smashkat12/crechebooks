import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IParent, IChild } from '@crechebooks/types';

// Types for API responses
interface ParentsListResponse {
  parents: IParent[];
  total: number;
  page: number;
  limit: number;
}

interface ParentWithChildren extends IParent {
  children: IChild[];
}

interface ParentListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'inactive';
}

interface EnrollChildParams {
  parentId: string;
  childId: string;
  feeStructureId: string;
  startDate: string;
  endDate?: string;
}

// List parents with pagination and filters
export function useParentsList(params?: ParentListParams) {
  return useQuery<ParentsListResponse, AxiosError>({
    queryKey: queryKeys.parents.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ParentsListResponse>(endpoints.parents.list, {
        params,
      });
      return data;
    },
  });
}

// Get single parent detail
export function useParent(id: string, enabled = true) {
  return useQuery<ParentWithChildren, AxiosError>({
    queryKey: queryKeys.parents.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ParentWithChildren>(endpoints.parents.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Get children for a parent
export function useParentChildren(parentId: string, enabled = true) {
  return useQuery<IChild[], AxiosError>({
    queryKey: queryKeys.parents.children(parentId),
    queryFn: async () => {
      const { data } = await apiClient.get<IChild[]>(endpoints.parents.children(parentId));
      return data;
    },
    enabled: enabled && !!parentId,
  });
}

// Get single child detail
export function useChild(id: string, enabled = true) {
  return useQuery<IChild, AxiosError>({
    queryKey: queryKeys.children.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<IChild>(endpoints.children.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Create parent params
interface CreateParentParams {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  whatsappNumber?: string;
  address?: string;
  preferredCommunication: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'BOTH';
}

// Create a new parent
export function useCreateParent() {
  const queryClient = useQueryClient();

  return useMutation<IParent, AxiosError, CreateParentParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<IParent>(endpoints.parents.list, {
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        phone: params.phone || null,
        whatsapp: params.whatsappNumber || null,
        address: params.address || null,
        preferredContact: params.preferredCommunication,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.list() });
    },
  });
}

// Enroll a child
export function useEnrollChild() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; enrollmentId: string }, AxiosError, EnrollChildParams>({
    mutationFn: async ({ parentId, childId, feeStructureId, startDate, endDate }) => {
      const { data } = await apiClient.post<{ success: boolean; enrollmentId: string }>(
        endpoints.children.enroll,
        {
          parentId,
          childId,
          feeStructureId,
          startDate,
          endDate,
        }
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.detail(variables.parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.children(variables.parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.children.detail(variables.childId) });
    },
  });
}

// Create child params (creates child AND enrolls them)
interface CreateChildParams {
  parentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  feeStructureId: string;
  startDate: string;
  medicalNotes?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

// Invoice summary in enrollment response (TASK-BILL-023)
interface EnrollmentInvoiceSummary {
  id: string;
  invoice_number: string;
  total: number;
  due_date: string;
  status: string;
}

interface CreateChildResponse {
  success: boolean;
  data: {
    child: { id: string; first_name: string; last_name: string };
    enrollment: {
      id: string;
      fee_structure: { id: string; name: string; amount: number };
      start_date: string;
      status: string;
    };
    invoice: EnrollmentInvoiceSummary | null;
  };
}

// Helper to convert SA phone numbers to E.164 format
function toE164(phone: string | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\s+/g, '').replace(/-/g, '');
  // SA number starting with 0 -> +27
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '+27' + cleaned.slice(1);
  }
  // Already has + prefix
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  // SA number without leading 0 (e.g., 27...)
  if (cleaned.startsWith('27') && cleaned.length === 11) {
    return '+' + cleaned;
  }
  return cleaned || null;
}

// Create a new child with enrollment
export function useCreateChild() {
  const queryClient = useQueryClient();

  return useMutation<CreateChildResponse, AxiosError, CreateChildParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<CreateChildResponse>(endpoints.children.list, {
        parent_id: params.parentId,
        first_name: params.firstName,
        last_name: params.lastName,
        date_of_birth: params.dateOfBirth,
        gender: params.gender || null,
        fee_structure_id: params.feeStructureId,
        start_date: params.startDate,
        medical_notes: params.medicalNotes || null,
        emergency_contact: params.emergencyContact || null,
        emergency_phone: toE164(params.emergencyPhone),
      });
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.detail(variables.parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.children(variables.parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.children.list() });
    },
  });
}

// Update parent params
interface UpdateParentParams {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  address?: string;
  preferredCommunication?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'BOTH';
}

// Update a parent
export function useUpdateParent() {
  const queryClient = useQueryClient();

  return useMutation<IParent, AxiosError, UpdateParentParams>({
    mutationFn: async ({ id, ...params }) => {
      const { data } = await apiClient.put<IParent>(endpoints.parents.detail(id), {
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        phone: params.phone || null,
        whatsapp: params.whatsappNumber || null,
        address: params.address || null,
        preferredContact: params.preferredCommunication,
      });
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.list() });
    },
  });
}
