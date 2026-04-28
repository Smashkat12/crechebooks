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
}
