import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Request DTO for transaction import
 * Source is auto-detected from file extension (.csv or .pdf)
 */
export class ImportTransactionsRequestDto {
  @ApiProperty({
    description: 'Bank account identifier for imported transactions',
    example: 'fnb-business-001',
  })
  @IsString()
  @IsNotEmpty()
  bank_account: string;
}

/**
 * Error details for import failures
 */
export class ImportErrorDto {
  @ApiPropertyOptional({
    example: 5,
    description: 'Row number where error occurred',
  })
  row?: number;

  @ApiPropertyOptional({
    example: 'amount',
    description: 'Field that caused the error',
  })
  field?: string;

  @ApiProperty({
    example: 'Invalid amount format',
    description: 'Human-readable error message',
  })
  message: string;

  @ApiProperty({
    example: 'INVALID_AMOUNT',
    description: 'Machine-readable error code',
  })
  code: string;
}

/**
 * Auto-categorization statistics
 */
export class CategorizationStatsDto {
  @ApiProperty({
    example: 38,
    description: 'Transactions auto-categorized with high confidence',
  })
  auto_categorized: number;

  @ApiProperty({
    example: 4,
    description: 'Transactions requiring manual review',
  })
  review_required: number;
}

/**
 * Import result data
 */
export class ImportResultDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  import_batch_id: string;

  @ApiProperty({
    example: 'COMPLETED',
    enum: ['PROCESSING', 'COMPLETED', 'FAILED'],
  })
  status: string;

  @ApiProperty({ example: 'fnb-statement-2025-01.pdf' })
  file_name: string;

  @ApiProperty({
    example: 45,
    description: 'Total transactions parsed from file',
  })
  total_parsed: number;

  @ApiProperty({ example: 3, description: 'Duplicate transactions skipped' })
  duplicates_skipped: number;

  @ApiProperty({ example: 42, description: 'New transactions created' })
  transactions_created: number;

  @ApiProperty({
    type: [ImportErrorDto],
    description: 'Any errors encountered',
  })
  errors: ImportErrorDto[];

  @ApiPropertyOptional({
    type: CategorizationStatsDto,
    description:
      'Auto-categorization statistics (only present if categorization ran)',
  })
  categorization?: CategorizationStatsDto;
}

/**
 * Response DTO for transaction import
 */
export class ImportTransactionsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: ImportResultDataDto })
  data: ImportResultDataDto;
}
