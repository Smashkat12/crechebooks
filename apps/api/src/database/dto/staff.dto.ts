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
  Length,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { EmploymentType, PayFrequency } from '../entities/staff.entity';

/**
 * DTO for creating a new staff member
 * Used when adding employees for payroll processing
 */
export class CreateStaffDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @Length(13, 13) // South African ID number is exactly 13 digits
  idNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
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

  @IsInt()
  @Min(0)
  basicSalaryCents!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankAccount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  bankBranchCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
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
