import {
  IsUUID,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsDate,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { EnrollmentStatus } from '../entities/enrollment.entity';

export class CreateEnrollmentDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  childId!: string;

  @IsUUID()
  feeStructureId!: string;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @IsOptional()
  @IsBoolean()
  siblingDiscountApplied?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  customFeeOverrideCents?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEnrollmentDto extends PartialType(CreateEnrollmentDto) {}

export class EnrollmentFilterDto {
  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsUUID()
  feeStructureId?: string;

  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}
