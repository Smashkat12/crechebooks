import {
  IsUUID,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  IsInt,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreatePayeePatternDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MaxLength(200)
  payeePattern!: string;

  @IsArray()
  @IsString({ each: true })
  payeeAliases!: string[];

  @IsString()
  @MaxLength(20)
  defaultAccountCode!: string;

  @IsString()
  @MaxLength(100)
  defaultAccountName!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  confidenceBoost?: number;

  @IsBoolean()
  isRecurring!: boolean;

  @ValidateIf((o: CreatePayeePatternDto) => o.isRecurring === true)
  @IsInt()
  expectedAmountCents?: number;

  @ValidateIf((o: CreatePayeePatternDto) => o.isRecurring === true)
  @IsNumber()
  @Min(0)
  @Max(100)
  amountVariancePercent?: number;
}

export class UpdatePayeePatternDto extends PartialType(CreatePayeePatternDto) {}

export class PayeePatternFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  accountCode?: string;
}
