/**
 * SARS Deadline Types
 * TASK-SARS-017: SARS Deadline Reminder System
 *
 * Types for SARS deadline tracking and reminders.
 */

/**
 * SARS deadline submission types.
 *
 * Naming note — two systems, two names for the same annual reconciliation:
 *
 *   'IRP5'   — legacy name used by SarsDeadlineService (and the Prisma
 *               SubmissionType DB enum). Kept for backward compatibility with
 *               SarsDeadlineProcessor which has case 'IRP5' switch arms.
 *               Maps to the annual May-31 reconciliation deadline.
 *
 *   'EMP501' — canonical SARS form name used by SarsReadinessService and the
 *               SARS eFiling portal. This is the EMP501 Employer Annual
 *               Reconciliation Declaration (EMP501 §2).
 *
 * Resolution path (owner in parens):
 *   1. schema-guardian: add EMP501 to the Prisma SubmissionType enum.
 *   2. platform-engineer: update SarsDeadlineProcessor case arms ('IRP5' -> 'EMP501').
 *   3. After (2): update SarsDeadlineService iteration list to 'EMP501';
 *      remove the checkSubmissionStatus EMP501->IRP5 alias.
 *   4. Deprecate 'IRP5' from this union.
 */
export type SarsDeadlineType = 'VAT201' | 'EMP201' | 'IRP5' | 'EMP501';

/**
 * Upcoming deadline information
 */
export interface UpcomingDeadline {
  type: SarsDeadlineType;
  deadline: Date;
  daysRemaining: number;
  period: string;
  isSubmitted: boolean;
  submittedAt?: Date;
}

/**
 * Deadline reminder preferences
 */
export interface DeadlineReminderPrefs {
  reminderDays: number[];
  channels: ('email' | 'whatsapp')[];
  recipientEmails: string[];
  enabled: boolean;
}

/**
 * Deadline reminder record
 */
export interface DeadlineReminder {
  id: string;
  tenantId: string;
  type: SarsDeadlineType;
  period: string;
  daysRemaining: number;
  sentAt: Date;
  channel: 'email' | 'whatsapp';
  recipients: string[];
}

/**
 * Default reminder days (30, 14, 7, 3, 1 before deadline)
 */
export const DEFAULT_REMINDER_DAYS = [30, 14, 7, 3, 1] as const;

/**
 * VAT201 filing frequency per SARS VAT category (VAT Act 89/1991 §27–28).
 *
 * Cat A/B → BIMONTHLY (bi-monthly, alternating pairs of calendar months).
 * Cat C   → MONTHLY   (turnover ≥ R30M or SARS-directed).
 * Cat D   → BIANNUAL  (farming / select industries).
 * Cat E   → ANNUAL    (small-scale specific).
 * Cat F   → QUADMONTHLY (4-monthly, small business).
 *
 * Returns null for unknown/unregistered — caller should treat as not applicable.
 */
export type Vat201FilingFrequency =
  | 'BIMONTHLY'
  | 'MONTHLY'
  | 'BIANNUAL'
  | 'ANNUAL'
  | 'QUADMONTHLY';

export function getVat201Frequency(
  vatCategory: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null | undefined,
): Vat201FilingFrequency | null {
  switch (vatCategory) {
    case 'A':
    case 'B':
      return 'BIMONTHLY';
    case 'C':
      return 'MONTHLY';
    case 'D':
      return 'BIANNUAL';
    case 'E':
      return 'ANNUAL';
    case 'F':
      return 'QUADMONTHLY';
    default:
      return null;
  }
}

/**
 * SARS deadline calendar
 * Defines when each return type is due.
 *
 * Note: VAT201.frequency reflects the most common category (A/B = BIMONTHLY).
 * For per-tenant frequency resolution use getVat201Frequency(tenant.vatCategory).
 */
export const SARS_DEADLINE_CALENDAR = {
  /**
   * VAT201: Due 25th of month following bi-monthly period end (Cat A/B).
   * Cat C is monthly; Cat D/E/F are rare manual cadences.
   * Default shown here is BIMONTHLY (Cat A/B — most common).
   */
  VAT201: {
    dayOfMonth: 25,
    monthOffset: 1, // Following month after period end
    frequency: 'BIMONTHLY' as const,
  },
  /**
   * EMP201: Due 7th of following month
   * Monthly PAYE returns
   */
  EMP201: {
    dayOfMonth: 7,
    monthOffset: 1, // Following month
    frequency: 'MONTHLY' as const,
  },
  /**
   * IRP5: Due end of May annually (legacy name — see SarsDeadlineType comment).
   * Kept while SarsDeadlineProcessor still dispatches on case 'IRP5'.
   * @deprecated Prefer EMP501. Remove after processor switch arms are updated.
   */
  IRP5: {
    dayOfMonth: 31,
    monthOfYear: 4, // May (0-indexed)
    frequency: 'ANNUAL' as const,
  },
  /**
   * EMP501: Employer Annual Reconciliation Declaration (EMP501 §2).
   * Canonical SARS form name. Same deadline slot as IRP5: May 31 (interim),
   * Oct 31 (annual) — SarsReadinessService.emp501Window() handles both dates.
   */
  EMP501: {
    dayOfMonth: 31,
    monthOfYear: 4, // May 31 interim; Oct 31 handled by SarsReadinessService
    frequency: 'ANNUAL' as const,
  },
} as const;

/**
 * Deadline check job data
 */
export interface SarsDeadlineCheckJobData {
  tenantId: string;
  triggeredBy: 'cron' | 'manual' | 'event';
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
}
