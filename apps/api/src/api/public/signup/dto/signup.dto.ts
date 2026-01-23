import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SanitizeString, SanitizeEmail, SanitizeName } from '../../../../common/decorators';

export class SignupDto {
  @ApiProperty({
    description: 'Crèche/organization name',
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
    description: 'Admin user full name',
    example: 'Sarah Johnson',
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @SanitizeName()
  @Transform(({ value }) => value?.trim())
  adminName: string;

  @ApiProperty({
    description: 'Admin email address (will be used for login)',
    example: 'sarah@littlelearners.co.za',
    maxLength: 255,
  })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @SanitizeEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  adminEmail: string;

  @ApiProperty({
    description: 'Password (min 8 characters, must include uppercase, lowercase, number, and special character)',
    example: 'SecurePass123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    },
  )
  password: string;

  @ApiProperty({
    description: 'Contact phone number',
    example: '+27821234567',
    maxLength: 20,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) => value?.trim())
  phone: string;

  @ApiProperty({
    description: 'Physical address line 1',
    example: '123 Main Street',
    maxLength: 200,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  addressLine1: string;

  @ApiProperty({
    description: 'City',
    example: 'Johannesburg',
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @SanitizeString()
  @Transform(({ value }) => value?.trim())
  city: string;

  @ApiProperty({
    description: 'Province',
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
    description: 'Postal code',
    example: '2000',
    maxLength: 10,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  @Transform(({ value }) => value?.trim())
  postalCode: string;
}

export class SignupResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Trial activated! Check your email for login instructions.',
  })
  message: string;

  @ApiProperty({
    description: 'Created tenant ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Created user ID',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  userId: string;

  @ApiProperty({
    description: 'Trial expiration date',
    example: '2025-02-06T12:00:00.000Z',
  })
  trialExpiresAt: Date;
}
