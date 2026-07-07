import {
  IsUUID,
  IsString,
  IsDate,
  IsInt,
  IsBoolean,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  ImportSource,
  TransactionStatus,
} from '../entities/transaction.entity';

export class CreateTransactionDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  xeroTransactionId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  bankAccount!: string;

  @Type(() => Date)
  @IsDate()
  date!: Date;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  payeeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsInt()
  amountCents!: number;

  @IsBoolean()
  isCredit!: boolean;

  @IsEnum(ImportSource)
  source!: ImportSource;

  @IsOptional()
  @IsUUID()
  importBatchId?: string;

  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  xeroAccountCode?: string;
}

export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @IsBoolean()
  isReconciled?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  reconciledAt?: Date;

  // TASK-TRANS-022: Reversal detection fields — allow the reversal service
  // and any future admin endpoint to update via the DTO surface instead of
  // reaching around Prisma directly.
  @IsOptional()
  @IsBoolean()
  isReversal?: boolean;

  @IsOptional()
  @IsUUID()
  reversesTransactionId?: string | null;
}

export class TransactionFilterDto {
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;

  @IsOptional()
  @IsBoolean()
  isReconciled?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

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
