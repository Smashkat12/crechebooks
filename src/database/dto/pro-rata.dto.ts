/**
 * Pro-rata Calculation DTOs
 * TASK-BILL-014: Pro-rata Calculation Service
 *
 * @module database/dto/pro-rata
 * @description DTOs for pro-rata fee calculations including input
 * parameters and detailed calculation breakdowns.
 */

import { IsUUID, IsInt, IsDate, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Reason for excluding a day from billing
 */
export type ExclusionReason = 'WEEKEND' | 'PUBLIC_HOLIDAY' | 'CLOSURE';

/**
 * Details of an excluded day in the billing period
 */
export interface ExcludedDay {
  date: Date;
  reason: ExclusionReason;
}

/**
 * Detailed breakdown of a pro-rata calculation
 */
export interface ProRataCalculation {
  /** Original monthly fee in cents */
  originalAmountCents: number;

  /** Calculated pro-rata amount in cents (using banker's rounding) */
  proRataAmountCents: number;

  /** Daily rate in cents (monthly fee / school days) */
  dailyRateCents: number;

  /** Total calendar days in the month */
  totalDaysInMonth: number;

  /** Number of school days in the full month (excludes weekends, holidays, closures) */
  schoolDaysInMonth: number;

  /** Number of days actually billed */
  billedDays: number;

  /** Billing period start date (inclusive) */
  startDate: Date;

  /** Billing period end date (inclusive) */
  endDate: Date;

  /** List of excluded days with reasons */
  excludedDays: ExcludedDay[];
}

/**
 * Input DTO for pro-rata calculation
 */
export class CalculateProRataDto {
  @IsInt()
  @Min(0)
  monthlyFeeCents!: number;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @IsUUID()
  tenantId!: string;
}

/**
 * Input DTO for getting school days in a period
 */
export class GetSchoolDaysDto {
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @IsUUID()
  tenantId!: string;
}

/**
 * Input DTO for calculating daily rate
 */
export class CalculateDailyRateDto {
  @IsInt()
  @Min(0)
  monthlyFeeCents!: number;

  @Type(() => Date)
  @IsDate()
  month!: Date;

  @IsUUID()
  tenantId!: string;
}

/**
 * Input DTO for mid-month enrollment calculation
 */
export class MidMonthEnrollmentDto {
  @IsInt()
  @Min(0)
  monthlyFeeCents!: number;

  @Type(() => Date)
  @IsDate()
  enrollmentDate!: Date;

  @Type(() => Date)
  @IsDate()
  monthEnd!: Date;

  @IsUUID()
  tenantId!: string;
}

/**
 * Input DTO for mid-month withdrawal calculation
 */
export class MidMonthWithdrawalDto {
  @IsInt()
  @Min(0)
  monthlyFeeCents!: number;

  @Type(() => Date)
  @IsDate()
  monthStart!: Date;

  @Type(() => Date)
  @IsDate()
  withdrawalDate!: Date;

  @IsUUID()
  tenantId!: string;
}
