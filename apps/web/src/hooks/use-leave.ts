/**
 * Leave Management Hooks
 * TASK-WEB-050: Leave API endpoints and frontend hooks
 *
 * React Query hooks for leave management operations:
 * - useLeaveTypes: Query for leave types
 * - useLeaveBalances: Query for leave balances
 * - useLeaveHistory: Query for leave history
 * - useCreateLeaveRequest: Mutation for creating leave requests
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  leaveApi,
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  LeaveHistoryOptions,
  CreateLeaveRequestBody,
} from '@/lib/api/leave';

// Query Keys
export const leaveQueryKeys = {
  all: ['leave'] as const,
  types: () => [...leaveQueryKeys.all, 'types'] as const,
  balances: (staffId: string) => [...leaveQueryKeys.all, 'balances', staffId] as const,
  history: (staffId: string, options?: LeaveHistoryOptions) =>
    [...leaveQueryKeys.all, 'history', staffId, options] as const,
} as const;

/**
 * Hook to fetch all available leave types for the tenant
 *
 * @returns Query result with leave types
 *
 * @example
 * ```tsx
 * const { data: leaveTypes, isLoading } = useLeaveTypes();
 *
 * return (
 *   <select>
 *     {leaveTypes?.map((type) => (
 *       <option key={type.id} value={type.id}>
 *         {type.name}
 *       </option>
 *     ))}
 *   </select>
 * );
 * ```
 */
export function useLeaveTypes() {
  return useQuery<LeaveType[], AxiosError>({
    queryKey: leaveQueryKeys.types(),
    queryFn: () => leaveApi.getLeaveTypes(),
    staleTime: 15 * 60 * 1000, // 15 minutes - leave types don't change often
    gcTime: 30 * 60 * 1000, // 30 minutes cache time
  });
}

/**
 * Hook to fetch leave balances for a specific staff member
 *
 * @param staffId - Staff member ID
 * @returns Query result with leave balances
 *
 * @example
 * ```tsx
 * const { data: balances, isLoading, error } = useLeaveBalances(staffId);
 *
 * return (
 *   <div>
 *     {balances?.map((balance) => (
 *       <div key={balance.leaveTypeId}>
 *         <span>{balance.leaveTypeName}</span>
 *         <span>{balance.currentBalance} {balance.units}</span>
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useLeaveBalances(staffId: string) {
  return useQuery<LeaveBalance[], AxiosError>({
    queryKey: leaveQueryKeys.balances(staffId),
    queryFn: () => leaveApi.getLeaveBalances(staffId),
    enabled: !!staffId, // Only fetch when staffId is provided
    staleTime: 5 * 60 * 1000, // 5 minutes - balances may change
    gcTime: 10 * 60 * 1000, // 10 minutes cache time
  });
}

/**
 * Hook to fetch leave history for a specific staff member
 *
 * @param staffId - Staff member ID
 * @param options - Optional filters (fromDate, toDate, status, page, limit)
 * @returns Query result with leave history
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useLeaveHistory(staffId, {
 *   status: 'APPROVED',
 *   page: 1,
 *   limit: 10,
 * });
 *
 * return (
 *   <table>
 *     <tbody>
 *       {data?.leaveRequests.map((request) => (
 *         <tr key={request.id}>
 *           <td>{request.leaveTypeName}</td>
 *           <td>{request.startDate.toLocaleDateString()}</td>
 *           <td>{request.status}</td>
 *         </tr>
 *       ))}
 *     </tbody>
 *   </table>
 * );
 * ```
 */
export function useLeaveHistory(staffId: string, options?: LeaveHistoryOptions) {
  return useQuery<
    {
      leaveRequests: LeaveRequest[];
      total: number;
      page: number;
      limit: number;
    },
    AxiosError
  >({
    queryKey: leaveQueryKeys.history(staffId, options),
    queryFn: () => leaveApi.getLeaveHistory(staffId, options),
    enabled: !!staffId, // Only fetch when staffId is provided
    staleTime: 2 * 60 * 1000, // 2 minutes - history may be updated
  });
}

/**
 * Hook to create a new leave request
 *
 * @returns Mutation result with create function
 *
 * @example
 * ```tsx
 * const { mutate: createLeave, isPending, error } = useCreateLeaveRequest();
 *
 * const handleSubmit = (data: FormData) => {
 *   createLeave(
 *     {
 *       staffId: selectedStaffId,
 *       body: {
 *         leaveTypeId: data.leaveTypeId,
 *         leaveTypeName: data.leaveTypeName,
 *         startDate: data.startDate,
 *         endDate: data.endDate,
 *         totalDays: data.totalDays,
 *         totalHours: data.totalHours,
 *         reason: data.reason,
 *       },
 *     },
 *     {
 *       onSuccess: (leaveRequest) => {
 *         toast.success('Leave request created');
 *       },
 *       onError: (error) => {
 *         toast.error(error.response?.data?.message || 'Failed to create leave request');
 *       },
 *     }
 *   );
 * };
 * ```
 */
export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();

  return useMutation<
    LeaveRequest,
    AxiosError<{ message: string }>,
    { staffId: string; body: CreateLeaveRequestBody }
  >({
    mutationFn: ({ staffId, body }) => leaveApi.createLeaveRequest(staffId, body),
    onSuccess: (data, variables) => {
      // Invalidate leave history for this staff member
      queryClient.invalidateQueries({
        queryKey: leaveQueryKeys.history(variables.staffId),
      });

      // Invalidate leave balances as they may have changed
      queryClient.invalidateQueries({
        queryKey: leaveQueryKeys.balances(variables.staffId),
      });

      // Invalidate staff list and detail to update any leave-related displays
      queryClient.invalidateQueries({
        queryKey: ['staff'],
      });
    },
  });
}

// Re-export types for convenience
export type {
  LeaveType,
  LeaveBalance,
  LeaveRequest,
  LeaveHistoryOptions,
  CreateLeaveRequestBody,
} from '@/lib/api/leave';
