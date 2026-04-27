import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsDateString,
  Matches,
} from 'class-validator';

// ============================================
// Request DTOs
// ============================================

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ description: 'Search in change summary' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by tenant ID' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'Filter by resource type (entity type)' })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({ description: 'Start date filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

// ============================================
// Response DTOs
// ============================================

export class AuditLogEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiPropertyOptional()
  userId?: string;

  @ApiProperty()
  entityType: string;

  @ApiProperty()
  entityId: string;

  @ApiProperty({ enum: AuditAction })
  action: AuditAction;

  @ApiPropertyOptional()
  changeSummary?: string;

  @ApiPropertyOptional()
  ipAddress?: string;

  @ApiProperty()
  createdAt: Date;

  // Joined fields
  @ApiPropertyOptional()
  user?: {
    name: string;
    email: string;
  };

  @ApiPropertyOptional()
  tenant?: {
    name: string;
  };
}

export class AuditLogStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  todayCount: number;

  @ApiProperty()
  thisWeekCount: number;

  @ApiProperty()
  thisMonthCount: number;

  @ApiProperty({ type: [Object] })
  topActions: { action: string; count: number }[];
}

export class AuditLogsListResponseDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  data: AuditLogEntryDto[];

  @ApiProperty()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// Export Query DTO
// ============================================

export class AuditLogExportQueryDto {
  @ApiProperty({
    description: 'Start date (YYYY-MM-DD, inclusive). Required.',
    example: '2025-01-01',
  })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @ApiProperty({
    description: 'End date (YYYY-MM-DD, inclusive). Required.',
    example: '2025-01-31',
  })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({ description: 'Filter by tenant ID' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'Filter by resource / entity type' })
  @IsOptional()
  @IsString()
  resourceType?: string;
}
