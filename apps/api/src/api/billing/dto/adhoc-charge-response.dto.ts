/**
 * Ad-hoc Charge Response DTOs (API Layer)
 * REQ-BILL-009/011/012: Manual charges on invoices
 *
 * @module api/billing/dto/adhoc-charge-response
 * @description API response DTOs for ad-hoc charges (snake_case for frontend convention)
 */

import { ApiProperty } from '@nestjs/swagger';

/**
 * Single ad-hoc charge details
 */
export class AdhocChargeDto {
  @ApiProperty({ description: 'Invoice line ID' })
  line_id!: string;

  @ApiProperty({ description: 'Charge description' })
  description!: string;

  @ApiProperty({ description: 'Quantity' })
  quantity!: number;

  @ApiProperty({ description: 'Unit price in cents' })
  unit_price_cents!: number;

  @ApiProperty({ description: 'Subtotal in cents (quantity × unit price)' })
  subtotal_cents!: number;

  @ApiProperty({ description: 'VAT amount in cents' })
  vat_cents!: number;

  @ApiProperty({ description: 'Total in cents (subtotal + VAT)' })
  total_cents!: number;

  @ApiProperty({ description: 'Xero account code', nullable: true })
  account_code!: string | null;
}

/**
 * Response for adding an ad-hoc charge
 */
export class AddAdhocChargeResponseDto {
  @ApiProperty({ description: 'Success flag' })
  success!: boolean;

  @ApiProperty({ description: 'Created charge details and updated invoice totals' })
  data!: {
    /** Created invoice line ID */
    line_id: string;

    /** Invoice ID */
    invoice_id: string;

    /** Description of charge */
    description: string;

    /** Amount per unit in cents */
    amount_cents: number;

    /** Quantity */
    quantity: number;

    /** VAT amount in cents */
    vat_cents: number;

    /** Total line amount (including VAT) in cents */
    total_cents: number;

    /** Updated invoice subtotal in cents */
    invoice_subtotal_cents: number;

    /** Updated invoice VAT total in cents */
    invoice_vat_cents: number;

    /** Updated invoice total in cents */
    invoice_total_cents: number;
  };
}

/**
 * Response for listing ad-hoc charges
 */
export class ListAdhocChargesResponseDto {
  @ApiProperty({ description: 'Success flag' })
  success!: boolean;

  @ApiProperty({ description: 'List of ad-hoc charges for the invoice' })
  data!: {
    /** Invoice ID */
    invoice_id: string;

    /** Array of ad-hoc charges */
    charges: AdhocChargeDto[];

    /** Total count of ad-hoc charges */
    total_charges: number;

    /** Sum of all ad-hoc charge amounts (excluding VAT) in cents */
    total_amount_cents: number;
  };
}

/**
 * Response for removing an ad-hoc charge
 */
export class RemoveAdhocChargeResponseDto {
  @ApiProperty({ description: 'Success flag' })
  success!: boolean;

  @ApiProperty({ description: 'Success message' })
  message!: string;
}
