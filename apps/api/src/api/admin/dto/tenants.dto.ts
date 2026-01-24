import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import {
  IsString,
  IsEmail,
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

export class ListTenantsQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

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

export class CreateTenantDto {
  @ApiProperty({ description: 'Organization name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Organization email' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Owner full name' })
  @IsString()
  ownerName: string;

  @ApiProperty({ description: 'Owner email address' })
  @IsEmail()
  ownerEmail: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus, default: 'TRIAL' })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionPlan?: SubscriptionStatus;
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ description: 'Organization name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Organization email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;
}

export class SuspendTenantDto {
  @ApiPropertyOptional({ description: 'Reason for suspension' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ============================================
// Response DTOs
// ============================================

export class TenantSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiProperty({ enum: SubscriptionStatus })
  subscriptionStatus: SubscriptionStatus;

  @ApiPropertyOptional()
  trialExpiresAt?: Date;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  userCount: number;

  @ApiProperty()
  childrenCount: number;

  @ApiProperty()
  createdAt: Date;
}

export class TenantDetailDto extends TenantSummaryDto {
  @ApiPropertyOptional()
  tradingName?: string;

  @ApiPropertyOptional()
  registrationNumber?: string;

  @ApiPropertyOptional()
  vatNumber?: string;

  @ApiPropertyOptional()
  addressLine1?: string;

  @ApiPropertyOptional()
  city?: string;

  @ApiPropertyOptional()
  province?: string;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional()
  xeroConnectedAt?: Date;

  @ApiPropertyOptional()
  ownerName?: string;

  @ApiPropertyOptional()
  ownerEmail?: string;
}

export class TenantStatsDto {
  @ApiProperty()
  totalTenants: number;

  @ApiProperty()
  activeTenants: number;

  @ApiProperty()
  trialTenants: number;

  @ApiProperty()
  suspendedTenants: number;

  @ApiProperty()
  newThisMonth: number;
}

export class TenantsListResponseDto {
  @ApiProperty({ type: [TenantSummaryDto] })
  data: TenantSummaryDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
