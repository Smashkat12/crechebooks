/**
 * Enrollment Hooks
 * REQ-BILL-009: Enrollment Register UI
 *
 * @description React hooks for enrollment management using children API endpoints
 * Enrollments are accessed via /children endpoint which returns enrollment data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import { EnrollmentStatus } from '@crechebooks/types';

// Types for enrollment data (from children API)
export interface EnrollmentChild {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  parent: {
    id: string;
    name: string;
    email: string;
  };
  enrollment_status: EnrollmentStatus | null;
}

export interface EnrollmentDetail {
  id: string;
  fee_structure: {
    id: string;
    name: string;
    amount: number; // In Rand
  };
  start_date: string;
  end_date?: string;
  status: EnrollmentStatus;
}

export interface ChildWithEnrollment {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  parent: {
    id: string;
    name: string;
    email: string;
  };
  current_enrollment: EnrollmentDetail | null;
}

interface EnrollmentsListResponse {
  success: boolean;
  data: EnrollmentChild[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ChildDetailResponse {
  success: boolean;
  data: ChildWithEnrollment;
}

interface EnrollmentsListParams {
  page?: number;
  limit?: number;
  parent_id?: string;
  enrollment_status?: EnrollmentStatus;
  search?: string;
}

/**
 * Hook to fetch list of children with enrollment status
 * Uses /children endpoint which includes enrollment_status
 */
export function useEnrollmentsList(params?: EnrollmentsListParams) {
  return useQuery<EnrollmentsListResponse, AxiosError>({
    queryKey: ['enrollments', 'list', params],
    queryFn: async () => {
      const { data } = await apiClient.get<EnrollmentsListResponse>(
        endpoints.children.list,
        { params }
      );
      return data;
    },
  });
}

/**
 * Hook to fetch single child with full enrollment details
 * Uses /children/:id endpoint which includes current_enrollment
 */
export function useEnrollmentDetail(childId: string, enabled = true) {
  return useQuery<ChildWithEnrollment, AxiosError>({
    queryKey: ['enrollments', 'detail', childId],
    queryFn: async () => {
      const { data } = await apiClient.get<ChildDetailResponse>(
        endpoints.children.detail(childId)
      );
      return data.data;
    },
    enabled: enabled && !!childId,
  });
}

/**
 * Hook to enroll a new child
 * Uses POST /children endpoint
 */
export function useEnrollChild() {
  const queryClient = useQueryClient();

  return useMutation<
    ChildDetailResponse,
    AxiosError,
    {
      parent_id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string;
      fee_structure_id: string;
      start_date: string;
      gender?: string;
      medical_notes?: string;
      emergency_contact?: string;
      emergency_phone?: string;
    }
  >({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<ChildDetailResponse>(
        endpoints.children.list,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.children.all });
    },
  });
}
