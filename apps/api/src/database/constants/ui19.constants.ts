/**
 * UI-19 Constants for South African UIF Compliance
 * TASK-STAFF-006: Enforce UI-19 14-Day Deadline
 *
 * The UI-19 form (Declaration of Commencement/Termination of Employment)
 * must be submitted to the Department of Labour within 14 days of:
 * - An employee starting work (commencement)
 * - An employee leaving work (termination)
 *
 * Reference: Unemployment Insurance Act 63 of 2001
 */

/**
 * UI-19 submission types
 */
export enum UI19Type {
  /** Form for new employee starting work */
  COMMENCEMENT = 'COMMENCEMENT',
  /** Form for employee leaving work */
  TERMINATION = 'TERMINATION',
}

/**
 * UI-19 submission status tracking
 */
export enum UI19Status {
  /** Form created but not yet submitted */
  PENDING = 'PENDING',
  /** Form submitted within deadline */
  SUBMITTED = 'SUBMITTED',
  /** Form submitted after deadline (requires reason) */
  LATE_SUBMITTED = 'LATE_SUBMITTED',
  /** Form past deadline and not submitted */
  OVERDUE = 'OVERDUE',
}

/**
 * Alert severity levels for dashboard
 */
export type UI19AlertSeverity = 'critical' | 'warning' | 'info';

/**
 * Enforcement mode for late submissions
 * - 'log': Only log late submissions, no user intervention required
 * - 'warn': Show warning to user but allow submission
 * - 'block': Require late reason before allowing submission
 */
export type UI19EnforcementMode = 'log' | 'warn' | 'block';

/**
 * Deadline configuration interface
 */
export interface IUI19DeadlineConfig {
  /** Number of days from event date to submission deadline (default: 14) */
  deadlineDays: number;
  /** Number of days before deadline to start showing warnings (default: 7) */
  warningDays: number;
  /** How to handle late submissions */
  enforcementMode: UI19EnforcementMode;
}

/**
 * UI-19 submission record interface
 */
export interface IUI19Submission {
  id: string;
  staffId: string;
  tenantId: string;
  type: UI19Type;
  eventDate: Date;
  dueDate: Date;
  status: UI19Status;
  submittedAt?: Date;
  submittedBy?: string;
  referenceNumber?: string;
  lateReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * UI-19 dashboard alert interface
 */
export interface IUI19Alert {
  submissionId: string;
  staffId: string;
  staffName: string;
  type: UI19Type;
  eventDate: Date;
  dueDate: Date;
  daysRemaining: number;
  isOverdue: boolean;
  isApproaching: boolean;
  severity: UI19AlertSeverity;
}

/**
 * Default configuration values
 */
export const UI19_DEFAULTS: IUI19DeadlineConfig = {
  /** UIF Act requirement: 14 days from event */
  deadlineDays: 14,
  /** Start warning 7 days before deadline */
  warningDays: 7,
  /** Default to warn mode - show warning but allow submission */
  enforcementMode: 'warn',
};

/**
 * Configuration keys for tenant settings
 */
export const UI19_CONFIG_KEYS = {
  DEADLINE_DAYS: 'UI19_DEADLINE_DAYS',
  WARNING_DAYS: 'UI19_WARNING_DAYS',
  ENFORCEMENT_MODE: 'UI19_ENFORCEMENT_MODE',
} as const;
