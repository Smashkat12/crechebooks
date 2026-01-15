/**
 * SimplePay Sync Queue Processor
 * TASK-STAFF-003 / TASK-STAFF-010: SimplePay Sync Retry Queue
 *
 * Processes SimplePay synchronization jobs with exponential backoff retry.
 * Handles employee creation, updates, leave sync, and payroll sync.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  SyncJobData,
  SyncJobType,
  SyncJobResult,
  SyncFailureAlert,
  CreateEmployeeSyncJobData,
  UpdateEmployeeSyncJobData,
  SyncLeaveSyncJobData,
  SyncPayrollSyncJobData,
  BulkEmployeeSyncJobData,
  SyncLeaveBalancesSyncJobData,
} from './dto/sync-job.dto';
import { SimplePayEmployeeService } from './simplepay-employee.service';
import { SimplePayLeaveService } from './simplepay-leave.service';
import { SimplePayPayRunService } from './simplepay-payrun.service';

export const SIMPLEPAY_SYNC_QUEUE = 'simplepay-sync';

/** Maximum retries before alerting */
const MAX_ATTEMPTS = 5;

@Injectable()
@Processor(SIMPLEPAY_SYNC_QUEUE)
export class SimplePaySyncProcessor {
  private readonly logger = new Logger(SimplePaySyncProcessor.name);

