/**
 * Xero Payroll Journal DTOs
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * DTOs for:
 * - Account mapping management (upsert, bulk update)
 * - Journal creation and posting
 * - Response/preview types
 */

import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsArray,
  IsInt,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { XeroAccountType, PayrollJournalStatus } from '@prisma/client';

// ============================================
// Account Mapping DTOs
// ============================================

/**
 * DTO for upserting a single account mapping
 */
export class UpsertAccountMappingDto {
  @IsEnum(XeroAccountType)
  accountType!: XeroAccountType;

  @IsString()
  @MaxLength(50)
  xeroAccountId!: string;

  @IsString()
  @MaxLength(20)
  xeroAccountCode!: string;

  @IsString()
  @MaxLength(200)
  xeroAccountName!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for bulk upserting account mappings
 */
export class BulkUpsertMappingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertAccountMappingDto)
  @ArrayMinSize(1)
  mappings!: UpsertAccountMappingDto[];
}

/**
 * DTO for filtering account mappings
 */
export class AccountMappingFilterDto {
  @IsOptional()
  @IsEnum(XeroAccountType)
  accountType?: XeroAccountType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ============================================
// Journal DTOs
// ============================================

/**
 * DTO for creating a payroll journal from a payroll record
 */
export class CreatePayrollJournalDto {
  @IsUUID()
  payrollId!: string;
}

/**
 * DTO for generating journals from a pay period
 */
export class GenerateJournalsFromPeriodDto {
  @IsString()
  payrollPeriodStart!: string;

  @IsString()
  payrollPeriodEnd!: string;
}

/**
 * DTO for bulk creating journals from multiple payrolls
 */
export class BulkCreateJournalsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  payrollIds!: string[];
}

/**
 * DTO for bulk posting journals to Xero
 */
export class BulkPostJournalsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  journalIds!: string[];
}

/**
 * DTO for retrying a failed journal
 */
export class RetryJournalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * DTO for filtering journals
 */
export class JournalFilterDto {
  @IsOptional()
  @IsEnum(PayrollJournalStatus)
  status?: PayrollJournalStatus;

  @IsOptional()
  @Type(() => Date)
  periodStart?: Date;

  @IsOptional()
  @Type(() => Date)
  periodEnd?: Date;

  @IsOptional()
  @IsUUID()
  payrollId?: string;
}

/**
 * DTO for cancelling a journal
 */
export class CancelJournalDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

// ============================================
// Response/Preview Types (not validated DTOs)
// ============================================

/**
 * Result of validating account mappings
 */
export interface AccountMappingValidationResult {
  isValid: boolean;
  missingMappings: XeroAccountType[];
  mappedAccounts: number;
  requiredAccounts: number;
}

/**
 * Preview of a journal before posting
 */
export interface JournalPreviewResponse {
  payrollId: string;
  staffName: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  narration: string;
  lines: JournalPreviewLine[];
  totalDebitCents: number;
  totalCreditCents: number;
  isBalanced: boolean;
}

/**
 * Individual line in journal preview
 */
export interface JournalPreviewLine {
  accountType: XeroAccountType;
  accountCode: string;
  accountName: string;
  description: string;
  debitCents: number;
  creditCents: number;
}

/**
 * Result of bulk posting journals
 */
export interface BulkPostResult {
  total: number;
  posted: number;
  failed: number;
  results: JournalPostResult[];
}

/**
 * Result of posting a single journal
 */
export interface JournalPostResult {
  journalId: string;
  payrollId: string;
  status: PayrollJournalStatus;
  xeroJournalId?: string;
  journalNumber?: string;
  errorMessage?: string;
}

/**
 * Suggested account mapping based on Xero chart of accounts
 */
export interface SuggestedMapping {
  accountType: XeroAccountType;
  suggestedAccount: {
    accountId: string;
    code: string;
    name: string;
  } | null;
  confidence: number;
  reason: string;
}

/**
 * Summary of account mapping status
 */
export interface AccountMappingSummary {
  totalRequired: number;
  totalMapped: number;
  isComplete: boolean;
  mappings: {
    accountType: XeroAccountType;
    isMapped: boolean;
    accountCode?: string;
    accountName?: string;
  }[];
}

/**
 * Statistics for payroll journals
 */
export interface JournalStats {
  total: number;
  pending: number;
  posted: number;
  failed: number;
  cancelled: number;
  totalDebitCents: number;
  totalCreditCents: number;
}
