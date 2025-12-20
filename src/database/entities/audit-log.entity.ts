/**
 * Audit Log Entity Types
 * TASK-CORE-004: Audit Log Entity and Trail System
 *
 * @module database/entities/audit-log
 * @description Audit log entity interface matching Prisma schema exactly
 */

/**
 * Audit actions tracked in the system
 * Must match Prisma enum exactly
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CATEGORIZE = 'CATEGORIZE',
  MATCH = 'MATCH',
  RECONCILE = 'RECONCILE',
  SUBMIT = 'SUBMIT',
}

/**
 * Audit log entity interface
 * Represents an immutable audit trail record for compliance
 *
 * @interface IAuditLog
 * @property {string} id - Unique identifier (UUID)
 * @property {string} tenantId - Tenant this audit log belongs to
 * @property {string | null} userId - User who performed the action (nullable for system actions)
 * @property {string | null} agentId - AI agent that performed the action (nullable for user actions)
 * @property {string} entityType - Type of entity being audited (e.g., 'Transaction', 'User')
 * @property {string} entityId - ID of the entity being audited
 * @property {AuditAction} action - Type of action performed
 * @property {Record<string, unknown> | null} beforeValue - Entity state before action (JSON)
 * @property {Record<string, unknown> | null} afterValue - Entity state after action (JSON)
 * @property {string | null} changeSummary - Human-readable summary of changes
 * @property {string | null} ipAddress - IP address of the actor
 * @property {string | null} userAgent - User agent string of the actor
 * @property {Date} createdAt - Record creation timestamp (immutable)
 */
export interface IAuditLog {
  id: string;
  tenantId: string;
  userId: string | null;
  agentId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  changeSummary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
