/**
 * Enrollment Hooks
 * TASK-BILL-019: Enrollment Register Dedicated View
 *
 * @description React Query hooks for enrollment management:
 * - List enrollments with filters
 * - Update enrollment status
 * - Bulk operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  listEnrollments,
  updateEnrollmentStatus,
  bulkUpdateEnrollmentStatus,
  type Enrollment,
  type EnrollmentListParams,
  type EnrollmentListResponse,
  type UpdateEnrollmentStatusParams,
  type BulkUpdateStatusParams,
} from '@/lib/api/enrollments';

// Query keys
const enrollmentKeys = {
  all: ['enrollments'] as const,
  lists: () => [...enrollmentKeys.all, 'list'] as const,
  list: (params?: EnrollmentListParams) => [...enrollmentKeys.lists(), params] as const,
  details: () => [...enrollmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...enrollmentKeys.details(), id] as const,
};

// List enrollments with filters
export function useEnrollments(params?: EnrollmentListParams) {
  return useQuery<EnrollmentListResponse, AxiosError>({
    queryKey: enrollmentKeys.list(params),
    queryFn: () => listEnrollments(params),
    staleTime: 30000, // 30 seconds
  });
}

// Update enrollment status
export function useUpdateEnrollmentStatus() {
  const queryClient = useQueryClient();

  return useMutation<Enrollment, AxiosError, UpdateEnrollmentStatusParams>({
    mutationFn: updateEnrollmentStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
    },
  });
}

// Bulk update enrollment statuses
export function useBulkUpdateEnrollmentStatus() {
  const queryClient = useQueryClient();

  return useMutation<{ count: number }, AxiosError, BulkUpdateStatusParams>({
    mutationFn: bulkUpdateEnrollmentStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
    },
  });
}
