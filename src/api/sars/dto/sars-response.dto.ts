/**
 * SARS Response DTOs
 * TASK-SARS-031: SARS Controller and DTOs
 *
 * Response DTOs for SARS submission operations.
 * Uses snake_case for external API consistency.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SarsSubmissionDataDto {
  @ApiProperty({ example: 'uuid-here' })
  id!: string;

  @ApiProperty({ example: 'VAT201', enum: ['VAT201', 'EMP201', 'IRP5'] })
  submission_type!: string;

  @ApiProperty({ example: '2025-01', description: 'Period in YYYY-MM format' })
  period!: string;

  @ApiProperty({
    example: 'SUBMITTED',
    enum: ['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED'],
  })
  status!: string;

  @ApiPropertyOptional({ example: '2025-01-25T14:30:00.000Z' })
  submitted_at!: string | null;

  @ApiPropertyOptional({ example: 'SARS-REF-2025-001234' })
  sars_reference!: string | null;

  @ApiProperty({ example: false })
  is_finalized!: boolean;
}

export class SarsSubmissionResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: SarsSubmissionDataDto })
  data!: SarsSubmissionDataDto;
}
