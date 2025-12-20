/**
 * SarsSubmission Entity
 * Tracks all SARS tax returns (VAT201, EMP201, IRP5) for the creche.
 * Stores calculated tax amounts, submission status, SARS reference numbers,
 * and the complete return data as JSONB. The isFinalized flag makes records
 * immutable after submission to SARS, ensuring audit compliance.
 */

export enum SubmissionType {
  VAT201 = 'VAT201',
  EMP201 = 'EMP201',
  IRP5 = 'IRP5',
}

export enum SubmissionStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  SUBMITTED = 'SUBMITTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
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
}
