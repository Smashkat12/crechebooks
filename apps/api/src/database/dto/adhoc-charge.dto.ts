/**
 * Ad-hoc Charge DTOs
 * REQ-BILL-009/011/012: Manual charges on invoices
 *
 * @module database/dto/adhoc-charge
 * @description DTOs for adding, removing, and listing ad-hoc charges on invoices.
 * Ad-hoc charges use LineType.EXTRA and can only be added to DRAFT invoices.
 */

import {
  IsString,
  IsInt,
  IsOptional,
  IsNumber,
  Min,
  MinLength,
  MaxLength,
  IsPositive,
} from 'class-validator';

/**
 * DTO for creating an ad-hoc charge on an invoice
 */
export class CreateAdhocChargeDto {
  /**
   * Description of the ad-hoc charge
   * @example "Late pickup fee - December 15th"
   */
  @IsString()
  @MinLength(1, { message: 'Description must be at least 1 character' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description!: string;

  /**
   * Amount in cents (positive integer)
   * @example 5000 (R50.00)
   */
  @IsInt({ message: 'Amount must be an integer in cents' })
  @IsPositive({ message: 'Amount must be positive' })
  amountCents!: number;

  /**
   * Quantity (default 1)
   * @example 2
   */
  @IsOptional()
  @IsNumber()
  @IsPositive({ message: 'Quantity must be positive' })
  quantity?: number;

  /**
   * Optional Xero account code for mapping
   * @example "4100"
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountCode?: string;
}

/**
 * Response DTO for ad-hoc charge operations
 */
export interface AdhocChargeResponseDto {
  /** Created invoice line ID */
  lineId: string;

  /** Invoice ID */
  invoiceId: string;

  /** Description of charge */
  description: string;

  /** Amount in cents */
  amountCents: number;

  /** Quantity */
  quantity: number;

  /** VAT amount in cents */
  vatCents: number;

  /** Total line amount (including VAT) in cents */
  totalCents: number;

  /** Updated invoice subtotal in cents */
  invoiceSubtotalCents: number;

  /** Updated invoice VAT total in cents */
  invoiceVatCents: number;

  /** Updated invoice total in cents */
  invoiceTotalCents: number;
}

/**
 * Response DTO for listing ad-hoc charges
 */
export interface AdhocChargeListDto {
  /** Invoice ID */
  invoiceId: string;

  /** Array of ad-hoc charges */
  charges: Array<{
    lineId: string;
    description: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
    accountCode: string | null;
  }>;

  /** Total count of ad-hoc charges */
  totalCharges: number;

  /** Sum of all ad-hoc charge amounts (excluding VAT) in cents */
  totalAmountCents: number;
}