  constructor(
    private readonly employeeService: SimplePayEmployeeService,
    private readonly leaveService: SimplePayLeaveService,
    private readonly payRunService: SimplePayPayRunService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Process()
  async processJob(job: Job<SyncJobData>): Promise<SyncJobResult> {
    const startTime = Date.now();
    const { data } = job;

    this.logger.log({
      message: 'Processing SimplePay sync job',
      jobId: job.id,
      type: data.type,
      tenantId: data.tenantId,
      attemptNumber: job.attemptsMade + 1,
      maxAttempts: MAX_ATTEMPTS,
      timestamp: new Date().toISOString(),
    });

    try {
      let result: SyncJobResult;

      switch (data.type) {
        case SyncJobType.CREATE_EMPLOYEE:
          result = await this.processCreateEmployee(data);
          break;
        case SyncJobType.UPDATE_EMPLOYEE:
          result = await this.processUpdateEmployee(data);
          break;
        case SyncJobType.SYNC_LEAVE:
          result = await this.processSyncLeave(data);
          break;
        case SyncJobType.SYNC_PAYROLL:
          result = await this.processSyncPayroll(data);
          break;
        case SyncJobType.BULK_EMPLOYEE_SYNC:
          result = await this.processBulkEmployeeSync(data);
          break;
        case SyncJobType.SYNC_LEAVE_BALANCES:
          result = await this.processSyncLeaveBalances(data);
          break;
        default:
          throw new Error(
            `Unknown sync job type: ${(data as SyncJobData).type}`,
          );
      }

      result.durationMs = Date.now() - startTime;

      this.logger.log({
        message: 'SimplePay sync job completed',
        jobId: job.id,
        type: data.type,
        tenantId: data.tenantId,
        success: result.success,
        durationMs: result.durationMs,
        simplePayId: result.simplePayId,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error({
        message: 'SimplePay sync job failed',
        jobId: job.id,
        type: data.type,
        tenantId: data.tenantId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: MAX_ATTEMPTS,
        timestamp: new Date().toISOString(),
      });

      // Re-throw to trigger Bull's retry mechanism
      throw error;
    }
  }

  /**
   * Handle failed jobs after all retries exhausted
   */
  @OnQueueFailed()
  onFailed(job: Job<SyncJobData>, error: Error): void {
    const { data } = job;

    // Only alert after max attempts exhausted
    if (job.attemptsMade >= MAX_ATTEMPTS) {
      const alert: SyncFailureAlert = {
        jobId: String(job.id),
        type: data.type,
        tenantId: data.tenantId,
        entityId: this.getEntityId(data),
        errorMessage: error.message,
        attemptsMade: job.attemptsMade,
        firstAttemptAt: new Date(data.queuedAt),
        finalAttemptAt: new Date(),
      };

      this.logger.error({
        message: 'SimplePay sync job exhausted all retries',
        alert,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      // Emit event for alerting system
      this.eventEmitter.emit('simplepay.sync.failed', alert);
    } else {
      // Log retry
      const nextDelay = this.calculateBackoffDelay(job.attemptsMade);
      this.logger.warn({
        message: 'SimplePay sync job will retry',
        jobId: job.id,
        type: data.type,
        tenantId: data.tenantId,
        attemptsMade: job.attemptsMade,
        nextAttemptIn: `${Math.round(nextDelay / 1000)}s`,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Process CREATE_EMPLOYEE job
   */
  private async processCreateEmployee(
    data: CreateEmployeeSyncJobData,
  ): Promise<SyncJobResult> {
    const { tenantId, staffId } = data;

    const mapping = await this.employeeService.syncEmployee(tenantId, staffId);

    return {
      success: true,
      type: SyncJobType.CREATE_EMPLOYEE,
      tenantId,
      entityId: staffId,
      simplePayId: mapping.simplePayEmployeeId,
      durationMs: 0,
      details: {
        syncStatus: mapping.syncStatus,
      },
    };
  }

  /**
   * Process UPDATE_EMPLOYEE job
   */
  private async processUpdateEmployee(
    data: UpdateEmployeeSyncJobData,
  ): Promise<SyncJobResult> {
    const { tenantId, staffId, changedFields } = data;

    const mapping = await this.employeeService.syncEmployee(tenantId, staffId);

    return {
      success: true,
      type: SyncJobType.UPDATE_EMPLOYEE,
      tenantId,
      entityId: staffId,
      simplePayId: mapping.simplePayEmployeeId,
      durationMs: 0,
      details: {
        syncStatus: mapping.syncStatus,
        changedFields,
      },
    };
  }

  /**
   * Process SYNC_LEAVE job
   */
  private async processSyncLeave(
    data: SyncLeaveSyncJobData,
  ): Promise<SyncJobResult> {
    const { tenantId, leaveRequestId } = data;

    const syncResult = await this.leaveService.syncLeaveRequestToSimplePay(
      tenantId,
      leaveRequestId,
    );

    if (!syncResult.success) {
      throw new Error(syncResult.errors.join('; '));
    }

    return {
      success: true,
      type: SyncJobType.SYNC_LEAVE,
      tenantId,
      entityId: leaveRequestId,
      simplePayId: syncResult.simplePayIds.join(','),
      durationMs: 0,
      details: {
        leaveDayCount: syncResult.simplePayIds.length,
      },
    };
  }

  /**
   * Process SYNC_PAYROLL job
   */
  private async processSyncPayroll(
    data: SyncPayrollSyncJobData,
  ): Promise<SyncJobResult> {
    const { tenantId, simplePayPayRunId, waveId } = data;

    if (simplePayPayRunId) {
      // Sync specific pay run
      const payRunSync = await this.payRunService.syncPayRun(
        tenantId,
        simplePayPayRunId,
      );

      return {
        success: true,
        type: SyncJobType.SYNC_PAYROLL,
        tenantId,
        entityId: payRunSync.id,
        simplePayId: simplePayPayRunId,
        durationMs: 0,
        details: {
          employeeCount: payRunSync.employeeCount,
          totalGrossCents: payRunSync.totalGrossCents,
        },
      };
    } else {
      // Sync all pay runs for wave(s)
      const results = await this.payRunService.syncAllPayRuns(tenantId, waveId);
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      if (failCount > 0 && successCount === 0) {
        throw new Error(
          `All pay run syncs failed: ${results
            .filter((r) => !r.success)
            .map((r) => r.errors.join(', '))
            .join('; ')}`,
        );
      }

      return {
        success: true,
        type: SyncJobType.SYNC_PAYROLL,
        tenantId,
        entityId: `bulk-${waveId || 'all'}`,
        durationMs: 0,
        details: {
          totalPayRuns: results.length,
          successCount,
          failCount,
          errors:
            failCount > 0
              ? results.filter((r) => !r.success).map((r) => r.errors)
              : undefined,
        },
      };
    }
  }

  /**
   * Process BULK_EMPLOYEE_SYNC job
   */
  private async processBulkEmployeeSync(
    data: BulkEmployeeSyncJobData,
  ): Promise<SyncJobResult> {
    const { tenantId, staffIds } = data;

    if (staffIds && staffIds.length > 0) {
      // Sync specific staff members
      const results = await Promise.allSettled(
        staffIds.map((id) => this.employeeService.syncEmployee(tenantId, id)),
      );

      const successCount = results.filter(
        (r) => r.status === 'fulfilled',
      ).length;
      const failCount = results.filter((r) => r.status === 'rejected').length;

      if (failCount > 0 && successCount === 0) {
        throw new Error(`All employee syncs failed`);
      }

      return {
        success: true,
        type: SyncJobType.BULK_EMPLOYEE_SYNC,
        tenantId,
        entityId: `bulk-${staffIds.length}`,
        durationMs: 0,
        details: {
          total: staffIds.length,
          successCount,
          failCount,
        },
      };
    } else {
      // Sync all employees
      const result = await this.employeeService.syncAllEmployees(tenantId);

      if (!result.success && result.synced === 0) {
        throw new Error(
          `All employee syncs failed: ${result.errors.map((e) => e.error).join('; ')}`,
        );
      }

      return {
        success: result.success,
        type: SyncJobType.BULK_EMPLOYEE_SYNC,
        tenantId,
        entityId: 'bulk-all',
        durationMs: 0,
        details: {
          synced: result.synced,
          failed: result.failed,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
      };
    }
  }

  /**
   * Process SYNC_LEAVE_BALANCES job
   */
  private async processSyncLeaveBalances(
    data: SyncLeaveBalancesSyncJobData,
  ): Promise<SyncJobResult> {
    const { tenantId, staffId, simplePayEmployeeId } = data;

    const balances = await this.leaveService.getLeaveBalances(
      tenantId,
      simplePayEmployeeId,
    );

    return {
      success: true,
      type: SyncJobType.SYNC_LEAVE_BALANCES,
      tenantId,
      entityId: staffId,
      simplePayId: simplePayEmployeeId,
      durationMs: 0,
      details: {
        balanceCount: balances.length,
        balances: balances.map((b) => ({
          leaveTypeId: b.leave_type_id,
          balance: b.current_balance,
        })),
      },
    };
  }

  /**
   * Extract entity ID from job data for logging/alerting
   */
  private getEntityId(data: SyncJobData): string {
    switch (data.type) {
      case SyncJobType.CREATE_EMPLOYEE:
      case SyncJobType.UPDATE_EMPLOYEE:
        return data.staffId;
      case SyncJobType.SYNC_LEAVE:
        return data.leaveRequestId;
      case SyncJobType.SYNC_PAYROLL:
        return data.simplePayPayRunId || 'all';
      case SyncJobType.BULK_EMPLOYEE_SYNC:
        return data.staffIds?.join(',') || 'all';
      case SyncJobType.SYNC_LEAVE_BALANCES:
        return data.staffId;
      default:
        return 'unknown';
    }
  }

  /**
   * Calculate backoff delay for retry (exponential: 2s -> 4s -> 8s -> 16s -> 32s)
   */
  private calculateBackoffDelay(attemptsMade: number): number {
    return Math.min(2000 * Math.pow(2, attemptsMade), 32000);
  }
}
