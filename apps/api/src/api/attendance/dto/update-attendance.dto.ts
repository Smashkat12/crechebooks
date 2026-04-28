/**
 * UpdateAttendanceDto
 *
 * PATCH /attendance/:id — edit status, times, or note.
 * childId and date are immutable; do NOT include them here.
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  IsISO8601,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class UpdateAttendanceDto {
  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({ description: 'Arrival timestamp (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  arrivalAt?: string;

  @ApiPropertyOptional({ description: 'Departure timestamp (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  departureAt?: string;

  @ApiPropertyOptional({ description: 'Optional note (max 500 chars)' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string;
}
