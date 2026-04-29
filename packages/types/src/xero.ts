/**
 * Xero integration shared types
 */

export type XeroSyncJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type XeroLastSyncStatus = 'COMPLETED' | 'FAILED' | 'RUNNING';

export interface XeroSyncCurrentJob {
  id: string;
  status: XeroSyncJobStatus;
  startedAt: string;
  progress?: {
    current: number;
    total: number;
  };
}

export interface XeroErrorRetryState {
  /** ISO 8601 timestamp of the next scheduled auto-retry, or null if not yet scheduled */
  nextRetryAt: string | null;
  /** Number of consecutive sync failures since the connection entered ERROR state */
  consecutiveFailures: number;
}

export interface XeroSyncStatusResponse {
  connected: boolean;
  tokenExpiresAt: string | null;
  refreshTokenValid: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: XeroLastSyncStatus | null;
  lastSyncError: string | null;
  lastSyncRecordsImported: number | null;
  currentJob: XeroSyncCurrentJob | null;
  nextScheduledSyncAt: string;
  /** Present when the connection is in ERROR state and the cron is in backoff. Null when healthy or DISCONNECTED. */
  errorRetryState: XeroErrorRetryState | null;
}
