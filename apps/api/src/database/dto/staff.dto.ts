/**
 * Staff DTOs
 * TASK-STAFF-002: Added SA-specific validation decorators
 * SEC-006: Added input sanitization decorators
 *
 * Validates:
 * - SA ID Number (13 digits with Luhn checksum)
 * - SA Phone Number (+27 or 0 prefix, mobile only)
 * - SA Tax Number (10 digits)
 * - SA Bank Branch Code (6 digits)
 * - SA Bank Account Number (6-16 digits)
 *
 * Sanitizes:
 * - Names: Strips HTML, normalizes whitespace
 * - Email: Converts to lowercase, trims
 * - Phone: Normalizes to +27 format
 * - ID/Tax Numbers: Removes non-digit characters
 * - Bank Details: Removes non-digit characters
 */

import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsDate,
  IsEmail,
  IsBoolean,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { EmploymentType, PayFrequency } from '../entities/staff.entity';
import {
  IsSAIDNumber,
  IsSAPhoneNumber,
  IsSATaxNumber,
  IsSABranchCode,
  IsSABankAccount,
} from '../../shared/validators';
import {
  SanitizeName,
  SanitizeEmail,
  SanitizePhone,
  SanitizeIdNumber,
  SanitizeTaxNumber,
  SanitizeBankAccount,
  SanitizeBranchCode,
  SanitizeHtml,
} from '../../common/utils/sanitize.utils';

/**
 * DTO for creating a new staff member
 * Used when adding employees for payroll processing
 */
export class CreateStaffDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @SanitizeHtml()
  @IsString()
  @MaxLength(50)
  employeeNumber?: string;

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

  @SanitizeIdNumber()
  @IsString({ message: 'ID number must be a string' })
  @IsSAIDNumber({
    message:
      'ID number must be a valid 13-digit South African ID number (Luhn checksum validated)',
  })
  idNumber!: string;

  @IsOptional()
  @SanitizeTaxNumber()
  @IsString({ message: 'Tax number must be a string' })
  @IsSATaxNumber({
    message: 'Tax number must be a valid 10-digit South African tax number',
  })
  taxNumber?: string;

  @IsOptional()
  @SanitizeEmail()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @IsOptional()
  @SanitizePhone()
  @IsString({ message: 'Phone must be a string' })
  @IsSAPhoneNumber({
    message:
      'Phone must be a valid South African mobile number (format: +27XXXXXXXXX or 0XXXXXXXXX)',
  })
  phone?: string;

  @Type(() => Date)
  @IsDate()
  dateOfBirth!: Date;

  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @Type(() => Number)
  @IsInt({ message: 'Basic salary must be an integer (cents)' })
  @Min(0, { message: 'Basic salary cannot be negative' })
  basicSalaryCents!: number;

  @IsOptional()
  @SanitizeName()
  @IsString({ message: 'Bank name must be a string' })
  @MaxLength(100, { message: 'Bank name must not exceed 100 characters' })
  bankName?: string;

  @IsOptional()
  @SanitizeBankAccount()
  @IsString({ message: 'Bank account must be a string' })
  @IsSABankAccount({
    message:
      'Bank account must be a valid South African bank account number (6-16 digits)',
  })
  bankAccount?: string;

  @IsOptional()
  @SanitizeBranchCode()
  @IsString({ message: 'Bank branch code must be a string' })
  @IsSABranchCode({
    message:
      'Bank branch code must be a valid 6-digit South African branch code',
  })
  bankBranchCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Medical aid members must be an integer' })
  @Min(0, { message: 'Medical aid members cannot be negative' })
  medicalAidMembers?: number;
}

/**
 * DTO for updating an existing staff member
 * Extends CreateStaffDto with optional fields
 */
export class UpdateStaffDto extends PartialType(CreateStaffDto) {}

/**
 * DTO for filtering staff when querying
 */
export class StaffFilterDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsEnum(PayFrequency)
  payFrequency?: PayFrequency;

  @IsOptional()
  @IsString()
  search?: string; // Search by name, idNumber, employeeNumber
}
