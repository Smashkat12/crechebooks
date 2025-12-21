/**
 * VAT Calculation DTOs and Interfaces
 * TASK-SARS-011
 *
 * South African VAT rate: 15%
 * All monetary values in CENTS (integers)
 */

// Note: VatType is exported from entities, not re-exported here to avoid conflicts

/**
 * Result of VAT calculation for a period
 * All amounts in CENTS
 */
export interface VatCalculationResult {
  /** Total amount excluding VAT in cents */
  totalExcludingVatCents: number;

  /** VAT amount in cents */
  vatAmountCents: number;

  /** Total amount including VAT in cents */
  totalIncludingVatCents: number;

  /** Standard-rated (15%) amount in cents */
  standardRatedCents: number;

  /** Zero-rated (0% but claimable) amount in cents */
  zeroRatedCents: number;

  /** Exempt (0% not claimable) amount in cents */
  exemptCents: number;

  /** Number of items included in calculation */
  itemCount: number;
}

/**
 * Severity levels for VAT validation issues
 */
export type VatFlagSeverity = 'WARNING' | 'ERROR';

/**
 * An item flagged for VAT compliance issues
 */
export interface VatFlaggedItem {
  /** Transaction ID if from a transaction */
  transactionId?: string;

  /** Invoice ID if from an invoice */
  invoiceId?: string;

  /** Description of the item */
  description: string;

  /** Issue description */
  issue: string;

  /** Amount in cents */
  amountCents: number;

  /** Severity of the issue */
  severity: VatFlagSeverity;
}

/**
 * Result of VAT validation
 */
export interface VatValidationResult {
  /** Whether the item passes validation */
  isValid: boolean;

  /** List of errors (blocking issues) */
  errors: string[];

  /** List of warnings (non-blocking issues) */
  warnings: string[];
}

/**
 * DTO for output VAT calculation request
 */
export interface CalculateOutputVatDto {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * DTO for input VAT calculation request
 */
export interface CalculateInputVatDto {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * DTO for getting flagged items
 */
export interface GetFlaggedItemsDto {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
}
