/**
 * BulkMarkAttendanceDto
 *
 * Mark attendance for multiple children on a single date
 * (POST /attendance/bulk).
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsISO8601,
  IsArray,
  ValidateNested,
  MaxLength,
  Matches,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';

export class BulkChildAttendanceDto {
  @ApiProperty({ description: 'Child ID (UUID)' })
  @IsUUID()
  childId: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

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

export class BulkMarkAttendanceDto {
  @ApiProperty({
    description: 'Date for all records (YYYY-MM-DD)',
    example: '2026-04-27',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({
    type: [BulkChildAttendanceDto],
    description: 'Per-child records (1–200)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkChildAttendanceDto)
  records: BulkChildAttendanceDto[];
}
