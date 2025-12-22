/**
 * Categorization Service DTOs
 * TASK-TRANS-012: Transaction Categorization Service
 *
 * @module database/dto/categorization-service
 * @description Service-layer DTOs for categorization operations.
 * These interfaces are used internally by CategorizationService.
 */

import {
  IsString,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VatType,
  CategorizationSource,
} from '../entities/categorization.entity';
import { PayeePattern } from '@prisma/client';

/**
 * Result of categorizing a batch of transactions
 */
export interface CategorizationBatchResult {
  totalProcessed: number;
  autoCategorized: number;
  reviewRequired: number;
  failed: number;
  results: CategorizationItemResult[];
  statistics: {
    avgConfidence: number;
    patternMatchRate: number;
  };
}

/**
 * Result of categorizing a single transaction
 */
export interface CategorizationItemResult {
  transactionId: string;
  status: 'AUTO_APPLIED' | 'REVIEW_REQUIRED' | 'FAILED';
  accountCode?: string;
  accountName?: string;
  confidenceScore?: number;
  source: CategorizationSource;
  error?: string;
}

/**
 * Split item for split transactions
 */
export class SplitItemDto {
  @IsString()
  @MaxLength(20)
  accountCode!: string;

  @IsString()
  @MaxLength(100)
  accountName!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsEnum(VatType)
  vatType!: VatType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/**
 * DTO for user categorization override
 */
export class UserCategorizationDto {
  @IsString()
  @MaxLength(20)
  accountCode!: string;

  @IsString()
  @MaxLength(100)
  accountName!: string;

  @IsBoolean()
  isSplit!: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitItemDto)
  splits?: SplitItemDto[];

  @IsEnum(VatType)
  vatType!: VatType;

  @IsOptional()
  @IsBoolean()
  createPattern?: boolean;
}

/**
 * Category suggestion returned by getSuggestions
 */
export interface CategorySuggestion {
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  reason: string;
  source: 'PATTERN' | 'AI' | 'SIMILAR_TX';
}

/**
 * Result of pattern matching
 */
export interface PatternMatchResult {
  pattern: PayeePattern;
  confidenceBoost: number;
}

/**
 * AI categorization result (from placeholder or future Claude API)
 */
export interface AICategorization {
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  reasoning: string;
  vatType: VatType;
  isSplit: boolean;
  splits?: SplitItemDto[];
}

/**
 * Constants for categorization
 */
export const CATEGORIZATION_CONSTANTS = {
  /** Minimum confidence for auto-categorization */
  AUTO_THRESHOLD: 80,
  /** Confidence boost from pattern match */
  PATTERN_BOOST: 15,
  /** AI agent timeout in milliseconds */
  AI_TIMEOUT_MS: 30000,
  /** Maximum split tolerance in cents */
  SPLIT_TOLERANCE_CENTS: 1,
} as const;
