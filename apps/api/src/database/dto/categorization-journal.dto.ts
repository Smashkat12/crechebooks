/**
 * Categorization Journal DTOs
 * TASK-XERO-007: Journal Entry Approach for Categorization Sync
 */

import { CategorizationJournalStatus } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsBoolean,
  IsOptional,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';

/**
 * DTO for creating a categorization journal
 */
export class CreateCategorizationJournalDto {
  @IsString()
  @IsNotEmpty()
  transactionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  fromAccountCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  toAccountCode!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsBoolean()
  isCredit!: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  narration!: string;
}

/**
 * Response DTO for categorization journal
 */
export class CategorizationJournalResponseDto {
  id!: string;
  transactionId!: string;
  xeroJournalId!: string | null;
  journalNumber!: string | null;
  status!: CategorizationJournalStatus;
  fromAccountCode!: string;
  toAccountCode!: string;
  amountCents!: number;
  isCredit!: boolean;
  narration!: string;
  postedAt!: Date | null;
  errorMessage!: string | null;
  createdAt!: Date;
}

/**
 * Filter DTO for listing categorization journals
 */
export class CategorizationJournalFilterDto {
  @IsOptional()
  @IsEnum(CategorizationJournalStatus)
  status?: CategorizationJournalStatus;

  @IsOptional()
  @IsString()
  transactionId?: string;
}

/**
 * Bulk post result DTO
 */
export class BulkCategorizationJournalPostResultDto {
  total!: number;
  posted!: number;
  failed!: number;
  results!: {
    journalId: string;
    transactionId: string;
    status: CategorizationJournalStatus;
    xeroJournalId?: string;
    errorMessage?: string;
  }[];
}

/**
 * Statistics for categorization journals
 */
export class CategorizationJournalStatsDto {
  pending!: number;
  posted!: number;
  failed!: number;
  totalAmountCents!: number;
}
