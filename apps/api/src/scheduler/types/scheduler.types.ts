export const QUEUE_NAMES = {
  INVOICE_GENERATION: 'invoice-generation',
  PAYMENT_REMINDER: 'payment-reminder',
  SARS_DEADLINE: 'sars-deadline',
  BANK_SYNC: 'bank-sync',
  STATEMENT_GENERATION: 'statement-generation',
  SIMPLEPAY_SYNC: 'simplepay-sync',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface ScheduledJobData {
  tenantId: string;
  triggeredBy: 'cron' | 'manual' | 'event';
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
}

export interface InvoiceGenerationJobData extends ScheduledJobData {
  billingMonth: string; // YYYY-MM format
  dryRun?: boolean;
}

export interface PaymentReminderJobData extends ScheduledJobData {
  reminderType: 'gentle' | 'second' | 'final' | 'escalation';
  invoiceIds?: string[];
}

export interface SarsDeadlineJobData extends ScheduledJobData {
  submissionType: 'VAT201' | 'EMP201' | 'IRP5';
  daysUntilDeadline: number;
}

export interface BankSyncJobData extends ScheduledJobData {
  accountId?: string;
  fullSync?: boolean;
}

export interface StatementGenerationJobData extends ScheduledJobData {
  /** Statement period month in YYYY-MM format */
  statementMonth: string;
  /** Optional parent IDs to generate statements for. If omitted, generates for all active parents */
  parentIds?: string[];
  /** Only generate statements for parents with activity in the period */
  onlyWithActivity?: boolean;
  /** Only generate statements for parents with a non-zero balance */
  onlyWithBalance?: boolean;
  /** Whether this is a dry run (validate only, no creation) */
  dryRun?: boolean;
  /** Whether to auto-finalize generated statements */
  autoFinalize?: boolean;
  /** Whether to auto-deliver finalized statements */
  autoDeliver?: boolean;
}

export interface JobOptions {
  delay?: number;
  priority?: number;
  attempts?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: false,
};

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface JobStatus {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  attemptsMade: number;
  failedReason?: string;
  finishedOn?: Date;
}
