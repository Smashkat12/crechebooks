import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  IsDate,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { MatchType, MatchedBy } from '../entities/payment.entity';

/**
 * DTO for creating a new payment
 * Used when linking a bank transaction to an invoice
 */
export class CreatePaymentDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsString()
  xeroPaymentId?: string;

  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @IsUUID()
  invoiceId!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @Type(() => Date)
  @IsDate()
  paymentDate!: Date;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsEnum(MatchType)
  matchType!: MatchType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  matchConfidence?: number;

  @IsEnum(MatchedBy)
  matchedBy!: MatchedBy;
}

/**
 * DTO for updating an existing payment
 * Extends CreatePaymentDto with optional fields
 */
export class UpdatePaymentDto extends PartialType(CreatePaymentDto) {}

/**
 * DTO for reversing a payment
 * Requires a reason for audit trail
 */
export class ReversePaymentDto {
  @IsString()
  @MinLength(1)
  reversalReason!: string;
}

/**
 * DTO for filtering payments when querying
 */
export class PaymentFilterDto {
  @IsOptional()
  @IsUUID()
  transactionId?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsEnum(MatchType)
  matchType?: MatchType;

  @IsOptional()
  @IsEnum(MatchedBy)
  matchedBy?: MatchedBy;

  @IsOptional()
  isReversed?: boolean;
}
