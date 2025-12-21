import { ApiProperty } from '@nestjs/swagger';

/**
 * Single suggestion item
 */
export class SuggestionItemDto {
  @ApiProperty({ example: '5100' })
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies' })
  account_name: string;

  @ApiProperty({ example: 85, description: 'Confidence score 0-100' })
  confidence_score: number;

  @ApiProperty({ example: 'Matched payee pattern: Woolworths' })
  reason: string;

  @ApiProperty({ example: 'PATTERN', enum: ['PATTERN', 'AI', 'SIMILAR_TX'] })
  source: string;
}

/**
 * Response DTO for suggestions endpoint
 */
export class SuggestionsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [SuggestionItemDto] })
  data: SuggestionItemDto[];
}
