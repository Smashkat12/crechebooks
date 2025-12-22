import {
  IsUUID,
  IsOptional,
  IsEnum,
  IsInt,
  IsDate,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { PayrollStatus } from '../entities/payroll.entity';

/**
 * DTO for creating a new payroll record
 * Used when processing monthly pay for staff
 */
export class CreatePayrollDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  staffId!: string;

  @Type(() => Date)
  @IsDate()
  payPeriodStart!: Date;

  @Type(() => Date)
  @IsDate()
  payPeriodEnd!: Date;

  @IsInt()
  @Min(0)
  basicSalaryCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  overtimeCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bonusCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  otherEarningsCents?: number;

  @IsInt()
  @Min(0)
  grossSalaryCents!: number;

  @IsInt()
  @Min(0)
  payeCents!: number;

  @IsInt()
  @Min(0)
  uifEmployeeCents!: number;

  @IsInt()
  @Min(0)
  uifEmployerCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  otherDeductionsCents?: number;

  @IsInt()
  netSalaryCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  medicalAidCreditCents?: number;

  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paymentDate?: Date;
}

/**
 * DTO for updating an existing payroll record
 * Extends CreatePayrollDto with optional fields
 */
export class UpdatePayrollDto extends PartialType(CreatePayrollDto) {}

/**
 * DTO for filtering payroll when querying
 */
export class PayrollFilterDto {
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodEnd?: Date;
}
