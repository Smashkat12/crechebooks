/**
 * Enroll Child DTOs
 * TASK-BILL-034: Child Enrollment Endpoints
 *
 * @module api/billing/dto/enroll-child
 * @description API-layer DTOs for child enrollment operations.
 * Uses snake_case for API, converts to camelCase for service layer.
 *
 * CRITICAL: NO MOCK DATA - fail fast with detailed error logging.
 */

import {
  IsString,
  IsUUID,
  IsOptional,
  IsEnum,
  IsISO8601,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../../database/entities/child.entity';

/**
 * API-layer DTO for enrolling a new child (snake_case)
 */
export class EnrollChildDto {
  @IsUUID()
  @ApiProperty({ description: 'Parent UUID' })
  parent_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ description: 'Child first name' })
  first_name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ description: 'Child last name' })
  last_name!: string;

  @IsISO8601({ strict: true })
  @ApiProperty({
    example: '2020-05-15',
    description: 'Date of birth (YYYY-MM-DD)',
  })
  date_of_birth!: string;

  @IsOptional()
  @IsEnum(Gender)
  @ApiProperty({ enum: Gender, required: false, description: 'Child gender' })
  gender?: Gender;

  @IsUUID()
  @ApiProperty({ description: 'Fee structure UUID' })
  fee_structure_id!: string;

  @IsISO8601({ strict: true })
  @ApiProperty({
    example: '2025-02-01',
    description: 'Enrollment start date (YYYY-MM-DD)',
  })
  start_date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiProperty({ required: false, description: 'Medical notes or allergies' })
  medical_notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ required: false, description: 'Emergency contact name' })
  emergency_contact?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'emergency_phone must be a valid E.164 phone number',
  })
  @ApiProperty({
    required: false,
    example: '+27821234567',
    description: 'Emergency contact phone (E.164 format)',
  })
  emergency_phone?: string;
}

/**
 * Child summary in enrollment response
 */
export class ChildSummaryEnrollDto {
  @ApiProperty({ description: 'Child UUID' })
  id!: string;

  @ApiProperty({ description: 'Child first name' })
  first_name!: string;

  @ApiProperty({ description: 'Child last name' })
  last_name!: string;
}

/**
 * Fee structure summary in enrollment response
 */
export class FeeStructureSummaryDto {
  @ApiProperty({ description: 'Fee structure UUID' })
  id!: string;

  @ApiProperty({ description: 'Fee structure name' })
  name!: string;

  @ApiProperty({ description: 'Monthly fee amount in Rands' })
  amount!: number;
}

/**
 * Enrollment summary in response
 */
export class EnrollmentSummaryDto {
  @ApiProperty({ description: 'Enrollment UUID' })
  id!: string;

  @ApiProperty({
    type: FeeStructureSummaryDto,
    description: 'Fee structure details',
  })
  fee_structure!: FeeStructureSummaryDto;

  @ApiProperty({ description: 'Enrollment start date (YYYY-MM-DD)' })
  start_date!: string;

  @ApiProperty({
    required: false,
    description: 'Enrollment end date (YYYY-MM-DD)',
  })
  end_date?: string;

  @ApiProperty({ description: 'Enrollment status' })
  status!: string;
}

/**
 * Invoice summary in enrollment response (TASK-BILL-023)
 */
export class EnrollmentInvoiceSummaryDto {
  @ApiProperty({ description: 'Invoice UUID' })
  id!: string;

  @ApiProperty({ description: 'Invoice number (INV-YYYY-NNNNN)' })
  invoice_number!: string;

  @ApiProperty({ description: 'Total amount in Rands' })
  total!: number;

  @ApiProperty({ description: 'Due date (YYYY-MM-DD)' })
  due_date!: string;

  @ApiProperty({ description: 'Invoice status' })
  status!: string;
}

/**
 * Enrolled data structure
 */
export class EnrollChildDataDto {
  @ApiProperty({ type: ChildSummaryEnrollDto, description: 'Child summary' })
  child!: ChildSummaryEnrollDto;

  @ApiProperty({
    type: EnrollmentSummaryDto,
    description: 'Enrollment details',
  })
  enrollment!: EnrollmentSummaryDto;

  @ApiProperty({
    type: EnrollmentInvoiceSummaryDto,
    required: false,
    nullable: true,
    description: 'Enrollment invoice (if created successfully)',
  })
  invoice?: EnrollmentInvoiceSummaryDto | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Error message if invoice creation failed (enrollment still succeeded)',
  })
  invoice_error?: string | null;

  @ApiProperty({
    description: 'Whether welcome pack email was sent successfully',
  })
  welcome_pack_sent!: boolean;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Error message if welcome pack delivery failed (enrollment still succeeded)',
  })
  welcome_pack_error?: string | null;
}

/**
 * Response DTO for enroll child endpoint
 */
export class EnrollChildResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success!: boolean;

  @ApiProperty({
    type: EnrollChildDataDto,
    description: 'Enrolled child and enrollment details',
  })
  data!: EnrollChildDataDto;
}
