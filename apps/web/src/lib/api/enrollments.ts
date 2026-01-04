/**
 * Enrollment API Client
 *
 * API functions for enrollment management:
 * - List enrollments with filters
 * - Update enrollment status
 * - Bulk operations
 */

import { apiClient } from './client';

export interface Enrollment {
  id: string;
  child_id: string;
  child_name: string;
  parent_id: string;
  parent_name: string;
  fee_tier_id: string;
  fee_tier_name: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'inactive' | 'pending';
  created_at: string;
  updated_at: string;
}

export interface EnrollmentListParams {
  page?: number;
  limit?: number;
  status?: string;
  feeTierId?: string;
  search?: string;
}

export interface EnrollmentListResponse {
  enrollments: Enrollment[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateEnrollmentStatusParams {
  enrollmentId: string;
  status: 'active' | 'inactive' | 'pending';
}

export interface BulkUpdateStatusParams {
  enrollmentIds: string[];
  status: 'active' | 'inactive' | 'pending';
}

// Enrollment endpoints
export const enrollmentEndpoints = {
  list: '/enrollments',
  detail: (id: string) => `/enrollments/${id}`,
  updateStatus: (id: string) => `/enrollments/${id}/status`,
  bulkUpdateStatus: '/enrollments/bulk/status',
  export: '/enrollments/export',
};

// List enrollments with filters
export async function listEnrollments(params?: EnrollmentListParams): Promise<EnrollmentListResponse> {
  const { data } = await apiClient.get<{
    success: boolean;
    data: Enrollment[];
    meta: { page: number; limit: number; total: number };
  }>(enrollmentEndpoints.list, { params });

  return {
    enrollments: data.data,
    total: data.meta.total,
    page: data.meta.page,
    limit: data.meta.limit,
  };
}

// Update enrollment status
export async function updateEnrollmentStatus({ enrollmentId, status }: UpdateEnrollmentStatusParams): Promise<Enrollment> {
  const { data } = await apiClient.patch<{ success: boolean; data: Enrollment }>(
    enrollmentEndpoints.updateStatus(enrollmentId),
    { status }
  );
  return data.data;
}

// Bulk update enrollment statuses
export async function bulkUpdateEnrollmentStatus({ enrollmentIds, status }: BulkUpdateStatusParams): Promise<{ count: number }> {
  const { data } = await apiClient.post<{ success: boolean; count: number }>(
    enrollmentEndpoints.bulkUpdateStatus,
    { enrollment_ids: enrollmentIds, status }
  );
  return { count: data.count };
}

// Export enrollments to CSV
export async function exportEnrollments(params?: EnrollmentListParams): Promise<string> {
  const { data } = await apiClient.get<string>(enrollmentEndpoints.export, {
    params,
    responseType: 'text',
  });
  return data;
}
