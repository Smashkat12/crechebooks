import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * Request DTO for batch AI categorization
 */
export class BatchCategorizeRequestDto {
  @ApiPropertyOptional({
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    description:
      'Specific transaction IDs. If empty, categorizes all PENDING transactions.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  transaction_ids?: string[];

  @ApiPropertyOptional({
    example: false,
    description:
      'Force recategorize even if already categorized (default false)',
  })
  @IsOptional()
  @IsBoolean()
  force_recategorize?: boolean;
}

/**
 * Single transaction result in batch response
 */
export class BatchCategorizationItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  transaction_id: string;

  @ApiProperty({
    example: 'AUTO_APPLIED',
    enum: ['AUTO_APPLIED', 'REVIEW_REQUIRED', 'FAILED'],
  })
  status: string;

  @ApiPropertyOptional({ example: '5100' })
  account_code?: string;

  @ApiPropertyOptional({ example: 'Groceries & Supplies' })
  account_name?: string;

  @ApiPropertyOptional({ example: 85 })
  confidence_score?: number;

  @ApiProperty({
    example: 'RULE_BASED',
    enum: ['AI_AUTO', 'AI_SUGGESTED', 'RULE_BASED', 'USER_OVERRIDE'],
  })
  source: string;

  @ApiPropertyOptional({ example: 'Transaction not found' })
  error?: string;
}

/**
 * Statistics for batch result
 */
export class BatchStatisticsDto {
  @ApiProperty({ example: 82.5, description: 'Average confidence score' })
  avg_confidence: number;

  @ApiProperty({
    example: 45.2,
    description: 'Percentage of transactions matched by pattern',
  })
  pattern_match_rate: number;
}

/**
 * Response DTO for batch categorization
 */
export class BatchCategorizeResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  data: {
    total_processed: number;
    auto_categorized: number;
    review_required: number;
    failed: number;
    results: BatchCategorizationItemDto[];
    statistics: BatchStatisticsDto;
  };
}
