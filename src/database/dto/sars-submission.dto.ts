import {
  IsUUID,
  IsOptional,
  IsEnum,
  IsInt,
  IsDate,
  IsString,
  IsObject,
  IsBoolean,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  SubmissionType,
  SubmissionStatus,
} from '../entities/sars-submission.entity';

/**
 * DTO for creating a new SARS submission
 * Used when preparing tax returns (VAT201, EMP201, IRP5)
 */
export class CreateSarsSubmissionDto {
  @IsUUID()
  tenantId!: string;

  @IsEnum(SubmissionType)
  submissionType!: SubmissionType;

  @Type(() => Date)
  @IsDate()
  periodStart!: Date;

  @Type(() => Date)
  @IsDate()
  periodEnd!: Date;

  @Type(() => Date)
  @IsDate()
  deadline!: Date;

  @IsOptional()
  @IsInt()
  outputVatCents?: number;

  @IsOptional()
  @IsInt()
  inputVatCents?: number;

  @IsOptional()
  @IsInt()
  netVatCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalPayeCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalUifCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalSdlCents?: number;

  @IsOptional()
  @IsObject()
  documentData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for updating an existing SARS submission
 * Extends CreateSarsSubmissionDto with optional fields
 * Note: Cannot update if isFinalized is true (enforced in repository)
 */
export class UpdateSarsSubmissionDto extends PartialType(
  CreateSarsSubmissionDto,
) {
  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;
}

/**
 * DTO for submitting a SARS return
 * Sets submittedBy, submittedAt, and transitions status to SUBMITTED
 */
export class SubmitSarsSubmissionDto {
  @IsUUID()
  submittedBy!: string;

  @IsOptional()
  @IsString()
  sarsReference?: string;
}

/**
 * DTO for acknowledging a SARS submission
 * Sets sarsReference and transitions status to ACKNOWLEDGED
 */
export class AcknowledgeSarsSubmissionDto {
  @IsString()
  sarsReference!: string;
}

/**
 * DTO for filtering SARS submissions when querying
 */
export class SarsSubmissionFilterDto {
  @IsOptional()
  @IsEnum(SubmissionType)
  submissionType?: SubmissionType;

  @IsOptional()
  @IsEnum(SubmissionStatus)
  status?: SubmissionStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  periodEnd?: Date;

  @IsOptional()
  @IsBoolean()
  isFinalized?: boolean;
}
