import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * VAT types for categorization
 */
export enum VatTypeApiEnum {
  STANDARD = 'STANDARD',
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  NO_VAT = 'NO_VAT',
}

/**
 * Split line item for split transactions
 */
export class SplitLineDto {
  @ApiProperty({ example: '5100', description: 'Chart of Accounts code' })
  @IsString()
  @MaxLength(20)
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies', description: 'Account name' })
  @IsString()
  @MaxLength(100)
  account_name: string;

  @ApiProperty({
    example: 15000,
    description: 'Amount in cents (positive integer)',
  })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @ApiProperty({ enum: VatTypeApiEnum, example: 'STANDARD' })
  @IsEnum(VatTypeApiEnum)
  vat_type: VatTypeApiEnum;

  @ApiPropertyOptional({
    example: 'Kitchen supplies',
    description: 'Optional description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/**
 * Request DTO for manual categorization update
 */
export class UpdateCategorizationRequestDto {
  @ApiProperty({ example: '5100', description: 'Chart of Accounts code' })
  @IsString()
  @MaxLength(20)
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies', description: 'Account name' })
  @IsString()
  @MaxLength(100)
  account_name: string;

  @ApiProperty({ example: false, description: 'Is this a split transaction' })
  @IsBoolean()
  is_split: boolean;

  @ApiPropertyOptional({
    type: [SplitLineDto],
    description: 'Split line items (required if is_split=true)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitLineDto)
  splits?: SplitLineDto[];

  @ApiProperty({ enum: VatTypeApiEnum, example: 'STANDARD' })
  @IsEnum(VatTypeApiEnum)
  vat_type: VatTypeApiEnum;

  @ApiPropertyOptional({
    example: true,
    description: 'Create pattern from correction (default true)',
  })
  @IsOptional()
  @IsBoolean()
  create_pattern?: boolean;
}

/**
 * Response DTO for categorization update
 */
export class UpdateCategorizationResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  data: {
    id: string;
    status: string;
    account_code: string;
    account_name: string;
    source: string;
    pattern_created: boolean;
  };
}
