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
  status: 'active' | 'inactive' | 'pending' | 'graduated' | 'withdrawn';
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

export interface BulkGraduateParams {
  enrollmentIds: string[];
  endDate: string; // ISO date string (YYYY-MM-DD)
}

export interface BulkGraduateResponse {
  graduated: number;
  skipped: number;
}

// Year-End Review Types (TASK-ENROL-004)
export interface YearEndStudent {
  enrollmentId: string;
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  dateOfBirth: string;
  ageOnJan1: number;
  category: 'continuing' | 'graduating' | 'withdrawing';
  graduationCandidate: boolean;
  currentStatus: string;
  accountBalance: number; // cents
  feeTierName: string;
  feeStructureId: string;
}

export interface YearEndReviewResult {
  academicYear: number;
  reviewPeriod: { start: string; end: string };
  students: {
    continuing: YearEndStudent[];
    graduating: YearEndStudent[];
    withdrawing: YearEndStudent[];
  };
  summary: {
    totalActive: number;
    continuingCount: number;
    graduatingCount: number;
    withdrawingCount: number;
    graduationCandidates: number;
    totalOutstanding: number;
    totalCredit: number;
  };
}

// Enrollment endpoints
export const enrollmentEndpoints = {
  list: '/enrollments',
  detail: (id: string) => `/enrollments/${id}`,
  updateStatus: (id: string) => `/enrollments/${id}/status`,
  bulkUpdateStatus: '/enrollments/bulk/status',
  bulkGraduate: '/enrollments/bulk/graduate',
  export: '/enrollments/export',
  yearEndReview: '/enrollments/year-end/review',
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

// Bulk graduate enrollments (year-end processing)
export async function bulkGraduateEnrollments({ enrollmentIds, endDate }: BulkGraduateParams): Promise<BulkGraduateResponse> {
  const { data } = await apiClient.post<{ success: boolean; graduated: number; skipped: number }>(
    enrollmentEndpoints.bulkGraduate,
    { enrollment_ids: enrollmentIds, end_date: endDate }
  );
  return { graduated: data.graduated, skipped: data.skipped };
}

// Get year-end review data (TASK-ENROL-004)
export async function getYearEndReview(year?: number): Promise<YearEndReviewResult> {
  const params = year ? { year } : undefined;
  const { data } = await apiClient.get<{ success: boolean; data: YearEndReviewResult }>(
    enrollmentEndpoints.yearEndReview,
    { params }
  );
  return data.data;
}

// Off-Boarding Types (TASK-ENROL-005)
export interface AccountSettlement {
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  outstandingBalance: number; // cents
  proRataCredit: number; // cents
  netAmount: number; // cents (positive = owes, negative = credit)
  invoices: {
    id: string;
    invoiceNumber: string;
    totalCents: number;
    paidCents: number;
    status: string;
  }[];
}

export interface OffboardingResult {
  enrollmentId: string;
  status: 'GRADUATED' | 'WITHDRAWN';
  endDate: string;
  settlement: AccountSettlement;
  creditAction: 'applied' | 'refunded' | 'donated' | 'sibling' | 'none';
  creditAmount: number;
  finalStatementId: string | null;
}

export type CreditAction = 'apply' | 'refund' | 'donate' | 'sibling' | 'none';
export type OffboardingReason = 'GRADUATION' | 'WITHDRAWAL';

export interface InitiateOffboardingParams {
  enrollmentId: string;
  endDate: string; // ISO date string (YYYY-MM-DD)
  reason: OffboardingReason;
  creditAction: CreditAction;
  siblingEnrollmentId?: string;
}

// Off-boarding endpoints
export const offboardingEndpoints = {
  settlementPreview: (id: string) => `/enrollments/${id}/settlement-preview`,
  offboard: (id: string) => `/enrollments/${id}/offboard`,
};

// Get settlement preview (TASK-ENROL-005)
export async function getSettlementPreview(enrollmentId: string, endDate: string): Promise<AccountSettlement> {
  const { data } = await apiClient.get<{ success: boolean; data: AccountSettlement }>(
    offboardingEndpoints.settlementPreview(enrollmentId),
    { params: { end_date: endDate } }
  );
  return data.data;
}

// Initiate off-boarding (TASK-ENROL-005)
export async function initiateOffboarding(params: InitiateOffboardingParams): Promise<OffboardingResult> {
  const { enrollmentId, endDate, reason, creditAction, siblingEnrollmentId } = params;
  const { data } = await apiClient.post<{ success: boolean; data: OffboardingResult }>(
    offboardingEndpoints.offboard(enrollmentId),
    {
      end_date: endDate,
      reason,
      credit_action: creditAction,
      sibling_enrollment_id: siblingEnrollmentId,
    }
  );
  return data.data;
}
