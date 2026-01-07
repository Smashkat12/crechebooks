/**
 * Off-Boarding DTOs
 * TASK-ENROL-005: Off-Boarding Workflow (Graduation & Withdrawal)
 *
 * @module database/dto/offboarding
 * @description Data transfer objects for off-boarding functionality
 */

import { IsUUID, IsOptional, IsEnum, IsDateString } from 'class-validator';

/**
 * Account settlement calculation result
 */
export interface AccountSettlement {
  parentId: string;
  parentName: string;
  childId: string;
  childName: string;
  outstandingBalance: number; // cents, positive = owes, negative = credit
  proRataCredit: number; // cents, credit for unused days
  netAmount: number; // cents, positive = owes, negative = owed to parent
  invoices: {
    id: string;
    invoiceNumber: string;
    totalCents: number;
    paidCents: number;
    status: string;
  }[];
}

/**
 * Off-boarding result
 */
export interface OffboardingResult {
  enrollmentId: string;
  status: 'GRADUATED' | 'WITHDRAWN';
  endDate: Date;
  settlement: AccountSettlement;
  creditAction: 'applied' | 'refunded' | 'donated' | 'sibling' | 'none';
  creditAmount: number; // cents
  finalStatementId: string | null;
}

/**
 * Credit handling options
 */
export type CreditAction = 'apply' | 'refund' | 'donate' | 'sibling' | 'none';

/**
 * Off-boarding reason
 */
export type OffboardingReason = 'GRADUATION' | 'WITHDRAWAL';

/**
 * DTO for initiating off-boarding
 */
export class InitiateOffboardingDto {
  @IsDateString()
  endDate!: string;

  @IsEnum(['GRADUATION', 'WITHDRAWAL'])
  reason!: OffboardingReason;

  @IsEnum(['apply', 'refund', 'donate', 'sibling', 'none'])
  creditAction!: CreditAction;

  @IsOptional()
  @IsUUID()
  siblingEnrollmentId?: string;
}
