import {
  IsOptional,
  IsUUID,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MatchType, MatchedBy } from '@prisma/client';

/**
 * Query DTO for listing payments with optional filters.
 * Uses snake_case for external API consumers.
 */
export class ListPaymentsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by invoice UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  invoice_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by transaction UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  transaction_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by match type',
    enum: MatchType,
    example: MatchType.MANUAL,
  })
  @IsOptional()
  @IsEnum(MatchType)
  match_type?: MatchType;

  @ApiPropertyOptional({
    description: 'Filter by matched by',
    enum: MatchedBy,
    example: MatchedBy.USER,
  })
  @IsOptional()
  @IsEnum(MatchedBy)
  matched_by?: MatchedBy;

  @ApiPropertyOptional({
    description: 'Filter by reversed status',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }): boolean | undefined => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  is_reversed?: boolean;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
