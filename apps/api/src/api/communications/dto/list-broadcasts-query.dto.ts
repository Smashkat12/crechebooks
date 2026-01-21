/**
 * List Broadcasts Query DTO
 * TASK-COMM-003: Communication API Controller
 *
 * Query parameters for listing broadcasts with filtering and pagination.
 */

import {
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  BroadcastStatus,
  RecipientType,
} from '../../../communications/types/communication.types';

/**
 * Query parameters for listing broadcasts
 */
export class ListBroadcastsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by broadcast status',
    enum: BroadcastStatus,
  })
  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;

  @ApiPropertyOptional({
    description: 'Filter by recipient type',
    enum: RecipientType,
  })
  @IsOptional()
  @IsEnum(RecipientType)
  recipient_type?: RecipientType;

  @ApiPropertyOptional({
    description: 'Page number (1-indexed)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
