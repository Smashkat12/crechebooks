/**
 * PAYE Calculation DTOs and Interfaces
 * TASK-SARS-012
 *
 * South African PAYE (Pay-As-You-Earn) tax
 * All monetary values in CENTS (integers)
 */
import { PayFrequency } from '@prisma/client';

/**
 * Result of PAYE calculation
 * All amounts in CENTS
 */
export interface PayeCalculationResult {
  /** Gross monthly income in cents */
  grossIncomeCents: number;

  /** Annualized income in cents */
  annualizedIncomeCents: number;

  /** Tax before rebates (annual) in cents */
  taxBeforeRebatesCents: number;

  /** Primary rebate in cents (annual) */
  primaryRebateCents: number;

  /** Secondary rebate in cents (annual) - age 65+ */
  secondaryRebateCents: number;

  /** Tertiary rebate in cents (annual) - age 75+ */
  tertiaryRebateCents: number;

  /** Total rebates in cents (annual) */
  totalRebatesCents: number;

  /** Tax after rebates (annual) in cents */
  taxAfterRebatesCents: number;

  /** Medical aid tax credits in cents (monthly) */
  medicalCreditsCents: number;

  /** Net PAYE payable in cents (monthly) */
  netPayeCents: number;

  /** Effective tax rate as percentage */
  effectiveRatePercent: number;

  /** Tax bracket index (0-6) */
  bracketIndex: number;
}

/**
 * DTO for PAYE calculation request
 */
export interface CalculatePayeDto {
  /** Gross income for the pay period in cents */
  grossIncomeCents: number;

  /** Pay frequency (MONTHLY, WEEKLY, DAILY, HOURLY) */
  payFrequency: PayFrequency;

  /** Employee's date of birth (for rebate calculation) */
  dateOfBirth: Date;

  /** Number of medical aid members (0 if none) */
  medicalAidMembers: number;
}

/**
 * Rebate type for specific rebate queries
 */
export enum RebateType {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
  TERTIARY = 'TERTIARY',
}
