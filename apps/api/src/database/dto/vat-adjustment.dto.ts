/**
 * VAT Adjustment DTOs and Interfaces
 * TASK-SARS-002: VAT201 Adjustment Fields (7-13)
 *
 * South African VAT201 form adjustment fields:
 * - Field 7: Change in use adjustments (Output)
 * - Field 8: Change in use adjustments (Input)
 * - Field 9: Other adjustments to output tax
 * - Field 10: Other adjustments to input tax
 * - Field 11: Bad debts written off
 * - Field 12: Bad debts recovered
 * - Field 13: Capital goods scheme adjustments
 *
 * All monetary values in CENTS (integers)
 */

import { VatAdjustmentType } from '@prisma/client';

/**
 * DTO for creating a VAT adjustment entry
 */
export interface CreateVatAdjustmentDto {
  tenantId?: string;
  adjustmentType: VatAdjustmentType;
  amountCents: number;
  adjustmentDate: Date;
  description: string;
  reference?: string;
  invoiceId?: string;
  transactionId?: string;
  notes?: string;
  createdBy: string;
}

/**
 * DTO for voiding a VAT adjustment
 */
export interface VoidVatAdjustmentDto {
  adjustmentId: string;
  tenantId?: string;
  voidedBy: string;
  voidReason: string;
}

/**
 * Result of aggregating VAT adjustments by type for a period
 */
export interface VatAdjustmentAggregation {
  /** Field 7: Change in use adjustments (Output) - increases output VAT */
  field7ChangeInUseOutputCents: number;

  /** Field 8: Change in use adjustments (Input) - decreases input VAT claim */
  field8ChangeInUseInputCents: number;

  /** Field 9: Other adjustments to output tax - increases output VAT */
  field9OtherOutputCents: number;

  /** Field 10: Other adjustments to input tax - decreases input VAT claim */
  field10OtherInputCents: number;

  /** Field 11: Bad debts written off - decreases output VAT */
  field11BadDebtsWrittenOffCents: number;

  /** Field 12: Bad debts recovered - increases output VAT */
  field12BadDebtsRecoveredCents: number;

  /** Field 13: Capital goods scheme adjustments - can be positive or negative */
  field13CapitalGoodsSchemeCents: number;

  /** Total count of adjustments in the period */
  adjustmentCount: number;
}

/**
 * DTO for querying adjustments by period
 */
export interface GetAdjustmentsForPeriodDto {
  tenantId?: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Validation rules for VAT adjustments
 */
export interface VatAdjustmentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Map of adjustment types to their VAT201 field numbers
 */
export const VAT_ADJUSTMENT_FIELD_MAP: Record<VatAdjustmentType, number> = {
  CHANGE_IN_USE_OUTPUT: 7,
  CHANGE_IN_USE_INPUT: 8,
  OTHER_OUTPUT: 9,
  OTHER_INPUT: 10,
  BAD_DEBTS_WRITTEN_OFF: 11,
  BAD_DEBTS_RECOVERED: 12,
  CAPITAL_GOODS_SCHEME: 13,
};

/**
 * Adjustments that increase output VAT (amounts owed to SARS)
 */
export const OUTPUT_INCREASING_ADJUSTMENTS: VatAdjustmentType[] = [
  'CHANGE_IN_USE_OUTPUT' as VatAdjustmentType,
  'OTHER_OUTPUT' as VatAdjustmentType,
  'BAD_DEBTS_RECOVERED' as VatAdjustmentType,
];

/**
 * Adjustments that decrease output VAT (reduce amounts owed to SARS)
 */
export const OUTPUT_DECREASING_ADJUSTMENTS: VatAdjustmentType[] = [
  'BAD_DEBTS_WRITTEN_OFF' as VatAdjustmentType,
];

/**
 * Adjustments that affect input VAT claims
 */
export const INPUT_ADJUSTMENTS: VatAdjustmentType[] = [
  'CHANGE_IN_USE_INPUT' as VatAdjustmentType,
  'OTHER_INPUT' as VatAdjustmentType,
];
