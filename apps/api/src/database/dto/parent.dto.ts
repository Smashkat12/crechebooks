/**
 * Parent DTOs
 * TASK-STAFF-002: Added SA-specific validation decorators
 * SEC-006: Added input sanitization decorators
 *
 * Validates:
 * - SA ID Number (13 digits with Luhn checksum) - optional for parents
 * - SA Phone Number (+27 or 0 prefix, mobile only)
 *
 * Sanitizes:
 * - Names: Strips HTML, normalizes whitespace
 * - Email: Converts to lowercase, trims
 * - Phone: Normalizes to +27 format
 * - ID Number: Removes non-digit characters
 * - Address/Notes: Removes HTML, preserves newlines
 */

import {
  IsUUID,
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { PreferredContact } from '../entities/parent.entity';
import { IsSAIDNumber, IsSAPhoneNumber } from '../../shared/validators';
import {
  SanitizeName,
  SanitizeEmail,
  SanitizePhone,
  SanitizeIdNumber,
  SanitizeText,
} from '../../common/utils/sanitize.utils';

export class CreateParentDto {
  @IsUUID()
  tenantId!: string;

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

  @IsOptional()
  @SanitizeEmail()
  @IsEmail()
  email?: string;

  @IsOptional()
  @SanitizePhone()
  @IsString({ message: 'Phone must be a string' })
  @IsSAPhoneNumber({
    message:
      'Phone must be a valid South African mobile number (format: +27XXXXXXXXX or 0XXXXXXXXX)',
  })
  phone?: string;

  @IsOptional()
  @SanitizePhone()
  @IsString({ message: 'WhatsApp number must be a string' })
  @IsSAPhoneNumber({
    message:
      'WhatsApp must be a valid South African mobile number (format: +27XXXXXXXXX or 0XXXXXXXXX)',
  })
  whatsapp?: string;

  @IsOptional()
  @IsEnum(PreferredContact)
  preferredContact?: PreferredContact;

  @IsOptional()
  @SanitizeIdNumber()
  @IsString({ message: 'ID number must be a string' })
  @IsSAIDNumber({
    message:
      'ID number must be a valid 13-digit South African ID number (Luhn checksum validated)',
  })
  idNumber?: string;

  @IsOptional()
  @SanitizeText()
  @IsString()
  address?: string;

  @IsOptional()
  @SanitizeText()
  @IsString()
  notes?: string;
}

export class UpdateParentDto extends PartialType(CreateParentDto) {}

export class ParentFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // TASK-DATA-004: Pagination parameters
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number;
}

// TASK-DATA-004: Pagination constants
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
