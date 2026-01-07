/**
 * Fee Structure Entity
 * Defines pricing tiers for childcare services
 */

export enum FeeType {
  FULL_DAY = 'FULL_DAY',
  HALF_DAY = 'HALF_DAY',
  HOURLY = 'HOURLY',
  CUSTOM = 'CUSTOM',
}

export interface IFeeStructure {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  feeType: FeeType;
  amountCents: number;
  /** Registration fee in cents (one-time fee charged on enrollment for new students) */
  registrationFeeCents: number;
  /** Re-registration fee in cents (one-time fee charged for returning students who were previously WITHDRAWN or GRADUATED) */
  reRegistrationFeeCents: number;
  vatInclusive: boolean;
  siblingDiscountPercent: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
