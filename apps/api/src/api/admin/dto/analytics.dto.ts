import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================
// Response DTOs
// ============================================

export class PlatformMetricsDto {
  @ApiProperty()
  totalTenants: number;

  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  totalChildren: number;

  @ApiProperty()
  totalInvoicedCents: number;

  @ApiProperty()
  totalTransactions: number;
}

export class TenantGrowthDto {
  @ApiProperty()
  month: string;

  @ApiProperty()
  newTenants: number;

  @ApiProperty()
  cumulativeTenants: number;
}

export class UserGrowthDto {
  @ApiProperty()
  month: string;

  @ApiProperty()
  newUsers: number;

  @ApiProperty()
  cumulativeUsers: number;
}

export class SubscriptionBreakdownDto {
  @ApiProperty()
  status: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}

export class TopTenantDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  childrenCount: number;

  @ApiProperty()
  userCount: number;

  @ApiPropertyOptional()
  subscriptionStatus?: string;
}

export class RecentActivityDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  tenantName?: string;

  @ApiPropertyOptional()
  userName?: string;

  @ApiProperty()
  createdAt: Date;
}
