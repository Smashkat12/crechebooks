/**
 * MarkAttendanceDto
 *
 * Single-child attendance mark (POST /attendance/).
 * date is accepted as YYYY-MM-DD ISO date string and must be today or in the past.
 * arrivalAt / departureAt are optional ISO 8601 timestamps; if both present,
 * departureAt must be after arrivalAt (validated in service).
 * note is capped at 500 chars and whitespace-collapsed.
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsISO8601,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class MarkAttendanceDto {
  @ApiProperty({ description: 'Child ID (UUID)' })
  @IsUUID()
  childId: string;

  @ApiProperty({
    description: 'Date in YYYY-MM-DD format (today or past)',
    example: '2026-04-27',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({ enum: AttendanceStatus, description: 'Attendance status' })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({
    description: 'Arrival timestamp (ISO 8601)',
    example: '2026-04-27T07:30:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  arrivalAt?: string;

  @ApiPropertyOptional({
    description: 'Departure timestamp (ISO 8601)',
    example: '2026-04-27T13:00:00.000Z',
  })
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
