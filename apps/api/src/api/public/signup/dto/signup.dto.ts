import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
  MinLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  SanitizeString,
  SanitizeEmail,
  SanitizeName,
} from '../../../../common/decorators';
import { normalizeName } from '../../../../common/utils/name-normalizer';

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

  /**
   * Canonical admin name field.
   * Required unless the legacy alias `fullName` is provided instead.
   */
  @ApiPropertyOptional({
    description: 'Admin user full name',
    example: 'Sarah Johnson',
    maxLength: 100,
  })
  @ValidateIf((o: SignupDto) => !o.fullName)
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @SanitizeName()
  @Transform(({ value }) => normalizeName(value))
  adminName?: string;

  /**
   * Legacy form alias for adminName — accepted to avoid forbidNonWhitelisted 400.
   * Service resolves: adminName ?? fullName.
   */
  @ApiPropertyOptional({
    description: 'Alias for adminName (legacy form field)',
    maxLength: 100,
  })
  @ValidateIf((o: SignupDto) => !o.adminName)
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @SanitizeName()
  @Transform(({ value }) => normalizeName(value))
  fullName?: string;

  /**
   * Canonical admin email field.
   * Required unless the legacy alias `email` is provided instead.
   */
  @ApiPropertyOptional({
    description: 'Admin email address (will be used for login)',
    example: 'sarah@littlelearners.co.za',
    maxLength: 255,
  })
  @ValidateIf((o: SignupDto) => !o.email)
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @SanitizeEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  adminEmail?: string;

  /**
   * Legacy form alias for adminEmail — accepted to avoid forbidNonWhitelisted 400.
   * Service resolves: adminEmail ?? email.
   */
  @ApiPropertyOptional({
    description: 'Alias for adminEmail (legacy form field)',
    maxLength: 255,
  })
  @ValidateIf((o: SignupDto) => !o.adminEmail)
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @SanitizeEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @ApiProperty({
    description:
      'Password (min 8 characters, must include uppercase, lowercase, number, and special character)',
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

  @ApiPropertyOptional({
    description:
      'Physical address line 1 (collected during onboarding if not provided)',
    example: '123 Main Street',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @SanitizeString()
  @Transform(({ value }) => value?.trim() || '')
  addressLine1?: string;

  @ApiPropertyOptional({
    description: 'City (collected during onboarding if not provided)',
    example: 'Johannesburg',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @SanitizeString()
  @Transform(({ value }) => value?.trim() || '')
  city?: string;

  @ApiPropertyOptional({
    description: 'Province',
    example: 'Gauteng',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @SanitizeString()
  @Transform(({ value }) => value?.trim() || '')
  province?: string;

  @ApiPropertyOptional({
    description: 'Postal code (collected during onboarding if not provided)',
    example: '2000',
    maxLength: 10,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(({ value }) => value?.trim() || '')
  postalCode?: string;

  // ---------- Optional metadata fields (from form, stored/logged but not required) ----------

  @ApiPropertyOptional({
    description: 'Number of children range selected in signup form',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  numberOfChildren?: string;

  @ApiPropertyOptional({ description: 'Marketing consent flag' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => Boolean(value))
  marketingOptIn?: boolean;

  @ApiPropertyOptional({ description: 'Alias for marketingOptIn' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => Boolean(value))
  marketingConsent?: boolean;

  @ApiPropertyOptional({ description: 'Terms acceptance flag' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => Boolean(value))
  acceptTerms?: boolean;

  @ApiPropertyOptional({ description: 'Alias for acceptTerms' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => Boolean(value))
  termsAccepted?: boolean;
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
