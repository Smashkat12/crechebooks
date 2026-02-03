/**
 * TASK-FIX-005: Bank Fee Configuration DTOs
 * Data transfer objects for bank fee API endpoints
 */
import {
  IsString,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BankFeeType,
  TransactionType,
} from '../../../database/services/bank-fee.service';

export class FeeRuleDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsEnum(BankFeeType)
  feeType: BankFeeType;

  @IsArray()
  @IsEnum(TransactionType, { each: true })
  transactionTypes: TransactionType[];

  @IsNumber()
  fixedAmountCents: number;

  @IsOptional()
  @IsNumber()
  percentageRate?: number;

  @IsOptional()
  @IsNumber()
  minimumAmountCents?: number;

  @IsOptional()
  @IsNumber()
  maximumAmountCents?: number;

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateBankFeeConfigDto {
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeRuleDto)
  feeRules?: FeeRuleDto[];

  @IsOptional()
  @IsNumber()
  defaultTransactionFeeCents?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class ApplyBankPresetDto {
  @IsString()
  bankCode: string;
}
