/**
 * API Create Staff DTO
 * TASK-STAFF-002: Added SA-specific validation decorators
 *
 * Validates:
 * - SA ID Number (13 digits with Luhn checksum)
 * - SA Tax Number (10 digits)
 * - SA Bank Branch Code (6 digits)
 * - SA Bank Account Number (6-16 digits)
 */

import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsSAIDNumber,
  IsSATaxNumber,
  IsSABranchCode,
  IsSABankAccount,
} from '../../../shared/validators';

/**
 * API DTO for creating staff - accepts snake_case from frontend
 */
export class ApiCreateStaffDto {
  @ApiPropertyOptional({ example: 'EMP001' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  employee_number?: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  first_name!: string;

  @ApiProperty({ example: 'Mokgadi' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  last_name!: string;

  @ApiProperty({
    example: '8001015009087',
    description: 'South African ID number (13 digits, Luhn validated)',
  })
  @IsString({ message: 'ID number must be a string' })
  @IsSAIDNumber({
    message:
      'ID number must be a valid 13-digit South African ID number (Luhn checksum validated)',
  })
  id_number!: string;

  @ApiPropertyOptional({
    example: '1234567890',
    description: 'South African tax reference number (10 digits)',
  })
  @IsOptional()
  @IsString({ message: 'Tax number must be a string' })
  @IsSATaxNumber({
    message: 'Tax number must be a valid 10-digit South African tax number',
  })
  tax_number?: string;

  @ApiProperty({ example: '1992-02-20' })
  @IsString()
  date_of_birth!: string;

  @ApiProperty({ example: '2026-01-05' })
  @IsString()
  start_date!: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  end_date?: string;

  @ApiProperty({ example: 1500000, description: 'Salary in cents' })
  @Type(() => Number)
  @IsInt({ message: 'Salary must be an integer (cents)' })
  @Min(0, { message: 'Salary cannot be negative' })
  salary!: number;

  @ApiProperty({ example: 'EFT', enum: ['EFT', 'CASH'] })
  @IsEnum(['EFT', 'CASH'])
  payment_method!: 'EFT' | 'CASH';

  @ApiPropertyOptional({
    example: '1234567890',
    description: 'South African bank account number (6-16 digits)',
  })
  @IsOptional()
  @IsString({ message: 'Bank account number must be a string' })
  @IsSABankAccount({
    message:
      'Bank account number must be a valid South African bank account (6-16 digits)',
  })
  bank_account_number?: string;

  @ApiPropertyOptional({
    example: '250655',
    description: 'South African bank branch code (6 digits)',
  })
  @IsOptional()
  @IsString({ message: 'Bank branch code must be a string' })
  @IsSABranchCode({
    message:
      'Bank branch code must be a valid 6-digit South African branch code',
  })
  bank_branch_code?: string;

  @ApiProperty({
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'],
  })
  @IsEnum(['ACTIVE', 'INACTIVE', 'TERMINATED'])
  status!: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
}
