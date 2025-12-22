/**
 * Update Child DTO
 * TASK-BILL-034: Child Enrollment Endpoints
 *
 * @module api/billing/dto/update-child
 * @description DTO for updating child details.
 * Uses snake_case for API, converts to camelCase for service layer.
 *
 * CRITICAL: NO MOCK DATA - fail fast with detailed error logging.
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../../database/entities/child.entity';

/**
 * API-layer DTO for updating a child (all fields optional)
 */
export class UpdateChildDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ required: false, description: 'Child first name' })
  first_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @ApiProperty({ required: false, description: 'Child last name' })
  last_name?: string;

  @IsOptional()
  @IsEnum(Gender)
  @ApiProperty({ enum: Gender, required: false, description: 'Child gender' })
  gender?: Gender;

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
