import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsISO8601,
  IsUUID,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';

export class ListInvoicesQueryDto {
  // tenantId is passed by frontend but ignored - we use JWT token instead
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description: 'Page number (1-based)',
    example: 1,
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
    example: 20,
  })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  @ApiProperty({
    required: false,
    enum: InvoiceStatus,
    description: 'Filter by invoice status',
    example: 'SENT',
  })
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  @ApiProperty({
    required: false,
    description: 'Filter by parent ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  parent_id?: string;

  @IsOptional()
  @IsUUID()
  @ApiProperty({
    required: false,
    description: 'Filter by child ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  child_id?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @ApiProperty({
    required: false,
    description: 'Filter from date (inclusive, YYYY-MM-DD)',
    example: '2025-01-01',
  })
  date_from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @ApiProperty({
    required: false,
    description: 'Filter to date (inclusive, YYYY-MM-DD)',
    example: '2025-01-31',
  })
  date_to?: string;
}
