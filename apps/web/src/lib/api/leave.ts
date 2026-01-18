/**
 * Leave API Client
 * TASK-WEB-050: Leave API endpoints and frontend hooks
 *
 * Provides API functions for leave management operations:
 * - getLeaveTypes: Get all leave types for the tenant
 * - getLeaveBalances: Get leave balances for a staff member
 * - getLeaveHistory: Get leave history for a staff member
 * - createLeaveRequest: Create a new leave request
 */

import { apiClient } from './client';

// API Response Types (snake_case from backend)
export interface ApiLeaveTypeResponse {
  id: number;
  name: string;
  accrual_type: string;
  accrual_rate: number;
  accrual_cap: number | null;
  carry_over_cap: number | null;
  units: 'days' | 'hours';
  requires_approval: boolean;
  is_active: boolean;
}

export interface ApiLeaveBalanceResponse {
  leave_type_id: number;
  leave_type_name: string;
  opening_balance: number;
  accrued: number;
  taken: number;
  pending: number;
  adjustment: number;
  current_balance: number;
  units: 'days' | 'hours';
}

export interface ApiLeaveRequestResponse {
  id: string;
  tenant_id: string;
  staff_id: string;
  leave_type_id: number;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  total_hours: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  simplepay_synced: boolean;
  simplepay_ids: string[];
  created_at: string;
  updated_at: string;
}

// Frontend Types (camelCase)
export interface LeaveType {
  id: number;
  name: string;
  accrualType: string;
  accrualRate: number;
  accrualCap: number | null;
  carryOverCap: number | null;
  units: 'days' | 'hours';
  requiresApproval: boolean;
  isActive: boolean;
}

export interface LeaveBalance {
  leaveTypeId: number;
  leaveTypeName: string;
  openingBalance: number;
  accrued: number;
  taken: number;
  pending: number;
  adjustment: number;
  currentBalance: number;
  units: 'days' | 'hours';
}

export interface LeaveRequest {
  id: string;
  tenantId: string;
  staffId: string;
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  totalHours: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  simplePaySynced: boolean;
  simplePayIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Request Types
export interface LeaveHistoryOptions {
  fromDate?: string;
  toDate?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  page?: number;
  limit?: number;
}

export interface CreateLeaveRequestBody {
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  totalHours: number;
  reason?: string;
}

// Transform functions
function transformLeaveType(apiType: ApiLeaveTypeResponse): LeaveType {
  return {
    id: apiType.id,
    name: apiType.name,
    accrualType: apiType.accrual_type,
    accrualRate: apiType.accrual_rate,
    accrualCap: apiType.accrual_cap,
    carryOverCap: apiType.carry_over_cap,
    units: apiType.units,
    requiresApproval: apiType.requires_approval,
    isActive: apiType.is_active,
  };
}

function transformLeaveBalance(apiBalance: ApiLeaveBalanceResponse): LeaveBalance {
  return {
    leaveTypeId: apiBalance.leave_type_id,
    leaveTypeName: apiBalance.leave_type_name,
    openingBalance: apiBalance.opening_balance,
    accrued: apiBalance.accrued,
    taken: apiBalance.taken,
    pending: apiBalance.pending,
    adjustment: apiBalance.adjustment,
    currentBalance: apiBalance.current_balance,
    units: apiBalance.units,
  };
}

function transformLeaveRequest(apiRequest: ApiLeaveRequestResponse): LeaveRequest {
  return {
    id: apiRequest.id,
    tenantId: apiRequest.tenant_id,
    staffId: apiRequest.staff_id,
    leaveTypeId: apiRequest.leave_type_id,
    leaveTypeName: apiRequest.leave_type_name,
    startDate: new Date(apiRequest.start_date),
    endDate: new Date(apiRequest.end_date),
    totalDays: apiRequest.total_days,
    totalHours: apiRequest.total_hours,
    reason: apiRequest.reason,
    status: apiRequest.status,
    approvedBy: apiRequest.approved_by,
    approvedAt: apiRequest.approved_at ? new Date(apiRequest.approved_at) : null,
    rejectedReason: apiRequest.rejected_reason,
    simplePaySynced: apiRequest.simplepay_synced,
    simplePayIds: apiRequest.simplepay_ids,
    createdAt: new Date(apiRequest.created_at),
    updatedAt: new Date(apiRequest.updated_at),
  };
}

// API Endpoints
const LEAVE_ENDPOINTS = {
  types: '/staff/leave/types',
  balances: (staffId: string) => `/staff/${staffId}/leave/balances`,
  history: (staffId: string) => `/staff/${staffId}/leave/history`,
  request: (staffId: string) => `/staff/${staffId}/leave/request`,
} as const;

/**
 * Leave API object with all leave management functions
 */
export const leaveApi = {
  /**
   * Get all available leave types for the tenant
   */
  async getLeaveTypes(): Promise<LeaveType[]> {
    const { data } = await apiClient.get<{ leave_types: ApiLeaveTypeResponse[] }>(
      LEAVE_ENDPOINTS.types,
    );
    return data.leave_types.map(transformLeaveType);
  },

  /**
   * Get leave balances for a specific staff member
   */
  async getLeaveBalances(staffId: string): Promise<LeaveBalance[]> {
    const { data } = await apiClient.get<{ balances: ApiLeaveBalanceResponse[] }>(
      LEAVE_ENDPOINTS.balances(staffId),
    );
    return data.balances.map(transformLeaveBalance);
  },

  /**
   * Get leave history (leave requests) for a specific staff member
   */
  async getLeaveHistory(
    staffId: string,
    options?: LeaveHistoryOptions,
  ): Promise<{
    leaveRequests: LeaveRequest[];
    total: number;
    page: number;
    limit: number;
  }> {
    const params: Record<string, string | number | undefined> = {};
    if (options?.fromDate) params.fromDate = options.fromDate;
    if (options?.toDate) params.toDate = options.toDate;
    if (options?.status) params.status = options.status;
    if (options?.page) params.page = options.page;
    if (options?.limit) params.limit = options.limit;

    const { data } = await apiClient.get<{
      leave_requests: ApiLeaveRequestResponse[];
      total: number;
      page: number;
      limit: number;
    }>(LEAVE_ENDPOINTS.history(staffId), { params });

    return {
      leaveRequests: data.leave_requests.map(transformLeaveRequest),
      total: data.total,
      page: data.page,
      limit: data.limit,
    };
  },

  /**
   * Create a new leave request for a staff member
   */
  async createLeaveRequest(
    staffId: string,
    body: CreateLeaveRequestBody,
  ): Promise<LeaveRequest> {
    // Transform camelCase to snake_case for API
    const apiBody = {
      leave_type_id: body.leaveTypeId,
      leave_type_name: body.leaveTypeName,
      start_date: body.startDate.toISOString().split('T')[0],
      end_date: body.endDate.toISOString().split('T')[0],
      total_days: body.totalDays,
      total_hours: body.totalHours,
      reason: body.reason,
    };

    const { data } = await apiClient.post<ApiLeaveRequestResponse>(
      LEAVE_ENDPOINTS.request(staffId),
      apiBody,
    );

    return transformLeaveRequest(data);
  },
};
