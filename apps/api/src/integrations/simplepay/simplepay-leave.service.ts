/**
 * SimplePay Leave Service
 * Manages leave types, balances, and leave days in SimplePay
 *
 * TASK-SPAY-001: SimplePay Leave Management
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { LeaveRequestRepository } from '../../database/repositories/leave-request.repository';
import {
  SimplePayLeaveType,
  SimplePayLeaveBalance,
  SimplePayLeaveDay,
  SimplePayLeaveDayInput,
  LeaveSyncResult,
} from '../../database/entities/leave-request.entity';
import { LeaveRequestStatus } from '../../database/entities/leave-request.entity';

// Cache structure for leave types
interface LeaveTypeCache {
  leaveTypes: SimplePayLeaveType[];
  cachedAt: number;
}

@Injectable()
export class SimplePayLeaveService {
  private readonly logger = new Logger(SimplePayLeaveService.name);

  // Leave type cache with 15 minute TTL
  private leaveTypeCache: Map<string, LeaveTypeCache> = new Map();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly leaveRequestRepo: LeaveRequestRepository,
  ) {}

  /**
   * Get leave types for a client (with caching)
   */
  async getLeaveTypes(
    tenantId: string,
    forceRefresh = false,
  ): Promise<SimplePayLeaveType[]> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();
    const cacheKey = `${tenantId}-${clientId}`;

    // Check cache
    if (!forceRefresh) {
      const cached = this.leaveTypeCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL_MS) {
        this.logger.debug(`Using cached leave types for tenant ${tenantId}`);
        return cached.leaveTypes;
      }
    }

    try {
      // Fetch from SimplePay API
      // SimplePay returns: {leaveTypeId: name, ...}
      // e.g., {"1418851":"Annual","1418852":"Sick",...}
      const response = await this.apiClient.get<Record<string, string>>(
        `/clients/${clientId}/leave_types`,
      );

      // Transform to SimplePayLeaveType array with sensible defaults
      const leaveTypes: SimplePayLeaveType[] = Object.entries(response).map(
        ([id, name]) => ({
          id: parseInt(id, 10),
          name,
          accrual_type: this.inferAccrualType(name),
          accrual_rate: 0, // Not provided by simple endpoint
          accrual_cap: null, // Not provided by simple endpoint
          carry_over_cap: null, // Not provided by simple endpoint
          units: 'days' as const,
          requires_approval: true, // Default to requiring approval
          is_active: true, // Assume active if returned
        }),
      );

      // Cache the result
      this.leaveTypeCache.set(cacheKey, {
        leaveTypes,
        cachedAt: Date.now(),
      });

      this.logger.log(
        `Fetched ${leaveTypes.length} leave types for tenant ${tenantId}`,
      );
      return leaveTypes;
    } catch (error) {
      this.logger.error(
        `Failed to fetch leave types: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get leave balances for an employee
   * Note: SimplePay API requires a date parameter and returns a simple
   * {leaveTypeId: balance} format. We combine with leave types to build
   * the full SimplePayLeaveBalance structure.
   */
  async getLeaveBalances(
    tenantId: string,
    simplePayEmployeeId: string,
    asAtDate?: Date,
  ): Promise<SimplePayLeaveBalance[]> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      // Use today's date if not specified
      const dateStr = this.formatDate(asAtDate || new Date());

      // SimplePay returns: {leaveTypeId: balance, ...}
      // e.g., {"1418851":0.0,"1418852":0.0,"1418853":0.0,"1418854":0.0}
      const balanceResponse = await this.apiClient.get<Record<string, number>>(
        `/employees/${simplePayEmployeeId}/leave_balances?date=${dateStr}`,
      );

      // Get leave types to add names
      // SimplePay returns: {leaveTypeId: name, ...}
      // e.g., {"1418851":"Annual","1418852":"Sick",...}
      const clientId = this.apiClient.getClientId();
      const leaveTypesResponse = await this.apiClient.get<
        Record<string, string>
      >(`/clients/${clientId}/leave_types`);

      // Combine balances with leave type names
      const balances: SimplePayLeaveBalance[] = Object.entries(
        balanceResponse,
      ).map(([leaveTypeId, balance]) => ({
        leave_type_id: parseInt(leaveTypeId, 10),
        leave_type_name:
          leaveTypesResponse[leaveTypeId] || `Leave Type ${leaveTypeId}`,
        opening_balance: 0, // Not provided by simple endpoint
        accrued: 0, // Not provided by simple endpoint
        taken: 0, // Not provided by simple endpoint
        pending: 0, // Not provided by simple endpoint
        adjustment: 0, // Not provided by simple endpoint
        current_balance: balance,
        units: 'days' as const, // Default to days
      }));

      this.logger.debug(
        `Fetched ${balances.length} leave balances for employee ${simplePayEmployeeId}`,
      );
      return balances;
    } catch (error) {
      this.logger.error(
        `Failed to fetch leave balances for employee ${simplePayEmployeeId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Get leave days for an employee within a date range
   */
  async getLeaveDays(
    tenantId: string,
    simplePayEmployeeId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<SimplePayLeaveDay[]> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      let endpoint = `/employees/${simplePayEmployeeId}/leave_days`;
      const params: string[] = [];

      if (fromDate) {
        params.push(`from_date=${this.formatDate(fromDate)}`);
      }
      if (toDate) {
        params.push(`to_date=${this.formatDate(toDate)}`);
      }

      if (params.length > 0) {
        endpoint += `?${params.join('&')}`;
      }

      // SimplePay returns wrapped: [{ leave_day: {...} }, ...]
      interface LeaveDayWrapper {
        leave_day: SimplePayLeaveDay;
      }
      const response = await this.apiClient.get<LeaveDayWrapper[]>(endpoint);
      const leaveDays = response.map((w) => w.leave_day);

      this.logger.debug(
        `Fetched ${leaveDays.length} leave days for employee ${simplePayEmployeeId}`,
      );
      return leaveDays;
    } catch (error) {
      this.logger.error(
        `Failed to fetch leave days for employee ${simplePayEmployeeId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Create a single leave day in SimplePay
   */
  async createLeaveDay(
    tenantId: string,
    simplePayEmployeeId: string,
    input: SimplePayLeaveDayInput,
  ): Promise<SimplePayLeaveDay> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      // SimplePay expects wrapped: { leave_day: {...} }
      // Response might be { leave_day: {...} } or just {...} directly
      const response = await this.apiClient.post<
        { leave_day: SimplePayLeaveDay } | SimplePayLeaveDay
      >(`/employees/${simplePayEmployeeId}/leave_days`, {
        leave_day: {
          leave_type_id: input.leave_type_id,
          date: input.date,
          hours: input.hours,
          notes: input.notes || null,
        },
      });

      // Handle both response formats
      const leaveDay = 'leave_day' in response ? response.leave_day : response;

      this.logger.log(
        `Created leave day ${leaveDay.id} for employee ${simplePayEmployeeId} on ${input.date}`,
      );
      return leaveDay;
    } catch (error) {
      this.logger.error(
        `Failed to create leave day for employee ${simplePayEmployeeId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Create multiple leave days in SimplePay (for a leave request spanning multiple days)
   */
  async createMultipleLeaveDays(
    tenantId: string,
    simplePayEmployeeId: string,
    inputs: SimplePayLeaveDayInput[],
  ): Promise<SimplePayLeaveDay[]> {
    const results: SimplePayLeaveDay[] = [];
    const errors: string[] = [];

    for (const input of inputs) {
      try {
        const leaveDay = await this.createLeaveDay(
          tenantId,
          simplePayEmployeeId,
          input,
        );
        results.push(leaveDay);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push(
          `Failed to create leave day for ${input.date}: ${errorMessage}`,
        );
        this.logger.warn(
          `Failed to create leave day for ${input.date}: ${errorMessage}`,
        );
      }
    }

    if (errors.length > 0 && results.length === 0) {
      throw new Error(`All leave day creations failed: ${errors.join('; ')}`);
    }

    return results;
  }

  /**
   * Update a leave day in SimplePay
   */
  async updateLeaveDay(
    tenantId: string,
    leaveDayId: number,
    input: Partial<SimplePayLeaveDayInput>,
  ): Promise<SimplePayLeaveDay> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      const response = await this.apiClient.patch<
        { leave_day: SimplePayLeaveDay } | SimplePayLeaveDay
      >(`/leave_days/${leaveDayId}`, {
        leave_day: input,
      });

      const leaveDay = 'leave_day' in response ? response.leave_day : response;

      this.logger.log(`Updated leave day ${leaveDayId}`);
      return leaveDay;
    } catch (error) {
      this.logger.error(`Failed to update leave day ${leaveDayId}: ${error}`);
      throw error;
    }
  }

  /**
   * Delete a leave day in SimplePay
   */
  async deleteLeaveDay(tenantId: string, leaveDayId: number): Promise<void> {
    await this.apiClient.initializeForTenant(tenantId);

    try {
      await this.apiClient.delete(`/leave_days/${leaveDayId}`);
      this.logger.log(`Deleted leave day ${leaveDayId}`);
    } catch (error) {
      this.logger.error(`Failed to delete leave day ${leaveDayId}: ${error}`);
      throw error;
    }
  }

  /**
   * Sync an approved leave request to SimplePay
   * Creates leave days for each day in the leave request period
   */
  async syncLeaveRequestToSimplePay(
    tenantId: string,
    leaveRequestId: string,
  ): Promise<LeaveSyncResult> {
    const result: LeaveSyncResult = {
      success: false,
      leaveRequestId,
      simplePayIds: [],
      errors: [],
    };

    try {
      // Get the leave request
      const leaveRequest = await this.leaveRequestRepo.findByIdOrThrow(
        leaveRequestId,
        tenantId,
      );

      // Verify it's approved
      if (leaveRequest.status !== LeaveRequestStatus.APPROVED) {
        result.errors.push(
          `Leave request is in '${leaveRequest.status}' status, must be APPROVED to sync`,
        );
        return result;
      }

      // Check if already synced
      if (leaveRequest.simplePaySynced) {
        result.errors.push('Leave request is already synced to SimplePay');
        return result;
      }

      // Get SimplePay employee ID
      const mapping = await this.simplePayRepo.findEmployeeMapping(
        leaveRequest.staffId,
      );
      if (!mapping) {
        result.errors.push(
          'Staff member is not linked to a SimplePay employee',
        );
        return result;
      }

      // Generate leave days for each day in the period
      const leaveDayInputs = this.generateLeaveDayInputs(
        leaveRequest.leaveTypeId,
        leaveRequest.startDate,
        leaveRequest.endDate,
        Number(leaveRequest.totalHours) / Number(leaveRequest.totalDays),
        leaveRequest.reason || undefined,
      );

      // Create leave days in SimplePay
      const createdDays = await this.createMultipleLeaveDays(
        tenantId,
        mapping.simplePayEmployeeId,
        leaveDayInputs,
      );

      // Mark as synced
      const simplePayIds = createdDays.map((d) => String(d.id));
      await this.leaveRequestRepo.markSynced(leaveRequestId, simplePayIds);

      result.success = true;
      result.simplePayIds = simplePayIds;
      this.logger.log(
        `Successfully synced leave request ${leaveRequestId} with ${createdDays.length} leave days`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
      this.logger.error(
        `Failed to sync leave request ${leaveRequestId}: ${errorMessage}`,
      );
    }

    return result;
  }

  /**
   * Sync all unsynced approved leave requests for a tenant
   */
  async syncAllUnsyncedLeaveRequests(
    tenantId: string,
  ): Promise<LeaveSyncResult[]> {
    const unsyncedRequests =
      await this.leaveRequestRepo.findUnsyncedApproved(tenantId);
    const results: LeaveSyncResult[] = [];

    for (const request of unsyncedRequests) {
      const result = await this.syncLeaveRequestToSimplePay(
        tenantId,
        request.id,
      );
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    this.logger.log(
      `Synced ${successful}/${results.length} leave requests for tenant ${tenantId}`,
    );

    return results;
  }

  /**
   * Get leave balance by staff ID (converts to SimplePay employee ID)
   */
  async getLeaveBalancesByStaff(
    tenantId: string,
    staffId: string,
  ): Promise<SimplePayLeaveBalance[]> {
    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Staff member is not linked to a SimplePay employee');
    }
    return this.getLeaveBalances(tenantId, mapping.simplePayEmployeeId);
  }

  /**
   * Clear the leave type cache (useful after configuration changes)
   */
  clearCache(tenantId?: string): void {
    if (tenantId) {
      const clientId = this.apiClient.getClientId();
      const cacheKey = `${tenantId}-${clientId}`;
      this.leaveTypeCache.delete(cacheKey);
      this.logger.debug(`Cleared leave type cache for tenant ${tenantId}`);
    } else {
      this.leaveTypeCache.clear();
      this.logger.debug('Cleared all leave type caches');
    }
  }

  /**
   * Generate leave day inputs for each working day in the period
   */
  private generateLeaveDayInputs(
    leaveTypeId: number,
    startDate: Date,
    endDate: Date,
    hoursPerDay: number,
    notes?: string,
  ): SimplePayLeaveDayInput[] {
    const inputs: SimplePayLeaveDayInput[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        inputs.push({
          leave_type_id: leaveTypeId,
          date: this.formatDate(current),
          hours: hoursPerDay,
          notes,
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return inputs;
  }

  /**
   * Format date for SimplePay API (YYYY-MM-DD)
   */
  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Infer accrual type from leave type name
   */
  private inferAccrualType(
    name: string,
  ):
    | 'annual'
    | 'sick'
    | 'family_responsibility'
    | 'maternity'
    | 'parental'
    | 'adoption'
    | 'study'
    | 'unpaid'
    | 'custom' {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('annual')) return 'annual';
    if (lowerName.includes('sick')) return 'sick';
    if (lowerName.includes('family')) return 'family_responsibility';
    if (lowerName.includes('maternity')) return 'maternity';
    if (lowerName.includes('parental')) return 'parental';
    if (lowerName.includes('adoption')) return 'adoption';
    if (lowerName.includes('study')) return 'study';
    if (lowerName.includes('unpaid')) return 'unpaid';
    return 'custom';
  }
}
