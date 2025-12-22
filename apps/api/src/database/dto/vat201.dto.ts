/**
 * VAT201 Generation DTOs and Interfaces
 * TASK-SARS-014
 *
 * South African VAT201 return document structure
 * All monetary values in CENTS (integers)
 */
import { VatFlaggedItem } from './vat.dto';

/**
 * VAT201 form fields (simplified for initial version)
 * All amounts in CENTS
 */
export interface Vat201Fields {
  /** Field 1: Output tax on standard-rated supplies */
  field1OutputStandardCents: number;

  /** Field 2: Output tax on zero-rated supplies (0) */
  field2OutputZeroRatedCents: number;

  /** Field 3: Output tax on exempt supplies (0) */
  field3OutputExemptCents: number;

  /** Field 4: Total output tax */
  field4TotalOutputCents: number;

  /** Field 5: Input tax */
  field5InputTaxCents: number;

  /** Field 6: Total deductible input tax */
  field6DeductibleInputCents: number;

  /** Field 7: Adjustments (future) */
  field7AdjustmentsCents: number;

  /** Field 8: Imported services (future) */
  field8ImportedServicesCents: number;

  /** Field 9: Bad debts recovered (future) */
  field9BadDebtsCents: number;

  /** Field 10: Reverse adjustments (future) */
  field10ReverseAdjustmentsCents: number;

  /** Field 11: Credit transfer (future) */
  field11CreditTransferCents: number;

  /** Field 12: Vendor number related (N/A) */
  field12VendorCents: number;

  /** Field 13: Provisional payments (future) */
  field13ProvisionalCents: number;

  /** Field 14: Total output */
  field14TotalCents: number;

  /** Field 15: Net VAT */
  field15NetVatCents: number;

  /** Field 16: Payments made (future) */
  field16PaymentsCents: number;

  /** Field 17: Interest (future) */
  field17InterestCents: number;

  /** Field 18: Penalty (future) */
  field18PenaltyCents: number;

  /** Field 19: Total amount due/refundable */
  field19TotalDueCents: number;
}

/**
 * Complete VAT201 document
 */
export interface Vat201Document {
  /** Unique submission ID */
  submissionId: string;

  /** Tenant ID */
  tenantId: string;

  /** Tenant's VAT number */
  vatNumber: string;

  /** Period start date */
  periodStart: Date;

  /** Period end date */
  periodEnd: Date;

  /** All VAT201 fields */
  fields: Vat201Fields;

  /** Net VAT amount in cents (positive = due, negative = refund) */
  netVatCents: number;

  /** Whether VAT is due to SARS */
  isDueToSars: boolean;

  /** Whether a refund is due from SARS */
  isRefundDue: boolean;

  /** Items requiring review */
  flaggedItems: VatFlaggedItem[];

  /** Generation timestamp */
  generatedAt: Date;
}

/**
 * DTO for VAT201 generation request
 */
export interface GenerateVat201Dto {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Validation result for VAT201
 */
export interface Vat201ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
