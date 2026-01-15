/**
 * Xero Journal DTOs
 * TASK-STAFF-001: Implement Xero Journal Posting
 *
 * Data transfer objects for Xero manual journal entry operations.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Journal debits must equal credits for balanced entries.
 */

import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsOptional,
  IsDateString,
  Min,
  MinLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for a single journal line (debit or credit entry)
 */
export class JournalLineDto {
  @ApiProperty({
    description: 'Xero account code (e.g., "200" for Sales)',
    example: '200',
  })
  @IsString()
  @MinLength(1)
  accountCode: string;

  @ApiPropertyOptional({
    description: 'Line description/narration',
    example: 'Monthly childcare fees - January 2024',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Amount in cents (positive integer). Always positive; use isDebit to indicate direction.',
    example: 150000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  amountCents: number;

  @ApiProperty({
    description: 'True if this line is a debit, false if credit',
    example: true,
  })
  @IsBoolean()
  isDebit: boolean;

  @ApiPropertyOptional({
    description:
      'Tax type code (e.g., "NONE", "OUTPUT", "INPUT"). Defaults to "NONE".',
    example: 'OUTPUT',
  })
  @IsString()
  @IsOptional()
  taxType?: string;

  @ApiPropertyOptional({
    description: 'Optional tracking category name',
    example: 'Department',
  })
  @IsString()
  @IsOptional()
  trackingCategoryName?: string;

  @ApiPropertyOptional({
    description: 'Optional tracking option for the category',
    example: 'Sales',
  })
  @IsString()
  @IsOptional()
  trackingOptionName?: string;
}

/**
 * DTO for creating a manual journal entry in Xero
 */
export class CreateJournalDto {
  @ApiProperty({
    description: 'Journal date in ISO 8601 format (YYYY-MM-DD)',
    example: '2024-01-15',
  })
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'Journal narration/description that appears in Xero',
    example: 'January 2024 childcare fee adjustments',
  })
  @IsString()
  @MinLength(1)
  narration: string;

  @ApiProperty({
    description:
      'Array of journal lines. Must have at least 2 lines that balance (total debits = total credits).',
    type: [JournalLineDto],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];

  @ApiPropertyOptional({
    description: 'External reference number for the journal',
    example: 'INV-2024-001-ADJ',
  })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({
    description: 'URL that will appear in Xero linking back to the source',
    example: 'https://app.crechebooks.com/invoices/abc123',
  })
  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @ApiPropertyOptional({
    description:
      'If true, show journal in Reports Only (not Accounts Payable/Receivable)',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  showOnCashBasisReports?: boolean;
}

/**
 * Response DTO for a created journal entry
 */
export class JournalResponseDto {
  @ApiProperty({
    description: 'Xero Manual Journal ID (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  manualJournalId: string;

  @ApiProperty({
    description: 'Journal narration as stored in Xero',
    example: 'January 2024 childcare fee adjustments',
  })
  narration: string;

  @ApiProperty({
    description: 'Journal date in ISO 8601 format',
    example: '2024-01-15T00:00:00.000Z',
  })
  date: string;

  @ApiProperty({
    description: 'Journal status in Xero (DRAFT, POSTED, DELETED, VOIDED)',
    example: 'POSTED',
  })
  status: string;

  @ApiProperty({
    description: 'Total debit amount in cents',
    example: 150000,
  })
  totalDebitCents: number;

  @ApiProperty({
    description: 'Total credit amount in cents',
    example: 150000,
  })
  totalCreditCents: number;

  @ApiPropertyOptional({
    description: 'Reference number if provided',
    example: 'INV-2024-001-ADJ',
  })
  reference?: string;

  @ApiPropertyOptional({
    description: 'Line number in Xero',
  })
  lineNumber?: number;

  @ApiPropertyOptional({
    description: 'Warnings from Xero API if any',
    type: [String],
  })
  warnings?: string[];
}

/**
 * DTO for listing/querying journals
 */
export class ListJournalsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter journals modified since this date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsDateString()
  @IsOptional()
  modifiedSince?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination (starts at 1)',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({
    description: 'Filter by journal status',
    example: 'POSTED',
  })
  @IsString()
  @IsOptional()
  status?: string;
}

/**
 * DTO for bulk journal creation response
 */
export class BulkJournalResponseDto {
  @ApiProperty({
    description: 'Number of journals successfully created',
    example: 5,
  })
  created: number;

  @ApiProperty({
    description: 'Number of journals that failed',
    example: 0,
  })
  failed: number;

  @ApiProperty({
    description: 'Successfully created journals',
    type: [JournalResponseDto],
  })
  journals: JournalResponseDto[];

  @ApiProperty({
    description: 'Errors for failed journals',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        index: { type: 'number' },
        error: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  errors: Array<{
    index: number;
    error: string;
    code: string;
  }>;
}
