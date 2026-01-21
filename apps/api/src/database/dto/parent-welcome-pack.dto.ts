/**
 * Parent Welcome Pack DTOs
 * TASK-ENROL-006: Parent Welcome Pack PDF Service
 *
 * Data Transfer Objects for parent welcome pack generation
 */

/**
 * Options for generating a parent welcome pack PDF
 */
export interface ParentWelcomePackOptions {
  /** Include emergency procedures section (default: true) */
  includeEmergencyProcedures?: boolean;
  /** Custom welcome message (overrides tenant's default) */
  customMessage?: string;
  /** Include fee structure breakdown (default: true) */
  includeFeeBreakdown?: boolean;
  /** Include what to bring checklist (default: true) */
  includeWhatToBring?: boolean;
}

/**
 * Result of welcome pack generation
 */
export interface ParentWelcomePackResult {
  /** Generated PDF as a Buffer */
  pdfBuffer: Buffer;
  /** Timestamp when the PDF was generated */
  generatedAt: Date;
}

/**
 * Enrollment data needed for welcome pack generation
 */
export interface WelcomePackEnrollmentData {
  enrollmentId: string;
  childFirstName: string;
  childLastName: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string | null;
  startDate: Date;
  feeTierName: string;
  monthlyFeeCents: number;
  registrationFeeCents: number;
  vatInclusive: boolean;
  siblingDiscountApplied: boolean;
  siblingDiscountPercent: number | null;
}

/**
 * Tenant info needed for welcome pack
 */
export interface WelcomePackTenantInfo {
  name: string;
  tradingName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  parentWelcomeMessage: string | null;
  operatingHours: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
}
