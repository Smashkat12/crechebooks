/**
 * TASK-ADMIN-001: AWS SSO-Style Tenant Switching
 * DTOs for impersonation endpoints
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

// Available roles for impersonation (excludes SUPER_ADMIN)
export const IMPERSONATION_ROLES = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.ACCOUNTANT,
  UserRole.VIEWER,
] as const;

export type ImpersonationRole = (typeof IMPERSONATION_ROLES)[number];

export class TenantForImpersonationDto {
  @ApiProperty({ description: 'Tenant ID' })
  id: string;

  @ApiProperty({ description: 'Tenant name' })
  name: string;

  @ApiPropertyOptional({ description: 'Tenant trading name' })
  tradingName?: string;

  @ApiProperty({ description: 'Tenant email' })
  email: string;

  @ApiProperty({ description: 'Subscription status' })
  subscriptionStatus: string;

  @ApiProperty({ description: 'Available roles to assume', type: [String] })
  availableRoles: ImpersonationRole[];

  @ApiProperty({ description: 'Number of users in tenant' })
  userCount: number;

  @ApiProperty({ description: 'Number of children enrolled' })
  childCount: number;
}

export class TenantsForImpersonationResponseDto {
  @ApiProperty({ type: [TenantForImpersonationDto] })
  tenants: TenantForImpersonationDto[];

  @ApiProperty()
  total: number;
}

export class StartImpersonationDto {
  @ApiProperty({ description: 'Target tenant ID to impersonate' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({
    description: 'Role to assume within the tenant',
    enum: IMPERSONATION_ROLES,
  })
  @IsEnum(IMPERSONATION_ROLES, {
    message: `Role must be one of: ${IMPERSONATION_ROLES.join(', ')}`,
  })
  role: ImpersonationRole;

  @ApiPropertyOptional({
    description: 'Reason for impersonation (audit purposes)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ImpersonationSessionDto {
  @ApiProperty({ description: 'Session ID' })
  id: string;

  @ApiProperty({ description: 'Super admin user ID' })
  superAdminId: string;

  @ApiProperty({ description: 'Target tenant ID' })
  targetTenantId: string;

  @ApiProperty({ description: 'Target tenant name' })
  tenantName: string;

  @ApiProperty({ description: 'Assumed role' })
  assumedRole: ImpersonationRole;

  @ApiProperty({ description: 'Session start time' })
  startedAt: Date;

  @ApiPropertyOptional({ description: 'Session end time (if ended)' })
  endedAt?: Date;

  @ApiProperty({ description: 'Session expiration time' })
  expiresAt: Date;

  @ApiProperty({ description: 'Whether session is currently active' })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Reason for impersonation' })
  reason?: string;
}

export class ImpersonationResponseDto {
  @ApiProperty({ description: 'Whether impersonation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Status message' })
  message: string;

  @ApiProperty({ type: ImpersonationSessionDto })
  session: ImpersonationSessionDto;

  @ApiProperty({ description: 'Seconds until session expires' })
  expiresIn: number;
}

export class EndImpersonationResponseDto {
  @ApiProperty({ description: 'Whether session ended successfully' })
  success: boolean;

  @ApiProperty({ description: 'Status message' })
  message: string;

  @ApiPropertyOptional({ description: 'Ended session details' })
  session?: ImpersonationSessionDto;
}

export class CurrentImpersonationResponseDto {
  @ApiProperty({ description: 'Whether currently impersonating' })
  isImpersonating: boolean;

  @ApiPropertyOptional({ type: ImpersonationSessionDto })
  session?: ImpersonationSessionDto;

  @ApiPropertyOptional({ description: 'Seconds remaining in session' })
  timeRemaining?: number;
}

export class ImpersonationSessionHistoryDto {
  @ApiProperty({ type: [ImpersonationSessionDto] })
  sessions: ImpersonationSessionDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}

export class ListImpersonationSessionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by tenant ID' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}
