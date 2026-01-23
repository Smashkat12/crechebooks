import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  SanitizeString,
  SanitizeEmail,
  SanitizePhone,
} from '../../../../common/decorators';

export class CreateContactDto {
  @ApiProperty({
    description: 'Full name of the person contacting us',
    example: 'John Smith',
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({
    description: 'Email address for response',
    example: 'john@example.com',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @SanitizeEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'Contact phone number (optional)',
    example: '+27821234567',
    maxLength: 20,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @SanitizePhone()
  @Transform(({ value }) => value?.trim())
  phone?: string;

  @ApiProperty({
    description: 'Subject of the inquiry',
    example: 'Question about pricing',
    maxLength: 200,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  subject: string;

  @ApiProperty({
    description: 'Message content',
    example: 'I would like to know more about your enterprise pricing options.',
    maxLength: 2000,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  message: string;
}

export class ContactResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Thank you for contacting us! We will respond within 24 hours.',
  })
  message: string;

  @ApiProperty({
    description: 'Submission ID for reference',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  submissionId: string;
}
