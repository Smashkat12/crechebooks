/**
 * SyncConflict Entity
 * TASK-XERO-001
 *
 * Represents a conflict detected during bi-directional sync with Xero.
 * Tracks conflicts when the same entity is modified in both systems.
 */

export enum ConflictType {
  UPDATE_UPDATE = 'UPDATE_UPDATE', // Both sides updated since last sync
  DELETE_UPDATE = 'DELETE_UPDATE', // Deleted locally, updated in Xero (or vice versa)
  CREATE_CREATE = 'CREATE_CREATE', // Created in both systems independently
}

export enum ConflictStatus {
  PENDING = 'PENDING', // Awaiting resolution
  AUTO_RESOLVED = 'AUTO_RESOLVED', // Automatically resolved by system
  MANUALLY_RESOLVED = 'MANUALLY_RESOLVED', // Resolved by user
  IGNORED = 'IGNORED', // User chose to ignore
}

export type ResolutionStrategy =
  | 'local_wins' // Use local version
  | 'xero_wins' // Use Xero version
  | 'last_modified_wins' // Use most recently modified
  | 'manual'; // Require manual resolution

export interface SyncConflict {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  conflictType: ConflictType;
  localData: Record<string, unknown>;
  xeroData: Record<string, unknown>;
  localModifiedAt: Date;
  xeroModifiedAt: Date;
  status: ConflictStatus;
  resolvedBy?: string;
  resolution?: ResolutionStrategy;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType?: ConflictType;
  conflictingFields?: string[];
  message: string;
}

export interface ConflictResolutionResult {
  success: boolean;
  winnerData: Record<string, unknown>;
  appliedStrategy: ResolutionStrategy;
  message: string;
}
