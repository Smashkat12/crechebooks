/**
 * Leave Request Entity
 * TASK-SPAY-001: SimplePay Leave Management
 */

import type { LeaveRequest } from '@prisma/client';

// Re-export the enum from the entity (not from @prisma/client directly)
// This follows the codebase pattern of exporting enums from entity files
export const LeaveRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;

export type LeaveRequestStatus =
  (typeof LeaveRequestStatus)[keyof typeof LeaveRequestStatus];

// Interface alias for the Prisma model
export type ILeaveRequest = LeaveRequest;

// SimplePay API Leave Type response
export interface SimplePayLeaveType {
  id: number;
  name: string;
  accrual_type:
    | 'annual'
    | 'sick'
    | 'family_responsibility'
    | 'maternity'
    | 'parental'
    | 'adoption'
    | 'study'
    | 'unpaid'
    | 'custom';
  accrual_rate: number;
  accrual_cap: number | null;
  carry_over_cap: number | null;
  units: 'days' | 'hours';
  requires_approval: boolean;
  is_active: boolean;
}

// SimplePay API Leave Balance response
export interface SimplePayLeaveBalance {
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

// SimplePay API Leave Day (individual leave entry)
export interface SimplePayLeaveDay {
  id: number;
  employee_id: number;
  leave_type_id: number;
  date: string; // YYYY-MM-DD format
  hours: number;
  status: 'approved' | 'pending' | 'rejected';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Input for creating a leave day in SimplePay
export interface SimplePayLeaveDayInput {
  leave_type_id: number;
  date: string; // YYYY-MM-DD format
  hours: number;
  notes?: string;
}

// Leave request with staff details for display
export interface LeaveRequestWithStaff extends ILeaveRequest {
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string | null;
  };
}

// Summary of leave balances for display
export interface LeaveBalanceSummary {
  staffId: string;
  staffName: string;
  balances: SimplePayLeaveBalance[];
  lastUpdated: Date;
}

// Leave calendar entry for visualization
export interface LeaveCalendarEntry {
  staffId: string;
  staffName: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  status: LeaveRequestStatus;
  totalDays: number;
}

// Leave sync result from SimplePay
export interface LeaveSyncResult {
  success: boolean;
  leaveRequestId: string;
  simplePayIds: string[];
  errors: string[];
}
