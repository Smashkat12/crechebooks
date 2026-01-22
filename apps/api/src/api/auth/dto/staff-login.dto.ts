/**
 * Staff Authentication DTOs
 * TASK-PORTAL-021: Staff Portal Layout and Authentication
 *
 * DTOs for staff magic link login flow:
 * 1. Staff requests magic link with work email
 * 2. System sends email with token (15min expiry)
 * 3. Staff clicks link, token is verified
 * 4. Session token is returned for subsequent requests
 */

import { IsEmail, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request magic link for staff login
 */
export class StaffLoginRequestDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @ApiProperty({
    example: 'staff@creche.com',
    description: 'Work email address registered with the employer',
  })
  email: string;
}

/**
 * Verify magic link token
 */
export class StaffVerifyRequestDto {
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
export class StaffLoginResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the magic link was sent successfully',
  })
  success: boolean;

  @ApiProperty({
    example: 'If this email is registered, you will receive a magic link shortly',
    description: 'Generic message (does not reveal if email exists)',
  })
  message: string;
}

/**
 * Staff user info returned after successful verification
 */
export class StaffUserDto {
  @ApiProperty({ example: 'uuid-123' })
  id: string;

  @ApiProperty({ example: 'Jane' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({ example: 'jane.doe@creche.com' })
  email: string;

  @ApiPropertyOptional({ example: 'SP12345' })
  simplePayEmployeeId?: string;

  @ApiPropertyOptional({ example: 'Teacher' })
  position?: string;

  @ApiPropertyOptional({ example: 'Education' })
  department?: string;
}

/**
 * Response after successful magic link verification
 */
export class StaffVerifyResponseDto {
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
    type: StaffUserDto,
    description: 'Authenticated staff information',
  })
  staff: StaffUserDto;
}

/**
 * Response after logout
 */
export class StaffLogoutResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Logged out successfully' })
  message: string;
}

/**
 * Current staff session (for /session endpoint)
 */
export class StaffSessionDto extends StaffUserDto {
  @ApiProperty({ example: 'tenant-uuid-123' })
  tenantId: string;

  @ApiPropertyOptional({ example: 'FULL_TIME', description: 'Employment type' })
  employmentType?: string;

  @ApiPropertyOptional({ example: '2020-01-15', description: 'Start date with employer' })
  startDate?: string;
}

/**
 * Staff session payload stored in JWT
 */
export interface StaffSessionPayload {
  sub: string; // Staff ID
  email: string;
  tenantId: string;
  simplePayEmployeeId?: string;
  type: 'staff_session';
}

/**
 * Staff magic link payload stored in JWT
 */
export interface StaffMagicLinkPayload {
  sub: string; // Staff ID
  email: string;
  tenantId: string;
  type: 'staff_magic_link';
}
