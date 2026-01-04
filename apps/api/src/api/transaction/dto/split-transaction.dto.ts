import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
  MaxLength,
  IsOptional,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Single split allocation item
 */
export class SplitAllocationDto {
  @ApiProperty({
    example: '5000',
    description: 'Category ID (account code from Chart of Accounts)',
  })
  @IsString()
  @MaxLength(20)
  categoryId: string;

  @ApiProperty({
    example: 'Salaries and Wages',
    description: 'Category name',
  })
  @IsString()
  @MaxLength(100)
  categoryName: string;

  @ApiProperty({
    example: 250000,
    description: 'Amount in cents (positive integer)',
  })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    example: 'Monthly salary payment',
    description: 'Optional description for this split',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/**
 * Request DTO for creating a split transaction
 */
export class CreateSplitTransactionDto {
  @ApiProperty({
    type: [SplitAllocationDto],
    description: 'Split allocations (minimum 2 required)',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => SplitAllocationDto)
  splits: SplitAllocationDto[];
}

/**
 * Response DTO for split transaction creation
 */
export class CreateSplitTransactionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  data: {
    transactionId: string;
    splits: Array<{
      id: string;
      categoryId: string;
      amount: number;
    }>;
  };
}
