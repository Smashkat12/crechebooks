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
  bulkGraduateEnrollments,
  getYearEndReview,
  type Enrollment,
  type EnrollmentListParams,
  type EnrollmentListResponse,
  type UpdateEnrollmentStatusParams,
  type BulkUpdateStatusParams,
  type BulkGraduateParams,
  type BulkGraduateResponse,
  type YearEndReviewResult,
} from '@/lib/api/enrollments';

// Query keys
const enrollmentKeys = {
  all: ['enrollments'] as const,
  lists: () => [...enrollmentKeys.all, 'list'] as const,
  list: (params?: EnrollmentListParams) => [...enrollmentKeys.lists(), params] as const,
  details: () => [...enrollmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...enrollmentKeys.details(), id] as const,
  yearEndReview: (year?: number) => [...enrollmentKeys.all, 'yearEndReview', year] as const,
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

// Bulk graduate enrollments (year-end processing)
export function useBulkGraduate() {
  const queryClient = useQueryClient();

  return useMutation<BulkGraduateResponse, AxiosError, BulkGraduateParams>({
    mutationFn: bulkGraduateEnrollments,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
    },
  });
}

// Get year-end review data (TASK-ENROL-004)
export function useYearEndReview(year?: number) {
  return useQuery<YearEndReviewResult, AxiosError>({
    queryKey: enrollmentKeys.yearEndReview(year),
    queryFn: () => getYearEndReview(year),
    staleTime: 60000, // 1 minute
  });
}

// Off-boarding hooks (TASK-ENROL-005)
import {
  getSettlementPreview,
  initiateOffboarding,
  type AccountSettlement,
  type OffboardingResult,
  type InitiateOffboardingParams,
} from '@/lib/api/enrollments';

// Settlement preview hook
export function useSettlementPreview(enrollmentId: string, endDate: string, enabled = true) {
  return useQuery<AccountSettlement, AxiosError>({
    queryKey: [...enrollmentKeys.detail(enrollmentId), 'settlement', endDate],
    queryFn: () => getSettlementPreview(enrollmentId, endDate),
    enabled: enabled && !!enrollmentId && !!endDate,
    staleTime: 30000, // 30 seconds
  });
}

// Initiate off-boarding mutation
export function useInitiateOffboarding() {
  const queryClient = useQueryClient();

  return useMutation<OffboardingResult, AxiosError, InitiateOffboardingParams>({
    mutationFn: initiateOffboarding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
    },
  });
}
