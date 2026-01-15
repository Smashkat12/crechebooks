/**
 * Child DTOs
 * SEC-006: Added input sanitization decorators
 *
 * Sanitizes:
 * - Names: Strips HTML, normalizes whitespace
 * - Medical Notes: Removes HTML, preserves newlines
 * - Emergency Contact: Strips HTML
 * - Emergency Phone: Normalizes phone format
 */

import {
  IsUUID,
  IsString,
  IsDate,
  IsOptional,
  IsBoolean,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { Gender } from '../entities/child.entity';
import {
  SanitizeName,
  SanitizeText,
  SanitizePhone,
} from '../../common/utils/sanitize.utils';

export class CreateChildDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  parentId!: string;

  @SanitizeName()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @SanitizeName()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @Type(() => Date)
  @IsDate()
  dateOfBirth!: Date;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @SanitizeText()
  @IsString()
  medicalNotes?: string;

  @IsOptional()
  @SanitizeName()
  @IsString()
  @MaxLength(200)
  emergencyContact?: string;

  @IsOptional()
  @SanitizePhone()
  @IsString()
  @MaxLength(20)
  emergencyPhone?: string;
}

export class UpdateChildDto extends PartialType(CreateChildDto) {}

export class ChildFilterDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}
