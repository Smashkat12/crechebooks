import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsISO8601,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TransactionStatus } from '../../../database/entities/transaction.entity';

export class ListTransactionsQueryDto {
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
  @IsEnum(TransactionStatus)
  @ApiProperty({
    required: false,
    enum: TransactionStatus,
    description: 'Filter by transaction status',
    example: 'PENDING',
  })
  status?: TransactionStatus;

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

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @ApiProperty({
    required: false,
    description: 'Filter by reconciliation status',
    example: false,
  })
  is_reconciled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({
    required: false,
    description:
      'Search in description, payee name, or reference (case-insensitive)',
    example: 'Woolworths',
  })
  search?: string;
}
