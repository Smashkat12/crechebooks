/**
 * Recurring Pattern DTOs
 * TASK-TRANS-019: Recurring Transaction Detection Integration
 *
 * @module database/dto/recurring-pattern
 * @description Data transfer objects for recurring transaction patterns
 */

import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { VatType } from '../entities/categorization.entity';

/**
 * Recurring frequency types
 */
export enum RecurringFrequency {
  WEEKLY = 'WEEKLY',
  BI_WEEKLY = 'BI_WEEKLY',
  MONTHLY = 'MONTHLY',
}

/**
 * Detection constants for recurring pattern analysis
 */
export const RECURRING_DETECTION_CONSTANTS = {
  /** Minimum occurrences to detect pattern */
  MIN_OCCURRENCES: 3,

  /** Detection window in months */
  DETECTION_WINDOW_MONTHS: 12,

  /** Interval values in days */
  WEEKLY_INTERVAL: 7,
  BI_WEEKLY_INTERVAL: 14,
  MONTHLY_INTERVAL: 30,

  /** Tolerance values in days */
  WEEKLY_TOLERANCE_DAYS: 1,
  BI_WEEKLY_TOLERANCE_DAYS: 2,
  MONTHLY_TOLERANCE_DAYS: 3,

  /** Confidence threshold for auto-apply */
  AUTO_APPLY_THRESHOLD: 80,
} as const;

/**
 * DTO for creating a manual recurring pattern
 */
export class CreateRecurringPatternDto {
  @IsString()
  payeeName!: string;

  @IsEnum(RecurringFrequency)
  frequency!: RecurringFrequency;

  @IsNumber()
  @Min(0)
  expectedAmountCents!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  amountVariancePercent!: number;

  @IsString()
  accountCode!: string;

  @IsString()
  accountName!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * Result from recurring pattern detection
 */
export interface RecurringMatch {
  patternId: string;
  payeeName: string;
  frequency: RecurringFrequency;
  confidence: number;
  expectedAmountCents: number;
  amountVariance: number;
  intervalDays: number;
  nextExpectedDate: Date;
  suggestedAccountCode: string;
  suggestedAccountName: string | null;
}

/**
 * Recurring pattern data structure
 */
export interface RecurringPattern {
  id: string;
  tenantId: string;
  payeePattern: string;
  frequency: RecurringFrequency;
  expectedAmountCents: number;
  amountVariancePercent: number;
  intervalDays: number;
  lastOccurrence: Date | null;
  nextExpectedDate: Date | null;
  occurrenceCount: number;
  accountCode: string;
  accountName: string | null;
  vatType: VatType;
  confidence: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
