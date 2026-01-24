import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';

// ============================================
// Request DTOs
// ============================================

export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by tenant ID' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

// ============================================
// Response DTOs
// ============================================

export class UserSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  tenantId?: string;

  @ApiPropertyOptional()
  tenantName?: string;
}

export class UserDetailDto extends UserSummaryDto {
  @ApiPropertyOptional()
  auth0Id?: string;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  currentTenantId?: string;
}

export class UserStatsDto {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  activeUsers: number;

  @ApiProperty()
  inactiveUsers: number;

  @ApiProperty()
  superAdmins: number;

  @ApiProperty()
  owners: number;

  @ApiProperty()
  admins: number;

  @ApiProperty()
  newThisMonth: number;
}

export class UsersListResponseDto {
  @ApiProperty({ type: [UserSummaryDto] })
  data: UserSummaryDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class UserActivityDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  resourceType: string;

  @ApiPropertyOptional()
  resourceId?: string;

  @ApiPropertyOptional()
  details?: string;

  @ApiProperty()
  createdAt: Date;
}

export class ImpersonationResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  sessionToken?: string;
}
