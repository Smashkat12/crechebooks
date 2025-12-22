/**
 * List Children Query DTO
 * TASK-BILL-034: Child Enrollment Endpoints
 *
 * @module api/billing/dto/list-children
 * @description Query DTO for listing children with pagination and filtering.
 * Uses snake_case for API query parameters.
 *
 * CRITICAL: NO MOCK DATA - fail fast with detailed error logging.
 */

import {
  IsOptional,
  IsInt,
  IsUUID,
  IsEnum,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EnrollmentStatus } from '../../../database/entities/enrollment.entity';

/**
 * Query parameters for GET /children endpoint
 */
export class ListChildrenQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description: 'Page number',
  })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Items per page',
  })
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false, description: 'Filter by parent ID' })
  parent_id?: string;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  @ApiProperty({
    required: false,
    enum: EnrollmentStatus,
    description: 'Filter by enrollment status',
  })
  enrollment_status?: EnrollmentStatus;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false, description: 'Search by child name' })
  search?: string;
}
