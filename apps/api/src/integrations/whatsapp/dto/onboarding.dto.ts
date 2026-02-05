/**
 * Onboarding DTOs
 * TASK-WA-014: WhatsApp Onboarding Admin Visibility
 *
 * DTOs for admin endpoints to list/view onboarding sessions
 * and convert completed sessions to enrollments.
 */

import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsString,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListOnboardingDto {
  @ApiPropertyOptional({
    enum: ['IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateEnrollmentFromOnboardingDto {
  @ApiProperty({ description: 'Child ID to enroll' })
  @IsString()
  childId: string;

  @ApiProperty({ description: 'Fee structure ID' })
  @IsString()
  feeStructureId: string;

  @ApiProperty({ description: 'Enrollment start date (ISO)' })
  @IsDateString()
  startDate: string;
}
