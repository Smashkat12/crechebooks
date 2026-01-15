/**
 * SimplePay Sync Job DTOs
 * TASK-STAFF-003 / TASK-STAFF-010: SimplePay Sync Retry Queue
 *
 * Defines job types for SimplePay synchronization with retry capabilities.
 */

/**
 * Types of SimplePay sync operations
 */
export enum SyncJobType {
  /** Create a new employee in SimplePay */
  CREATE_EMPLOYEE = 'CREATE_EMPLOYEE',
  /** Update an existing employee in SimplePay */
  UPDATE_EMPLOYEE = 'UPDATE_EMPLOYEE',
  /** Sync leave data to SimplePay */
  SYNC_LEAVE = 'SYNC_LEAVE',
  /** Sync payroll/pay run data from SimplePay */
  SYNC_PAYROLL = 'SYNC_PAYROLL',
  /** Sync all employees for a tenant */
  BULK_EMPLOYEE_SYNC = 'BULK_EMPLOYEE_SYNC',
  /** Sync leave balances from SimplePay */
  SYNC_LEAVE_BALANCES = 'SYNC_LEAVE_BALANCES',
}

/**
 * Priority levels for sync jobs
 */
export enum SyncJobPriority {
  LOW = 10,
  NORMAL = 5,
  HIGH = 2,
  CRITICAL = 1,
}

/**
 * Base interface for all SimplePay sync job data
 */
export interface BaseSyncJobData {
  /** Tenant ID */
  tenantId: string;
  /** Type of sync operation */
  type: SyncJobType;
  /** When the job was originally queued */
  queuedAt: Date;
  /** What triggered this sync */
  triggeredBy: 'manual' | 'event' | 'scheduled' | 'retry';
  /** Optional correlation ID for tracking */
  correlationId?: string;
}

/**
 * Job data for creating an employee in SimplePay
 */
export interface CreateEmployeeSyncJobData extends BaseSyncJobData {
  type: SyncJobType.CREATE_EMPLOYEE;
  /** Staff ID in CrecheBooks */
  staffId: string;
}

/**
 * Job data for updating an employee in SimplePay
 */
export interface UpdateEmployeeSyncJobData extends BaseSyncJobData {
  type: SyncJobType.UPDATE_EMPLOYEE;
  /** Staff ID in CrecheBooks */
  staffId: string;
  /** SimplePay employee ID */
  simplePayEmployeeId: string;
  /** Fields that changed */
  changedFields?: string[];
}

/**
 * Job data for syncing leave to SimplePay
 */
export interface SyncLeaveSyncJobData extends BaseSyncJobData {
  type: SyncJobType.SYNC_LEAVE;
  /** Leave request ID in CrecheBooks */
  leaveRequestId: string;
  /** Staff ID */
  staffId: string;
}

/**
 * Job data for syncing payroll from SimplePay
 */
export interface SyncPayrollSyncJobData extends BaseSyncJobData {
  type: SyncJobType.SYNC_PAYROLL;
  /** SimplePay pay run ID (optional - sync all if not specified) */
  simplePayPayRunId?: string;
  /** Wave ID (optional - sync all active waves if not specified) */
  waveId?: number;
}

/**
 * Job data for bulk employee sync
 */
export interface BulkEmployeeSyncJobData extends BaseSyncJobData {
  type: SyncJobType.BULK_EMPLOYEE_SYNC;
  /** Optional list of staff IDs to sync (sync all if not specified) */
  staffIds?: string[];
}

/**
 * Job data for syncing leave balances
 */
export interface SyncLeaveBalancesSyncJobData extends BaseSyncJobData {
  type: SyncJobType.SYNC_LEAVE_BALANCES;
  /** Staff ID */
  staffId: string;
  /** SimplePay employee ID */
  simplePayEmployeeId: string;
}

/**
 * Union type for all sync job data types
 */
export type SyncJobData =
  | CreateEmployeeSyncJobData
  | UpdateEmployeeSyncJobData
  | SyncLeaveSyncJobData
  | SyncPayrollSyncJobData
  | BulkEmployeeSyncJobData
  | SyncLeaveBalancesSyncJobData;

/**
 * Result of a sync job
 */
export interface SyncJobResult {
  /** Whether the sync was successful */
  success: boolean;
  /** Job type */
  type: SyncJobType;
  /** Tenant ID */
  tenantId: string;
  /** Entity ID (varies by job type) */
  entityId: string;
  /** SimplePay ID if applicable */
  simplePayId?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Aggregated statistics for sync queue
 */
export interface SyncQueueStats {
  /** Number of jobs waiting */
  waiting: number;
  /** Number of jobs currently being processed */
  active: number;
  /** Number of completed jobs (retained) */
  completed: number;
  /** Number of failed jobs */
  failed: number;
  /** Number of delayed jobs */
  delayed: number;
  /** Breakdown by job type */
  byType: Record<SyncJobType, { waiting: number; failed: number }>;
}

/**
 * Alert data for failed sync notification
 */
export interface SyncFailureAlert {
  /** Job ID */
  jobId: string;
  /** Job type */
  type: SyncJobType;
  /** Tenant ID */
  tenantId: string;
  /** Entity ID (staffId, leaveRequestId, etc.) */
  entityId: string;
  /** Final error message */
  errorMessage: string;
  /** Number of attempts made */
  attemptsMade: number;
  /** When the job was first queued */
  firstAttemptAt: Date;
  /** When the final attempt failed */
  finalAttemptAt: Date;
}

/**
 * Options for queueing a sync job
 */
export interface QueueSyncJobOptions {
  /** Priority (lower = higher priority) */
  priority?: SyncJobPriority;
  /** Delay before processing (milliseconds) */
  delay?: number;
  /** Override default number of attempts */
  attempts?: number;
  /** Custom job ID (for deduplication) */
  jobId?: string;
}

/**
 * Job status information
 */
export interface SyncJobStatus {
  /** Job ID */
  id: string;
  /** Job type */
  type: SyncJobType;
  /** Current state */
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  /** Number of attempts made */
  attemptsMade: number;
  /** Last error if any */
  failedReason?: string;
  /** When job was created */
  createdAt: Date;
  /** When job was processed (if completed/failed) */
  processedAt?: Date;
  /** When job finished (if completed/failed) */
  finishedAt?: Date;
  /** Next attempt timestamp (if delayed) */
  nextAttemptAt?: Date;
}
