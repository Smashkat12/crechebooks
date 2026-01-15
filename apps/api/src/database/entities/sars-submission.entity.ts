/**
 * SarsSubmission Entity
 * TASK-SARS-005: Fix Submission Status Tracking
 *
 * Tracks all SARS tax returns (VAT201, EMP201, IRP5) for the creche.
 * Stores calculated tax amounts, submission status, SARS reference numbers,
 * and the complete return data as JSONB. The isFinalized flag makes records
 * immutable after submission to SARS, ensuring audit compliance.
 *
 * Status Flow:
 * DRAFT -> READY -> SUBMITTED -> ACCEPTED/REJECTED
 * If REJECTED, can retry: REJECTED -> SUBMITTED -> ACCEPTED/REJECTED
 */

export enum SubmissionType {
  VAT201 = 'VAT201',
  EMP201 = 'EMP201',
  IRP5 = 'IRP5',
}

/**
 * TASK-SARS-005: Enhanced submission status tracking
 *
 * Status flow:
 * - DRAFT: Initial state, submission is being prepared
 * - READY: Submission is validated and ready for SARS submission
 * - SUBMITTED: Submission has been sent to SARS, awaiting response
 * - ACCEPTED: SARS has accepted the submission
 * - REJECTED: SARS has rejected the submission (can be retried)
 * - ACKNOWLEDGED: Legacy status (mapped to ACCEPTED for backward compatibility)
 */
export enum SubmissionStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  /** @deprecated Use ACCEPTED instead - kept for backward compatibility */
  ACKNOWLEDGED = 'ACKNOWLEDGED',
}

/**
 * TASK-SARS-005: Retry tracking for failed submissions
 */
export interface ISubmissionRetry {
  attemptNumber: number;
  submittedAt: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  rejectionCode?: string;
}

export interface ISarsSubmission {
  id: string;
  tenantId: string;
  submissionType: SubmissionType;
  periodStart: Date;
  periodEnd: Date;
  deadline: Date;
  outputVatCents: number | null;
  inputVatCents: number | null;
  netVatCents: number | null;
  totalPayeCents: number | null;
  totalUifCents: number | null;
  totalSdlCents: number | null;
  status: SubmissionStatus;
  submittedAt: Date | null;
  submittedBy: string | null;
  sarsReference: string | null;
  documentData: Record<string, unknown>;
  notes: string | null;
  isFinalized: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** TASK-SARS-005: Retry tracking */
  retryCount?: number;
  lastRetryAt?: Date | null;
  retryHistory?: ISubmissionRetry[];
  /** TASK-SARS-005: Rejection details */
  rejectionReason?: string | null;
  rejectionCode?: string | null;
}
