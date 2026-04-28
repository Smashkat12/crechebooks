/**
 * SARS Readiness DTOs
 *
 * Response shape for GET /sars/readiness — surfaces the next deadline and
 * any data gaps blocking the admin from filing.  Read-only, no mutations.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NextDeadlineDto {
  @ApiProperty({
    enum: ['EMP201', 'VAT201', 'EMP501', 'PROVISIONAL_TAX'],
    description: 'Filing type with the nearest due date',
  })
  type!: 'EMP201' | 'VAT201' | 'EMP501' | 'PROVISIONAL_TAX';

  @ApiProperty({
    example: '2026-04',
    description:
      'Reporting period — YYYY-MM for EMP201, YYYY-MM/YYYY-MM for VAT201',
  })
  period!: string;

  @ApiProperty({
    example: '2026-05-07',
    description: 'ISO YYYY-MM-DD due date',
  })
  dueDate!: string;

  @ApiProperty({
    example: 5,
    description: 'Days remaining (negative if overdue)',
  })
  daysRemaining!: number;
}

export class ReadinessBlockerDto {
  @ApiProperty({
    enum: ['critical', 'warning', 'info'],
    description: 'Severity level — critical blocks filing, warning is advisory',
  })
  severity!: 'critical' | 'warning' | 'info';

  @ApiProperty({ example: '12 transactions uncategorised' })
  label!: string;

  @ApiProperty({
    example:
      'Transactions without a chart-of-accounts category cannot be included in a VAT or income return.',
  })
  description!: string;

  @ApiPropertyOptional({
    example: '/transactions?status=uncategorised',
    description: 'App route to fix the issue; null if no direct fix exists',
    nullable: true,
  })
  deepLinkUrl!: string | null;

  @ApiProperty({ example: 12, description: 'Number of affected items' })
  count!: number;
}

export class SarsReadinessResponseDto {
  @ApiProperty({ type: NextDeadlineDto })
  nextDeadline!: NextDeadlineDto;

  @ApiProperty({
    type: [ReadinessBlockerDto],
    description: 'Only non-zero blockers are included',
  })
  blockers!: ReadinessBlockerDto[];

  @ApiProperty({
    description: 'true when there are no critical blockers',
  })
  ready!: boolean;
}
