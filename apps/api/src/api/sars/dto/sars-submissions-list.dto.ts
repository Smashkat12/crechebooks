/**
 * SARS Submissions List DTO
 * F-A-005: Submission history list endpoint
 *
 * Response shape for GET /sars/submissions.
 * Snake_case for external API consistency with the rest of the SARS controller.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SarsSubmissionListItemDto {
  @ApiProperty({ example: 'uuid-here' })
  id!: string;

  @ApiProperty({ example: 'EMP201', enum: ['VAT201', 'EMP201', 'EMP501'] })
  submission_type!: string;

  @ApiProperty({ example: '2026-03', description: 'Period in YYYY-MM format' })
  period!: string;

  @ApiProperty({
    example: 'SUBMITTED',
    enum: ['DRAFT', 'READY', 'SUBMITTED', 'ACKNOWLEDGED'],
  })
  status!: string;

  @ApiPropertyOptional({ example: '2026-04-05T10:30:00.000Z', nullable: true })
  submitted_at!: string | null;

  @ApiPropertyOptional({ example: 'SARS-REF-2026-001234', nullable: true })
  sars_reference!: string | null;

  @ApiProperty({ example: false })
  is_finalized!: boolean;

  @ApiProperty({ example: '2026-04-01T08:00:00.000Z' })
  created_at!: string;
}

export class SarsSubmissionsListDataDto {
  @ApiProperty({ type: [SarsSubmissionListItemDto] })
  items!: SarsSubmissionListItemDto[];

  @ApiProperty({ example: 12, description: 'Total matching records' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class SarsSubmissionsListResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: SarsSubmissionsListDataDto })
  data!: SarsSubmissionsListDataDto;
}
