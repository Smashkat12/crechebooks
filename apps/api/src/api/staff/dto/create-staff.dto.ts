/**
 * API Create Staff DTO
 * TASK-ACCT-011: Simplified staff creation — admin provides basics,
 * staff complete banking/tax via self-service onboarding portal.
 *
 * Removed fields (now handled by staff self-service onboarding):
 * - employee_number (auto-generated)
 * - bank_account_number, bank_branch_code (staff provides via portal)
 * - tax_number (staff provides via portal)
 * - payment_method (staff provides via portal)
 * - status (always ACTIVE on creation)
 */

import {
  IsString,
  IsOptional,
  IsInt,
  IsEmail,
  IsEnum,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsSAIDNumber } from '../../../shared/validators';

/**
 * API DTO for creating staff - accepts snake_case from frontend.
 * Admin only needs to provide personal info and employment basics.
 */
export class ApiCreateStaffDto {
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
    example: 'jane@example.com',
    description: 'Required for staff portal access (magic link login)',
  })
  @IsEmail({}, { message: 'A valid email address is required for staff portal access' })
  email!: string;

  @ApiPropertyOptional({ example: '+27821234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

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

  @ApiProperty({ example: 1500000, description: 'Monthly gross salary in cents' })
  @Type(() => Number)
  @IsInt({ message: 'Salary must be an integer (cents)' })
  @Min(0, { message: 'Salary cannot be negative' })
  salary!: number;

  @ApiPropertyOptional({
    example: 'PERMANENT',
    enum: ['PERMANENT', 'CONTRACT', 'PART_TIME'],
    description: 'Defaults to PERMANENT if not specified',
  })
  @IsOptional()
  @IsEnum(['PERMANENT', 'CONTRACT', 'PART_TIME'])
  employment_type?: 'PERMANENT' | 'CONTRACT' | 'PART_TIME';

  @ApiPropertyOptional({
    example: 'MONTHLY',
    enum: ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY'],
    description: 'Defaults to MONTHLY if not specified',
  })
  @IsOptional()
  @IsEnum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY'])
  pay_frequency?: 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY';

  @ApiPropertyOptional({ example: 'Teacher' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @ApiPropertyOptional({ example: 'Teaching' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
}
