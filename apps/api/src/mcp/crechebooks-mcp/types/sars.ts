/**
 * SARS Compliance Type Definitions
 * CrecheBooks MCP Server - SARS Operations
 *
 * L2 Autonomy: All operations generate DRAFTS only.
 * User must review and manually upload to SARS eFiling portal.
 *
 * South African tax compliance types for:
 * - VAT201: VAT returns (bi-monthly or monthly)
 * - EMP201: Monthly employer declaration (PAYE, UIF, SDL)
 *
 * Note: SubmissionType enum in Prisma schema only has: VAT201, EMP201, IRP5
 * EMP501 annual reconciliation is not in the schema.
 */

// ============================================
// Common SARS Types
// ============================================

/** SARS submission types (matches Prisma SubmissionType enum) */
export type SarsSubmissionType = 'VAT201' | 'EMP201' | 'IRP5';

/**
 * SARS submission status (matches Prisma SubmissionStatus enum)
 * Flow: DRAFT -> READY -> SUBMITTED -> ACCEPTED/REJECTED
 */
export type SarsSubmissionStatus =
  | 'DRAFT' // Generated, awaiting review
  | 'READY' // Reviewed, ready for submission
  | 'SUBMITTED' // Uploaded to SARS eFiling
  | 'ACCEPTED' // SARS confirmed receipt
  | 'REJECTED' // SARS rejected submission
  | 'ACKNOWLEDGED'; // Legacy status (maps to ACCEPTED)

/** L2 Autonomy result wrapper */
export interface L2DraftResult<T> {
  status: 'DRAFT';
  requiresReview: true;
  warning: string;
  data: T;
}

// ============================================
// VAT201 Types
// ============================================

/** Input for generate_vat201 tool */
export interface GenerateVat201Input {
  tenantId: string;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  userId?: string;
  dryRun?: boolean;
}

/** Output for generate_vat201 tool */
export interface GenerateVat201Output {
  id: string;
  status: SarsSubmissionStatus;
  periodStart: string;
  periodEnd: string;
  outputVatCents: number; // VAT on sales (collected)
  inputVatCents: number; // VAT on purchases (paid)
  netVatCents: number; // Output - Input
  isPayable: boolean; // true = pay SARS, false = claim refund
  flaggedItemsCount: number;
  flaggedItems: VatFlaggedItem[];
  createdAt: string;
}

/** VAT transaction requiring review */
export interface VatFlaggedItem {
  transactionId: string;
  description: string;
  amountCents: number;
  vatAmountCents: number;
  reason: string; // e.g., "No VAT invoice", "Unusual amount"
}

// ============================================
// EMP201 Types
// ============================================

/** Input for generate_emp201 tool */
export interface GenerateEmp201Input {
  tenantId: string;
  month: string; // YYYY-MM
  userId?: string;
  dryRun?: boolean;
}

/** Output for generate_emp201 tool */
export interface GenerateEmp201Output {
  id: string;
  status: SarsSubmissionStatus;
  periodMonth: string;
  staffCount: number;
  totalGrossRemunerationCents: number;
  totalPayeCents: number; // Pay As You Earn income tax
  totalUifCents: number; // Unemployment Insurance Fund
  totalSdlCents: number; // Skills Development Levy (calculated as 1% of gross)
  totalDueCents: number; // PAYE + UIF + SDL
  staffRecords: Emp201StaffRecord[];
  createdAt: string;
}

/** Individual staff record for EMP201 */
export interface Emp201StaffRecord {
  staffId: string;
  idNumber: string; // SA ID number (masked)
  name: string;
  grossRemunerationCents: number;
  payeCents: number;
  uifCents: number; // Combined employee + employer UIF
}

// ============================================
// Download Types
// ============================================

/** Input for download_sars_file tool */
export interface DownloadSarsFileInput {
  tenantId: string;
  submissionType: 'VAT201' | 'EMP201'; // Only VAT201 and EMP201 supported for download
  period: string; // YYYY-MM
}

/** Output for download_sars_file tool */
export interface DownloadSarsFileOutput {
  fileName: string;
  contentType: string;
  content: string; // Base64 encoded CSV
  submissionId: string;
}

// ============================================
// Submission Marking Types
// ============================================

/** Input for mark_sars_submitted tool */
export interface MarkSarsSubmittedInput {
  tenantId: string;
  submissionId: string;
  sarsReference: string;
  userId?: string;
}

/** Output for mark_sars_submitted tool */
export interface MarkSarsSubmittedOutput {
  submissionId: string;
  submissionType: SarsSubmissionType;
  status: 'SUBMITTED';
  sarsReference: string;
  submittedAt: string;
}

// ============================================
// Query Types
// ============================================

/** Input for list submissions */
export interface ListSarsSubmissionsInput {
  tenantId: string;
  submissionType?: SarsSubmissionType;
  status?: SarsSubmissionStatus;
  taxYear?: string;
  limit?: number;
}

/** SARS submission record for listing */
export interface SarsSubmissionRecord {
  id: string;
  submissionType: SarsSubmissionType;
  periodDisplay: string;
  status: SarsSubmissionStatus;
  netVatCents?: number;
  totalPayeCents?: number;
  totalUifCents?: number;
  totalSdlCents?: number;
  sarsReference: string | null;
  deadline: string;
  createdAt: string;
  submittedAt: string | null;
}

/** Input for deadlines query */
export interface GetSarsDeadlinesInput {
  tenantId: string;
  includeAll?: boolean;
}

/** SARS deadline record */
export interface SarsDeadlineRecord {
  submissionType: SarsSubmissionType;
  periodDisplay: string;
  deadline: string;
  submitted: boolean;
  submissionId: string | null;
}
