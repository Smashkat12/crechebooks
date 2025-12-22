import {
  IsUUID,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
  VatType,
  CategorizationSource,
} from '../entities/categorization.entity';

export class CreateCategorizationDto {
  @IsUUID()
  transactionId!: string;

  @IsString()
  @MaxLength(20)
  accountCode!: string;

  @IsString()
  @MaxLength(100)
  accountName!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  confidenceScore!: number;

  @IsOptional()
  @IsString()
  reasoning?: string;

  @IsEnum(CategorizationSource)
  source!: CategorizationSource;

  @IsBoolean()
  isSplit!: boolean;

  @ValidateIf((o: CreateCategorizationDto) => o.isSplit === true)
  @IsInt()
  splitAmountCents?: number;

  @ValidateIf((o: CreateCategorizationDto) => o.vatType === VatType.STANDARD)
  @IsInt()
  vatAmountCents?: number;

  @IsEnum(VatType)
  vatType!: VatType;
}

export class UpdateCategorizationDto extends PartialType(
  CreateCategorizationDto,
) {}

export class ReviewCategorizationDto {
  @IsUUID()
  reviewedBy!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string;

  @IsOptional()
  @IsEnum(VatType)
  vatType?: VatType;

  @IsOptional()
  @IsInt()
  vatAmountCents?: number;
}

export class CategorizationFilterDto {
  @IsOptional()
  @IsEnum(CategorizationSource)
  source?: CategorizationSource;

  @IsOptional()
  @IsEnum(VatType)
  vatType?: VatType;

  @IsOptional()
  @IsBoolean()
  needsReview?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minConfidence?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
