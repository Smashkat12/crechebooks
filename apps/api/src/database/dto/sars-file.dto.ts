/**
 * SARS File Generation DTOs
 * TASK-SARS-035: Replace Mock eFiling with File Generation
 *
 * DTOs for generating EMP201 and EMP501 CSV files for SARS submission.
 * Uses SimplePay as the source of truth for payroll data.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  Min,
  Max,
  Matches,
  IsOptional,
} from 'class-validator';

/**
 * Request DTO for EMP201 CSV download
 */
export class Emp201DownloadQueryDto {
  @ApiProperty({
    description: 'Tax year in YYYY format',
    example: '2025',
  })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'taxYear must be in YYYY format' })
  taxYear: string;

  @ApiProperty({
    description: 'Tax period (1-12 for monthly)',
    example: '1',
  })
  @IsString()
  @Matches(/^(1[0-2]|[1-9])$/, {
    message: 'taxPeriod must be between 1 and 12',
  })
  taxPeriod: string;
}

/**
 * Request DTO for EMP501 CSV download
 */
export class Emp501DownloadQueryDto {
  @ApiProperty({
    description: 'Tax year start date (YYYY-MM-DD)',
    example: '2025-03-01',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'taxYearStart must be in YYYY-MM-DD format',
  })
  taxYearStart: string;

  @ApiProperty({
    description: 'Tax year end date (YYYY-MM-DD)',
    example: '2026-02-28',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'taxYearEnd must be in YYYY-MM-DD format',
  })
  taxYearEnd: string;
}

/**
 * Internal structure for EMP201 CSV data
 */
export interface Emp201CsvData {
  /** Tax year */
  taxYear: number;

  /** Tax period (1-12) */
  taxPeriod: number;

  /** PAYE reference number */
  payeReference: string;

  /** Payment frequency (MONTHLY, WEEKLY, etc.) */
  paymentFrequency: string;

  /** Status code (0 = normal) */
  statusCode: number;

  /** PAYE amount in Rands */
  payeAmount: number;

  /** UIF amount in Rands */
  uifAmount: number;

  /** SDL amount in Rands */
  sdlAmount: number;

  /** ETI amount claimed in Rands */
  etiAmount: number;

  /** Total amount paid in Rands */
  totalAmount: number;

  /** Number of employees */
  employeeCount: number;
}

/**
 * Internal structure for EMP501 employee record
 */
export interface Emp501EmployeeRecord {
  /** Employee ID number */
  idNumber: string;

  /** Surname */
  surname: string;

  /** First name */
  firstName: string;

  /** Gross remuneration in Rands */
  grossRemuneration: number;

  /** PAYE deducted in Rands */
  paye: number;

  /** UIF employee contribution in Rands */
  uifEmployee: number;

  /** UIF employer contribution in Rands */
  uifEmployer: number;
}

/**
 * Internal structure for EMP501 CSV data
 */
export interface Emp501CsvData {
  /** Tax year start (YYYY-MM-DD) */
  taxYearStart: string;

  /** Tax year end (YYYY-MM-DD) */
  taxYearEnd: string;

  /** PAYE reference number */
  payeReference: string;

  /** Employee records */
  employees: Emp501EmployeeRecord[];

  /** Summary totals */
  summary: {
    totalGross: number;
    totalPaye: number;
    totalUifEmployee: number;
    totalUifEmployer: number;
  };
}

/**
 * Response type for file generation result
 */
export interface SarsFileResult {
  /** CSV content as string */
  content: string;

  /** Suggested filename */
  filename: string;

  /** Content type */
  contentType: string;
}
