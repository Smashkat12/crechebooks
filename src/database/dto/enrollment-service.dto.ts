/**
 * Enrollment Service DTOs
 * Service-layer DTOs for EnrollmentService operations
 */

import {
  IsUUID,
  IsDate,
  IsOptional,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EnrollmentStatus } from '../entities/enrollment.entity';

/**
 * DTO for enrolling a child
 */
export class EnrollChildDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  childId!: string;

  @IsUUID()
  feeStructureId!: string;

  @IsDate()
  @Type(() => Date)
  startDate!: Date;
}

/**
 * DTO for updating an enrollment
 */
export class UpdateEnrollmentServiceDto {
  @IsOptional()
  @IsUUID()
  feeStructureId?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @IsOptional()
  @IsInt()
  @Min(0)
  customFeeOverrideCents?: number;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}

/**
 * DTO for withdrawing a child
 */
export class WithdrawChildDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  enrollmentId!: string;

  @IsDate()
  @Type(() => Date)
  endDate!: Date;
}

/**
 * Result interface for sibling discount calculation
 */
export interface SiblingDiscountResult {
  childId: string;
  discountPercent: number;
  enrollmentId: string;
}
