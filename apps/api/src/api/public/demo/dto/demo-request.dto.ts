import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  SanitizeString,
  SanitizeEmail,
  SanitizePhone,
} from '../../../../common/decorators';

export enum PreferredTimeSlot {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
  EVENING = 'EVENING',
  ANYTIME = 'ANYTIME',
}

export class CreateDemoRequestDto {
  @ApiProperty({
    description: 'Full name of the person requesting the demo',
    example: 'Sarah Johnson',
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @ApiProperty({
    description: 'Email address for demo scheduling',
    example: 'sarah@littlelearners.co.za',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @SanitizeEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'Contact phone number',
    example: '+27821234567',
    maxLength: 20,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  @SanitizePhone()
  @Transform(({ value }) => value?.trim())
  phone: string;

  @ApiProperty({
    description: 'Name of the crèche/daycare',
    example: 'Little Learners Daycare',
    maxLength: 200,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  crecheName: string;

  @ApiProperty({
    description: 'Number of children currently enrolled',
    example: 45,
    minimum: 1,
    maximum: 1000,
  })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  childrenCount: number;

  @ApiProperty({
    description: 'Province where the crèche is located',
    example: 'Gauteng',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  province: string;

  @ApiProperty({
    description: 'Current software being used (if any)',
    example: 'Excel spreadsheets',
    maxLength: 200,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  currentSoftware?: string;

  @ApiProperty({
    description: 'Current challenges faced with bookkeeping/management',
    example: ['Manual invoicing', 'Tracking payments', 'SARS compliance'],
    isArray: true,
    type: [String],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'string' ? v.trim() : v));
    }
    return [];
  })
  challenges?: string[];

  @ApiProperty({
    description: 'Preferred time for demo call',
    enum: PreferredTimeSlot,
    example: PreferredTimeSlot.AFTERNOON,
    required: false,
  })
  @IsOptional()
  @IsEnum(PreferredTimeSlot)
  preferredTime?: PreferredTimeSlot;

  @ApiProperty({
    description: 'Consent to receive marketing communications',
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  @Type(() => Boolean)
  marketingConsent: boolean;
}

export class DemoRequestResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example:
      'Demo request received! Our team will contact you within 24 hours.',
  })
  message: string;

  @ApiProperty({
    description: 'Demo request ID for reference',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  requestId: string;
}
