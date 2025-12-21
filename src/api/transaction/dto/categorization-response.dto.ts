import { ApiProperty } from '@nestjs/swagger';
import { CategorizationSource } from '../../../database/entities/categorization.entity';

export class CategorizationResponseDto {
  @ApiProperty({
    example: '5100',
    description: 'Account code from chart of accounts',
  })
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies', description: 'Account name' })
  account_name: string;

  @ApiProperty({ example: 92.5, description: 'AI confidence score (0-100)' })
  confidence_score: number;

  @ApiProperty({
    enum: CategorizationSource,
    example: 'AI_AUTO',
    description: 'Source of categorization',
  })
  source: CategorizationSource;

  @ApiProperty({
    required: false,
    description: 'When categorization was reviewed by user',
    example: '2025-01-15T10:30:00Z',
  })
  reviewed_at?: Date;
}
