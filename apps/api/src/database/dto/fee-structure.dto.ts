import {
  IsUUID,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsDate,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { FeeType } from '../entities/fee-structure.entity';

export class CreateFeeStructureDto {
  @IsUUID()
  tenantId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(FeeType)
  feeType!: FeeType;

  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  registrationFeeCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reRegistrationFeeCents?: number;

  @IsOptional()
  @IsBoolean()
  vatInclusive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  siblingDiscountPercent?: number;

  @Type(() => Date)
  @IsDate()
  effectiveFrom!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveTo?: Date;
}

export class UpdateFeeStructureDto extends PartialType(CreateFeeStructureDto) {}

export class FeeStructureFilterDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(FeeType)
  feeType?: FeeType;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveDate?: Date;
}
