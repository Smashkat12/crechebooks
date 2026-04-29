/**
 * DTOs for parent absence pre-reports.
 *
 * ReportAbsenceDto  — POST /parent-portal/children/:childId/absences
 * AbsenceReportResponseDto — response shape
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportAbsenceDto {
  @ApiProperty({
    description: 'Absence date in YYYY-MM-DD format (must be today or future)',
    example: '2026-04-30',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiPropertyOptional({
    description: 'Reason for absence (max 500 chars)',
    example: 'sick',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value,
  )
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AbsenceReportResponseDto {
  id: string;
  tenantId: string;
  childId: string;
  parentId: string;
  date: string; // YYYY-MM-DD
  reason: string | null;
  reportedAt: string; // ISO 8601
  cancelledAt: string | null; // ISO 8601 or null
  cancelledByParentId: string | null;
}

export class AbsenceReportListResponseDto {
  total: number;
  reports: AbsenceReportResponseDto[];
}
