/**
 * Parent Authentication DTOs
 * TASK-PORTAL-011: Parent Portal Magic Link Authentication
 *
 * DTOs for parent magic link login flow:
 * 1. Parent requests magic link with email
 * 2. System sends email with token (15min expiry)
 * 3. Parent clicks link, token is verified
 * 4. Session token is returned for subsequent requests
 */

import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request magic link for parent login
 */
export class ParentMagicLinkRequestDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @ApiProperty({
    example: 'parent@example.com',
    description: 'Email address registered with the creche',
  })
  email: string;
}

/**
 * Verify magic link token
 */
export class ParentMagicLinkVerifyDto {
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Magic link token from email',
  })
  token: string;
}

/**
 * Response after successful magic link request
 */
export class ParentMagicLinkResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the magic link was sent successfully',
  })
  success: boolean;

  @ApiProperty({
    example:
      'If this email is registered, you will receive a magic link shortly',
    description: 'Generic message (does not reveal if email exists)',
  })
  message: string;
}

/**
 * Parent user info returned after successful verification
 */
export class ParentUserDto {
  @ApiProperty({ example: 'uuid-123' })
  id: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email: string;

  @ApiPropertyOptional({ example: '+27123456789' })
  phone?: string;
}

/**
 * Response after successful magic link verification
 */
export class ParentVerifyResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Session token for authenticated requests',
  })
  sessionToken: string;

  @ApiProperty({
    example: 86400,
    description: 'Session token expiry in seconds',
  })
  expiresIn: number;

  @ApiProperty({
    type: ParentUserDto,
    description: 'Authenticated parent information',
  })
  parent: ParentUserDto;
}

/**
 * Response after logout
 */
export class ParentLogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Logged out successfully' })
  message: string;
}

/**
 * Current parent session (for /me endpoint)
 */
export class ParentMeResponseDto extends ParentUserDto {
  @ApiProperty({ example: 'tenant-uuid-123' })
  tenantId: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Number of enrolled children',
  })
  childrenCount?: number;
}
