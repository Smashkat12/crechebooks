import {
  IsUUID,
  IsOptional,
  IsEnum,
  IsInt,
  IsDate,
  IsString,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ReconciliationStatus } from '../entities/reconciliation.entity';

/**
 * DTO for creating a new reconciliation
 * Used when starting a bank reconciliation for a specific period
 */
export class CreateReconciliationDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  bankAccount!: string;

  @Type(() => Date)
  @IsDate()
  periodStart!: Date;

  @Type(() => Date)
  @IsDate()
  periodEnd!: Date;

  @IsInt()
  openingBalanceCents!: number;

  @IsInt()
  closingBalanceCents!: number;

  @IsInt()
  calculatedBalanceCents!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for updating an existing reconciliation
 * Extends CreateReconciliationDto with optional fields
 * Note: Cannot update if status is RECONCILED (enforced in repository)
 */
export class UpdateReconciliationDto extends PartialType(
  CreateReconciliationDto,
) {
  @IsOptional()
  @IsInt()
  discrepancyCents?: number;
}

/**
 * DTO for completing a reconciliation
 * Sets reconciledBy, reconciledAt, and updates status
 */
export class CompleteReconciliationDto {
  @IsUUID()
  reconciledBy!: string;

  @IsEnum(ReconciliationStatus)
  status!: ReconciliationStatus;
}

/**
 * DTO for filtering reconciliations when querying
 */
export class ReconciliationFilterDto {
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsEnum(ReconciliationStatus)
  status?: ReconciliationStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodEnd?: Date;
}
