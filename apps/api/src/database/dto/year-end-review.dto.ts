/**
 * Year-End Review DTOs
 * TASK-ENROL-004: Year-End Processing Dashboard
 *
 * @module database/dto/year-end-review
 * @description Data transfer objects for year-end review functionality
 */

import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Individual student data for year-end review
 */
export interface YearEndStudent {
  enrollmentId: string;
  childId: string;
  childName: string;
  parentId: string;
  parentName: string;
  dateOfBirth: Date;
  ageOnJan1: number;
  category: 'continuing' | 'graduating' | 'withdrawing';
  graduationCandidate: boolean; // true if turning 6+
  currentStatus: string;
  accountBalance: number; // in cents, positive = owes, negative = credit
  feeTierName: string;
  feeStructureId: string;
}

/**
 * Complete year-end review result
 */
export interface YearEndReviewResult {
  academicYear: number; // e.g., 2026
  reviewPeriod: { start: Date; end: Date };
  students: {
    continuing: YearEndStudent[];
    graduating: YearEndStudent[];
    withdrawing: YearEndStudent[];
  };
  summary: {
    totalActive: number;
    continuingCount: number;
    graduatingCount: number;
    withdrawingCount: number;
    graduationCandidates: number;
    totalOutstanding: number; // Total outstanding balance in cents
    totalCredit: number; // Total credit balance in cents
  };
}

/**
 * Query parameters for year-end review
 */
export class YearEndReviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}
